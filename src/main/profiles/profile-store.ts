import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

import type {
  ProfileDocument,
  ProfileDomain,
  ProfileDraft,
  ProfileStateDocument,
} from "../../shared/hid.js";
import { profileDomainKey } from "../../shared/hid.js";
import { normalizeApplicationMappings } from "../../shared/profile-mappings.js";

import {
  parseProfileDocument,
  parseStateDocument,
  profileDraftSchema,
} from "./profile-schema.js";

const DEVICE_DIRECTORY_PREFIX = "device-";
const PROFILE_FILE = /^([a-z0-9][a-z0-9_-]*)\.yaml$/;
const settingsSchema = z.object({
  version: z.literal(1),
  keyboards: z.record(
    z.string(),
    z.object({ activeProfile: z.string().optional() }).passthrough(),
  ).default({}),
}).passthrough();

export interface StoredProfiles {
  document: ProfileDocument;
  state: ProfileStateDocument;
  warnings: string[];
}

interface ProfileMigration {
  file: string;
  normalized: ProfileDraft;
  original: string;
}

export class ProfileStore {
  constructor(
    readonly rootDirectory: string,
    private readonly defaultConfigDirectory?: string,
  ) {}

  async load(): Promise<StoredProfiles> {
    await this.installDefaultsIfFresh();
    const document: ProfileDocument = { version: 1, keyboards: [] };
    const state: ProfileStateDocument = { version: 1, activeProfiles: {} };
    const migrations: ProfileMigration[] = [];
    const settingsText = await this.readOptional(this.settingsPath);
    const settings = settingsSchema.parse(
      settingsText ? parse(settingsText) : { version: 1, keyboards: {} },
    );
    const entries = await this.readRootEntries();
    for (const entry of entries) {
      const domain = entry.isDirectory() && entry.name.startsWith(DEVICE_DIRECTORY_PREFIX)
        ? entry.name.slice(DEVICE_DIRECTORY_PREFIX.length)
        : "";
      if (!domain) continue;
      assertProfileDomain(domain);
      const profiles = await this.readDomainProfiles(domain, entry.name, migrations);
      document.keyboards.push({ deviceId: domain, profiles });
      const active = settings.keyboards[profileDomainKey(domain)]?.activeProfile;
      if (active) state.activeProfiles[profileDomainKey(domain)] = active;
    }
    const parsedDocument = parseProfileDocument(document);
    const parsedState = parseStateDocument(state);
    const warnings = removeMissingActiveProfiles(parsedDocument, parsedState);
    await this.persistMigrations(migrations);
    return { document: parsedDocument, state: parsedState, warnings };
  }

  async persist(
    previous: ProfileDocument,
    document: ProfileDocument,
    state: ProfileStateDocument,
  ): Promise<void> {
    const domains = new Set([...previous.keyboards, ...document.keyboards].map(profileDomain));
    const originals = new Map<string, string | undefined>();
    try {
      const settingsText = await this.readOptional(this.settingsPath);
      originals.set(this.settingsPath, settingsText);
      const settings = settingsSchema.parse(
        settingsText ? parse(settingsText) : { version: 1, keyboards: {} },
      );
      for (const domain of domains) {
        await this.persistDomain(domain, previous, document, originals);
        const key = profileDomainKey(domain);
        const activeProfile = state.activeProfiles[key];
        settings.keyboards[key] = {
          ...(settings.keyboards[key] ?? {}),
          ...(activeProfile ? { activeProfile } : {}),
        };
        if (!activeProfile) delete settings.keyboards[key].activeProfile;
      }
      await this.writeAtomic(this.settingsPath, stringify(settings));
    } catch (error) {
      for (const [file, contents] of originals)
        await this.restore(file, contents);
      throw error;
    }
  }

  private get settingsPath(): string {
    return path.join(path.dirname(this.rootDirectory), "settings.yaml");
  }

  private async readRootEntries() {
    try {
      return await readdir(this.rootDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async readDomainProfiles(
    domain: string,
    directoryName: string,
    migrations: ProfileMigration[],
  ): Promise<ProfileDraft[]> {
    const directory = path.join(this.rootDirectory, directoryName);
    const files = await readdir(directory, { withFileTypes: true });
    const profiles: ProfileDraft[] = [];
    for (const file of files) {
      const match = file.isFile() && file.name !== "state.yaml"
        ? PROFILE_FILE.exec(file.name)
        : null;
      if (!match) continue;
      const profilePath = path.join(directory, file.name);
      const original = await readFile(profilePath, "utf8");
      const parsed = profileDraftSchema.parse(parse(original));
      const profile = normalizeApplicationMappings(parsed);
      if (profile.id !== match[1])
        throw new Error(`${file.name}: profile id must match its filename`);
      if (JSON.stringify(parsed) !== JSON.stringify(profile))
        migrations.push({ file: profilePath, normalized: profile, original });
      profiles.push(profile);
    }
    return profiles;
  }

  private async persistDomain(
    domain: ProfileDomain,
    previous: ProfileDocument,
    document: ProfileDocument,
    originals: Map<string, string | undefined>,
  ): Promise<void> {
    const oldProfiles = previous.keyboards.find((entry) => entry.deviceId === domain)?.profiles ?? [];
    const newProfiles = document.keyboards.find((entry) => entry.deviceId === domain)?.profiles ?? [];
    const ids = new Set([...oldProfiles, ...newProfiles].map(({ id }) => id));
    for (const id of ids) {
      const file = path.join(this.rootDirectory, `${DEVICE_DIRECTORY_PREFIX}${domain}`, `${id}.yaml`);
      originals.set(file, await this.readOptional(file));
      const profile = newProfiles.find((entry) => entry.id === id);
      if (profile) await this.writeAtomic(file, stringify(profile));
      else await unlinkIfPresent(file);
    }
  }

  private async installDefaultsIfFresh(): Promise<void> {
    if (!this.defaultConfigDirectory) return;
    const [settings, profiles] = await Promise.all([
      this.readOptional(this.settingsPath),
      readdir(this.rootDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      }),
    ]);
    if (settings !== undefined || profiles !== undefined) return;
    await mkdir(this.rootDirectory, { recursive: true });
    const defaults = await readFile(
      path.join(this.defaultConfigDirectory, "settings.yaml"),
      "utf8",
    );
    await this.writeAtomic(this.settingsPath, defaults);
  }

  private async persistMigrations(migrations: ProfileMigration[]): Promise<void> {
    const written: ProfileMigration[] = [];
    try {
      for (const migration of migrations) {
        await this.writeAtomic(migration.file, stringify(migration.normalized));
        written.push(migration);
      }
    } catch (error) {
      for (const migration of written.reverse())
        await this.writeAtomic(migration.file, migration.original).catch(() => undefined);
      throw error;
    }
  }

  private async readOptional(file: string): Promise<string | undefined> {
    try { return await readFile(file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeAtomic(file: string, contents: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  }

  private async restore(file: string, contents: string | undefined): Promise<void> {
    if (contents === undefined) await unlinkIfPresent(file);
    else await this.writeAtomic(file, contents);
  }
}

function removeMissingActiveProfiles(
  document: ProfileDocument,
  state: ProfileStateDocument,
): string[] {
  const warnings: string[] = [];
  for (const [key, profileId] of Object.entries(state.activeProfiles)) {
    const keyboard = document.keyboards.find((entry) => profileDomainKey(entry.deviceId) === key);
    if (keyboard?.profiles.some(({ id }) => id === profileId)) continue;
    delete state.activeProfiles[key];
    warnings.push(`Active profile ${profileId} does not exist for profile domain ${key}`);
  }
  return warnings;
}

function assertProfileDomain(domain: ProfileDomain): void {
  if (domain === "." || domain === ".." || !domain || /[\\/\0]/u.test(domain))
    throw new Error(`Invalid device name: ${domain}`);
}

function profileDomain(keyboard: ProfileDocument["keyboards"][number]): ProfileDomain {
  return keyboard.deviceId;
}

async function unlinkIfPresent(file: string): Promise<void> {
  await unlink(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

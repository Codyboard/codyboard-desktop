import { EventEmitter } from "node:events";
import { cp, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

import type {
  CompiledProfileSet,
  NativeError,
  ProfileDocument,
  ProfileDraft,
  ProfileEvent,
  ProfilesSnapshot,
  ProfileStateDocument,
} from "../shared/hid.js";

import { compileProfiles, parseProfileDocument, parseStateDocument, profileDraftSchema, validateActiveProfiles } from "./profile-schema.js";

export interface ProfileRuntimeClient {
  replaceProfiles(snapshot: CompiledProfileSet): Promise<{
    generation: number;
    listening: boolean;
  }>;
}

const EMPTY_PROFILES: ProfileDocument = { version: 1, keyboards: [] };
const EMPTY_STATE: ProfileStateDocument = { version: 1, activeProfiles: {} };
const TYPE_DIRECTORY = /^hid-(\d+)$/;
const PROFILE_FILE = /^([a-z0-9][a-z0-9_-]*)\.yaml$/;
const settingsSchema = z.object({
  version: z.literal(1),
  keyboards: z.record(z.string(), z.object({ activeProfile: z.string().optional() }).passthrough()).default({})
}).passthrough();
const clone = <T>(value: T): T => structuredClone(value);

/** Cold-path configuration owner. The Swift daemon receives compiled snapshots. */
export class ProfileCoordinator extends EventEmitter {
  private document: ProfileDocument = clone(EMPTY_PROFILES);
  private state: ProfileStateDocument = clone(EMPTY_STATE);
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly runtime: ProfileRuntimeClient,
    readonly rootDirectory = path.join(homedir(), ".codyboard", "profiles"),
    private readonly defaultConfigDirectory?: string
  ) { super(); }

  private get settingsPath(): string { return path.join(path.dirname(this.rootDirectory), "settings.yaml"); }

  load(): Promise<ProfilesSnapshot> { return this.enqueue(() => this.loadFromDisk()); }
  reload(): Promise<ProfilesSnapshot> { return this.enqueue(() => this.loadFromDisk()); }

  snapshot(): ProfilesSnapshot {
    const keyboards: ProfilesSnapshot["keyboards"] = {};
    for (const keyboard of this.document.keyboards) {
      const profiles = clone(keyboard.profiles);
      const activeId = this.state.activeProfiles[String(keyboard.type)];
      keyboards[String(keyboard.type)] = { profiles, activeProfile: profiles.find(({ id }) => id === activeId) };
    }
    return { generation: this.generation, keyboards };
  }

  create(keyboardType: number, draft: ProfileDraft): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      this.assertKeyboardType(keyboardType);
      const profile = profileDraftSchema.parse(draft) as ProfileDraft;
      let keyboard = document.keyboards.find(({ type }) => type === keyboardType);
      if (!keyboard) {
        keyboard = { type: keyboardType, profiles: [] };
        document.keyboards.push(keyboard);
      }
      if (keyboard.profiles.some(({ id }) => id === profile.id)) throw new Error(`Profile already exists: ${profile.id}`);
      const first = keyboard.profiles.length === 0;
      keyboard.profiles.push(profile);
      if (first) state.activeProfiles[String(keyboardType)] = profile.id;
    });
  }

  update(keyboardType: number, profileId: string, draft: ProfileDraft): Promise<ProfilesSnapshot> {
    return this.mutate((document) => {
      this.assertKeyboardType(keyboardType);
      if (draft.id !== profileId) throw new Error("Profile id cannot be changed by update");
      const profile = profileDraftSchema.parse(draft) as ProfileDraft;
      const keyboard = document.keyboards.find(({ type }) => type === keyboardType);
      const index = keyboard?.profiles.findIndex(({ id }) => id === profileId) ?? -1;
      if (!keyboard || index < 0) throw new Error(`Profile not found: ${profileId}`);
      keyboard.profiles[index] = profile;
    });
  }

  remove(keyboardType: number, profileId: string): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      this.assertKeyboardType(keyboardType);
      const keyboard = document.keyboards.find(({ type }) => type === keyboardType);
      if (!keyboard) throw new Error(`Keyboard type not found: ${keyboardType}`);
      const index = keyboard.profiles.findIndex(({ id }) => id === profileId);
      if (index < 0) throw new Error(`Profile not found: ${profileId}`);
      keyboard.profiles.splice(index, 1);
      if (state.activeProfiles[String(keyboardType)] === profileId) delete state.activeProfiles[String(keyboardType)];
    });
  }

  activate(keyboardType: number, profileId: string): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      this.assertKeyboardType(keyboardType);
      const keyboard = document.keyboards.find(({ type }) => type === keyboardType);
      if (!keyboard?.profiles.some(({ id }) => id === profileId)) throw new Error(`Profile not found: ${profileId}`);
      // One scalar per type makes multiple active profiles unrepresentable.
      state.activeProfiles[String(keyboardType)] = profileId;
    });
  }

  deactivate(keyboardType: number): Promise<ProfilesSnapshot> {
    return this.mutate((_document, state) => {
      this.assertKeyboardType(keyboardType);
      delete state.activeProfiles[String(keyboardType)];
    });
  }

  private mutate(mutator: (document: ProfileDocument, state: ProfileStateDocument) => void): Promise<ProfilesSnapshot> {
    return this.enqueue(async () => {
      const document = clone(this.document);
      const state = clone(this.state);
      mutator(document, state);
      return this.commit(document, state, true);
    });
  }

  private async loadFromDisk(): Promise<ProfilesSnapshot> {
    try {
      await this.installDefaultsIfFresh();
      const document = clone(EMPTY_PROFILES);
      const state = clone(EMPTY_STATE);
      const settingsText = await this.readOptional(this.settingsPath);
      const settings = settingsSchema.parse(settingsText ? parse(settingsText) : { version: 1, keyboards: {} });
      let entries;
      try { entries = await readdir(this.rootDirectory, { withFileTypes: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.commit(document, state, false);
        throw error;
      }

      for (const entry of entries) {
        const match = entry.isDirectory() ? (TYPE_DIRECTORY.exec(entry.name)) : null;
        if (!match) continue;
        const keyboardType = Number(match[1]);
        const directory = path.join(this.rootDirectory, entry.name);
        const files = await readdir(directory, { withFileTypes: true });
        const profiles: ProfileDraft[] = [];
        for (const file of files) {
          const profileMatch = file.isFile() && file.name !== "state.yaml" ? (PROFILE_FILE.exec(file.name)) : null;
          if (!profileMatch) continue;
          const profile = profileDraftSchema.parse(parse(await readFile(path.join(directory, file.name), "utf8"))) as ProfileDraft;
          if (profile.id !== profileMatch[1]) throw new Error(`${file.name}: profile id must match its filename`);
          profiles.push(profile);
        }
        document.keyboards.push({ type: keyboardType, profiles });
        const activeProfile = settings.keyboards[String(keyboardType)]?.activeProfile;
        if (activeProfile) state.activeProfiles[String(keyboardType)] = activeProfile;
      }

      const parsedDocument = parseProfileDocument(document);
      const parsedState = parseStateDocument(state);
      for (const message of validateActiveProfiles(parsedDocument, parsedState)) {
        const match = /keyboard type (\d+)$/.exec(message);
        if (match) delete parsedState.activeProfiles[match[1]];
        this.emitConfigurationError(message);
      }
      return await this.commit(parsedDocument, parsedState, false);
    } catch (error) {
      this.emitConfigurationError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async commit(documentInput: ProfileDocument, stateInput: ProfileStateDocument, persist: boolean): Promise<ProfilesSnapshot> {
    const document = parseProfileDocument(documentInput);
    const state = parseStateDocument(stateInput);
    const errors = validateActiveProfiles(document, state);
    if (errors.length) throw new Error(errors.join("; "));
    const nextGeneration = this.generation + 1;
    const nextCompiled = compileProfiles(document, state, nextGeneration);
    const previousCompiled = compileProfiles(this.document, this.state, this.generation);
    await this.runtime.replaceProfiles(nextCompiled);

    if (persist) {
      const affectedTypes = new Set([...this.document.keyboards, ...document.keyboards].map(({ type }) => type));
      const originals = new Map<string, string | undefined>();
      try {
        const previousSettingsText = await this.readOptional(this.settingsPath);
        originals.set(this.settingsPath, previousSettingsText);
        const settings = settingsSchema.parse(previousSettingsText ? parse(previousSettingsText) : { version: 1, keyboards: {} });
        for (const type of affectedTypes) {
          const oldProfiles = this.document.keyboards.find((entry) => entry.type === type)?.profiles ?? [];
          const newProfiles = document.keyboards.find((entry) => entry.type === type)?.profiles ?? [];
          const ids = new Set([...oldProfiles, ...newProfiles].map(({ id }) => id));
          for (const id of ids) {
            const file = path.join(this.directoryFor(type), `${id}.yaml`);
            originals.set(file, await this.readOptional(file));
            const profile = newProfiles.find((entry) => entry.id === id);
            if (profile) await this.writeAtomic(file, stringify(profile));
            else await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
          }
          const activeProfile = state.activeProfiles[String(type)];
          const current = settings.keyboards[String(type)] ?? {};
          settings.keyboards[String(type)] = { ...current, ...(activeProfile ? { activeProfile } : {}) };
          if (!activeProfile) delete settings.keyboards[String(type)].activeProfile;
        }
        await this.writeAtomic(this.settingsPath, stringify(settings));
      } catch (error) {
        await this.runtime.replaceProfiles(previousCompiled).catch(() => undefined);
        for (const [file, contents] of originals) await this.restore(file, contents);
        throw error;
      }
    }

    this.document = clone(document);
    this.state = clone(state);
    this.generation = nextGeneration;
    const snapshot = this.snapshot();
    this.emit("event", { type: "changed", snapshot } satisfies ProfileEvent);
    return snapshot;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private directoryFor(type: number): string { return path.join(this.rootDirectory, `hid-${type}`); }
  private async installDefaultsIfFresh(): Promise<void> {
    if (!this.defaultConfigDirectory) return;
    const [settings, profiles] = await Promise.all([
      this.readOptional(this.settingsPath),
      readdir(this.rootDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      })
    ]);
    // Never recreate defaults after the user has established either settings or
    // a profiles directory, including an intentionally empty one.
    if (settings !== undefined || profiles !== undefined) return;
    await cp(path.join(this.defaultConfigDirectory, "profiles"), this.rootDirectory, { recursive: true });
    const defaultSettings = await readFile(path.join(this.defaultConfigDirectory, "settings.yaml"), "utf8");
    await this.writeAtomic(this.settingsPath, defaultSettings);
  }
  private assertKeyboardType(type: number): void {
    if (!Number.isInteger(type) || type < 0) throw new Error(`Invalid keyboard type: ${type}`);
  }
  private async readOptional(file: string): Promise<string | undefined> {
    try { return await readFile(file, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  private async writeAtomic(file: string, contents: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  }
  private async restore(file: string, contents: string | undefined): Promise<void> {
    if (contents === undefined) await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    else await this.writeAtomic(file, contents);
  }
  private emitConfigurationError(message: string): void {
    const error: NativeError = { code: "configurationError", message };
    this.emit("event", { type: "configurationError", error } satisfies ProfileEvent);
  }
}

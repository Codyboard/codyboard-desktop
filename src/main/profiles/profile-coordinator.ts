import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import path from "node:path";

import type {
  CompiledProfileSet,
  NativeError,
  ProfileDocument,
  ProfileDomain,
  ProfileDraft,
  ProfileEvent,
  ProfilesSnapshot,
  ProfileStateDocument,
} from "../../shared/hid.js";
import { profileDomainKey } from "../../shared/hid.js";
import { normalizeApplicationMappings } from "../../shared/profile-mappings.js";

import {
  compileProfiles,
  parseProfileDocument,
  parseStateDocument,
  profileDraftSchema,
  validateActiveProfiles,
} from "./profile-schema.js";
import { ProfileStore } from "./profile-store.js";

export interface ProfileRuntimeClient {
  replaceProfiles(snapshot: CompiledProfileSet): Promise<{
    generation: number;
    listening: boolean;
  }>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Serializes profile mutations, replaces the daemon snapshot, then persists. */
export class ProfileCoordinator extends EventEmitter {
  private document: ProfileDocument = { version: 1, keyboards: [] };
  private state: ProfileStateDocument = { version: 1, activeProfiles: {} };
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly store: ProfileStore;

  constructor(
    private readonly runtime: ProfileRuntimeClient,
    readonly rootDirectory = path.join(homedir(), ".codyboard", "profiles"),
    defaultConfigDirectory?: string,
  ) {
    super();
    this.store = new ProfileStore(rootDirectory, defaultConfigDirectory);
  }

  load(): Promise<ProfilesSnapshot> { return this.enqueue(() => this.loadFromDisk()); }
  reload(): Promise<ProfilesSnapshot> { return this.enqueue(() => this.loadFromDisk()); }

  snapshot(): ProfilesSnapshot {
    const keyboards: ProfilesSnapshot["keyboards"] = {};
    for (const keyboard of this.document.keyboards) {
      const profiles = clone(keyboard.profiles);
      const activeId = this.state.activeProfiles[profileDomainKey(keyboard.deviceId)];
      keyboards[profileDomainKey(keyboard.deviceId)] = {
        profiles,
        activeProfile: profiles.find(({ id }) => id === activeId),
      };
    }
    return { generation: this.generation, keyboards };
  }

  create(domain: ProfileDomain, draft: ProfileDraft): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      assertProfileDomain(domain);
      const profile = normalizeApplicationMappings(profileDraftSchema.parse(draft));
      let keyboard = findDomain(document, domain);
      if (!keyboard) {
        keyboard = { deviceId: domain, profiles: [] };
        document.keyboards.push(keyboard);
      }
      if (keyboard.profiles.some(({ id }) => id === profile.id))
        throw new Error(`Profile already exists: ${profile.id}`);
      const first = keyboard.profiles.length === 0;
      keyboard.profiles.push(profile);
      if (first) state.activeProfiles[profileDomainKey(domain)] = profile.id;
    });
  }

  update(domain: ProfileDomain, profileId: string, draft: ProfileDraft): Promise<ProfilesSnapshot> {
    return this.mutate((document) => {
      assertProfileDomain(domain);
      if (draft.id !== profileId)
        throw new Error("Profile id cannot be changed by update");
      const profile = normalizeApplicationMappings(profileDraftSchema.parse(draft));
      const keyboard = findDomain(document, domain);
      const index = keyboard?.profiles.findIndex(({ id }) => id === profileId) ?? -1;
      if (!keyboard || index < 0) throw new Error(`Profile not found: ${profileId}`);
      keyboard.profiles[index] = profile;
    });
  }

  remove(domain: ProfileDomain, profileId: string): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      assertProfileDomain(domain);
      const keyboard = findDomain(document, domain);
      if (!keyboard) throw new Error(`Profile domain not found: ${domain}`);
      const index = keyboard.profiles.findIndex(({ id }) => id === profileId);
      if (index < 0) throw new Error(`Profile not found: ${profileId}`);
      keyboard.profiles.splice(index, 1);
      if (state.activeProfiles[profileDomainKey(domain)] === profileId)
        delete state.activeProfiles[profileDomainKey(domain)];
    });
  }

  activate(domain: ProfileDomain, profileId: string): Promise<ProfilesSnapshot> {
    return this.mutate((document, state) => {
      assertProfileDomain(domain);
      if (!findDomain(document, domain)?.profiles.some(({ id }) => id === profileId))
        throw new Error(`Profile not found: ${profileId}`);
      state.activeProfiles[profileDomainKey(domain)] = profileId;
    });
  }

  deactivate(domain: ProfileDomain): Promise<ProfilesSnapshot> {
    return this.mutate((_document, state) => {
      assertProfileDomain(domain);
      delete state.activeProfiles[profileDomainKey(domain)];
    });
  }

  private mutate(
    mutator: (document: ProfileDocument, state: ProfileStateDocument) => void,
  ): Promise<ProfilesSnapshot> {
    return this.enqueue(async () => {
      const document = clone(this.document);
      const state = clone(this.state);
      mutator(document, state);
      return this.commit(document, state, true);
    });
  }

  private async loadFromDisk(): Promise<ProfilesSnapshot> {
    try {
      const stored = await this.store.load();
      for (const warning of stored.warnings) this.emitConfigurationError(warning);
      return await this.commit(stored.document, stored.state, false);
    } catch (error) {
      this.emitConfigurationError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async commit(
    documentInput: ProfileDocument,
    stateInput: ProfileStateDocument,
    persist: boolean,
  ): Promise<ProfilesSnapshot> {
    const document = parseProfileDocument(documentInput);
    const state = parseStateDocument(stateInput);
    const errors = validateActiveProfiles(document, state);
    if (errors.length) throw new Error(errors.join("; "));
    const nextGeneration = this.generation + 1;
    const previousCompiled = compileProfiles(this.document, this.state, this.generation);
    await this.runtime.replaceProfiles(compileProfiles(document, state, nextGeneration));
    if (persist) {
      try { await this.store.persist(this.document, document, state); }
      catch (error) {
        await this.runtime.replaceProfiles(previousCompiled).catch(() => undefined);
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

  private emitConfigurationError(message: string): void {
    const error: NativeError = { code: "configurationError", message };
    this.emit("event", { type: "configurationError", error } satisfies ProfileEvent);
  }
}

function assertProfileDomain(domain: ProfileDomain): void {
  if (domain === "." || domain === ".." || !domain || /[\\/\0]/u.test(domain))
    throw new Error(`Invalid device name: ${domain}`);
}

function findDomain(document: ProfileDocument, domain: ProfileDomain) {
  return document.keyboards.find(({ deviceId }) => deviceId === domain);
}

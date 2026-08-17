import type { HIDDeviceInfo, HIDListOptions, ProfileDraft, ProfileEvent, ProfilesSnapshot, RawProfilesAPI } from "../../shared/hid";

const clone = <T>(value: T): T => structuredClone(value);

export class Profile {
  readonly id: string;
  readonly name: string;
  readonly groups: ProfileDraft["groups"];

  constructor(draft: ProfileDraft) {
    this.id = draft.id;
    this.name = draft.name;
    this.groups = clone(draft.groups);
    Object.freeze(this.groups);
    Object.freeze(this);
  }

  toDraft(): ProfileDraft { return clone({ id: this.id, name: this.name, groups: this.groups }); }
}

export class KeyboardProfileCollection {
  constructor(private readonly manager: ProfileManager, readonly type: number) {}

  get profiles(): readonly Profile[] { return this.manager.snapshotFor(this.type).profiles.map((draft) => new Profile(draft)); }
  get activeProfile(): Profile | undefined {
    const draft = this.manager.snapshotFor(this.type).activeProfile;
    return draft ? new Profile(draft) : undefined;
  }

  async create(draft: ProfileDraft): Promise<Profile> {
    await this.manager.apply(this.manager.raw.create(this.type, clone(draft)));
    return this.profiles.find(({ id }) => id === draft.id)!;
  }
  async update(id: string, draft: ProfileDraft): Promise<Profile> {
    await this.manager.apply(this.manager.raw.update(this.type, id, clone(draft)));
    return this.profiles.find((profile) => profile.id === id)!;
  }
  async remove(id: string): Promise<void> { await this.manager.apply(this.manager.raw.remove(this.type, id)); }
  async activate(id: string): Promise<void> { await this.manager.apply(this.manager.raw.activate(this.type, id)); }
  async deactivate(): Promise<void> { await this.manager.apply(this.manager.raw.deactivate(this.type)); }
}

export class ProfileManager {
  private snapshot: ProfilesSnapshot = { generation: 0, keyboards: {} };
  private readonly collections = new Map<number, KeyboardProfileCollection>();
  private readonly listeners = new Set<(event: ProfileEvent) => void>();

  constructor(readonly raw: RawProfilesAPI) {
    raw.onEvent((event) => {
      if (event.type === "changed") this.snapshot = clone(event.snapshot);
      for (const listener of this.listeners) listener(event);
    });
  }

  async load(): Promise<void> { await this.apply(this.raw.load()); }
  async reload(): Promise<void> { await this.apply(this.raw.reload()); }
  forKeyboardType(type: number): KeyboardProfileCollection {
    if (!Number.isInteger(type) || type < 0) throw new Error(`Invalid keyboard type: ${type}`);
    let collection = this.collections.get(type);
    if (!collection) {
      collection = new KeyboardProfileCollection(this, type);
      this.collections.set(type, collection);
    }
    return collection;
  }
  onEvent(listener: (event: ProfileEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  snapshotFor(type: number) { return this.snapshot.keyboards[String(type)] ?? { profiles: [] }; }
  async apply(operation: Promise<ProfilesSnapshot>): Promise<void> { this.snapshot = clone(await operation); }
}

export const codyboard = {
  devices: { list: (options?: HIDListOptions): Promise<HIDDeviceInfo[]> => window.codyboard.listHIDs(options) },
  keyboard: window.codyboard.keyboard,
  profiles: new ProfileManager(window.codyboard.profiles)
};

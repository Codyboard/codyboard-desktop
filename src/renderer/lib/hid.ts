import { profileDomainKey, type HIDDeviceInfo, type HIDListOptions, type ProfileDraft, type ProfileEvent, type ProfilesSnapshot, type RawProfilesAPI } from "../../shared/hid";

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

export class DeviceProfileCollection {
  constructor(private readonly manager: ProfileManager, readonly deviceId: string) {}

  get profiles(): readonly Profile[] { return this.manager.snapshotFor(this.deviceId).profiles.map((draft) => new Profile(draft)); }
  get activeProfile(): Profile | undefined {
    const draft = this.manager.snapshotFor(this.deviceId).activeProfile;
    return draft ? new Profile(draft) : undefined;
  }

  async create(draft: ProfileDraft): Promise<Profile> {
    await this.manager.apply(this.manager.raw.create(this.deviceId, clone(draft)));
    return this.profiles.find(({ id }) => id === draft.id)!;
  }
  async update(id: string, draft: ProfileDraft): Promise<Profile> {
    await this.manager.apply(this.manager.raw.update(this.deviceId, id, clone(draft)));
    return this.profiles.find((profile) => profile.id === id)!;
  }
  async remove(id: string): Promise<void> { await this.manager.apply(this.manager.raw.remove(this.deviceId, id)); }
  async activate(id: string): Promise<void> { await this.manager.apply(this.manager.raw.activate(this.deviceId, id)); }
  async deactivate(): Promise<void> { await this.manager.apply(this.manager.raw.deactivate(this.deviceId)); }
}

export class ProfileManager {
  private snapshot: ProfilesSnapshot = { generation: 0, keyboards: {} };
  private readonly collections = new Map<string, DeviceProfileCollection>();
  private readonly listeners = new Set<(event: ProfileEvent) => void>();

  constructor(readonly raw: RawProfilesAPI) {
    raw.onEvent((event) => {
      if (event.type === "changed") this.snapshot = clone(event.snapshot);
      for (const listener of this.listeners) listener(event);
    });
  }

  async load(): Promise<void> { await this.apply(this.raw.load()); }
  async reload(): Promise<void> { await this.apply(this.raw.reload()); }
  forDevice(deviceId: string): DeviceProfileCollection {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(deviceId)) throw new Error(`Invalid device id: ${deviceId}`);
    let collection = this.collections.get(deviceId);
    if (!collection) {
      collection = new DeviceProfileCollection(this, deviceId);
      this.collections.set(deviceId, collection);
    }
    return collection;
  }
  onEvent(listener: (event: ProfileEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  snapshotFor(deviceId: string) { return this.snapshot.keyboards[profileDomainKey(deviceId)] ?? { profiles: [] }; }
  async apply(operation: Promise<ProfilesSnapshot>): Promise<void> { this.snapshot = clone(await operation); }
}

export const codyboard = {
  devices: { list: (options?: HIDListOptions): Promise<HIDDeviceInfo[]> => window.codyboard.listHIDs(options) },
  keyboard: window.codyboard.keyboard,
  profiles: new ProfileManager(window.codyboard.profiles)
};

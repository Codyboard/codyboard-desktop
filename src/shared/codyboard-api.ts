import type {
  CodyboardApplicationInfo,
  CodyboardPermission,
  CodyboardTheme,
  HIDDeviceInfo,
  HIDDiagnosticEvent,
  HIDListOptions,
  PermissionStatus,
} from "./hid-device";
import type {
  CompiledOutput,
  ProfileDomain,
  ProfileDraft,
  ProfileEvent,
  ProfilesSnapshot,
} from "./profile-types";

export interface RawProfilesAPI {
  load(): Promise<ProfilesSnapshot>;
  reload(): Promise<ProfilesSnapshot>;
  snapshot(): Promise<ProfilesSnapshot>;
  create(domain: ProfileDomain, draft: ProfileDraft): Promise<ProfilesSnapshot>;
  update(domain: ProfileDomain, profileId: string, draft: ProfileDraft): Promise<ProfilesSnapshot>;
  remove(domain: ProfileDomain, profileId: string): Promise<ProfilesSnapshot>;
  activate(domain: ProfileDomain, profileId: string): Promise<ProfilesSnapshot>;
  deactivate(domain: ProfileDomain): Promise<ProfilesSnapshot>;
  onEvent(handler: (event: ProfileEvent) => void): () => void;
}

export interface CodyboardAPI {
  appearance: { set(theme: CodyboardTheme): Promise<void> };
  applications: {
    pick(): Promise<CodyboardApplicationInfo | undefined>;
    resolve(bundleId: string): Promise<CodyboardApplicationInfo | undefined>;
  };
  listHIDs(options?: HIDListOptions): Promise<HIDDeviceInfo[]>;
  midi: { setExclusiveDevice(deviceId: string | undefined, ownerId: string): Promise<void> };
  keyboard: { send(output: CompiledOutput): Promise<void> };
  permissions: {
    status(): Promise<PermissionStatus>;
    openSettings(permission: CodyboardPermission): Promise<void>;
  };
  profiles: RawProfilesAPI;
  diagnostics: {
    setKeyboardType(keyboardType?: number): Promise<{ generation: number; listening: boolean }>;
    onKey(handler: (event: HIDDiagnosticEvent) => void): () => void;
  };
}

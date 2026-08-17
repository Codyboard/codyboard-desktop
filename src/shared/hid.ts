export type HIDModifier = "command" | "control" | "option" | "shift" | "fn";

export interface HIDDeviceInfo {
  id: string;
  type?: number;
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  transport?: string;
  locationId?: number;
  isVirtual: boolean;
  properties: Record<string, string>;
}

export interface HIDListOptions {
  includeVirtual?: boolean;
}

export interface CodyboardApplicationInfo {
  bundleId: string;
  iconDataUrl: string;
  name: string;
  path: string;
}

export type CodyboardPermission = "accessibility" | "inputMonitoring";

export interface PermissionStatus {
  accessibility: boolean;
  inputMonitoring: boolean;
}

export interface HIDKeyEvent {
  device: HIDDeviceInfo;
  eventType: "keydown" | "keyup" | "flagschanged" | "systemdefined";
  key: string;
  code: number;
  usagePage: number;
  pressed: boolean;
  value: number;
  timestamp: number;
  flags: number;
}

export interface HIDDiagnosticEvent {
  keyboardType: number;
  eventType: "keydown" | "keyup" | "flagschanged";
  source: "keyCode" | "hidUsage";
  code: number;
  keyCode?: number;
  flags: number;
  timestamp: number;
}

export interface KeyboardInput {
  kind: "keyboard";
  key?: string;
  keyCode?: number;
  modifiers?: HIDModifier[];
}

export interface ModifierInput {
  kind: "modifier";
  key: HIDModifier | "capsLock";
  modifiers?: HIDModifier[];
}

export interface SystemInput {
  kind: "system";
  key?: string;
  systemCode?: number;
}

export interface HIDUsageInput {
  kind: "hidUsage";
  usage: number;
}

export type MappingInput = KeyboardInput | ModifierInput | SystemInput | HIDUsageInput;

export interface KeyboardOutput {
  kind: "keyboard";
  key?: string;
  keyCode?: number;
  modifiers?: HIDModifier[];
}

export interface ModifierOutput {
  kind: "modifier";
  key: HIDModifier | "capsLock";
  modifiers?: HIDModifier[];
}

export interface SystemOutput {
  kind: "system";
  key?: string;
  systemCode?: number;
}

export interface LaunchApplicationOutput {
  kind: "launchApplication";
  bundleId: string;
}

export type MappingOutput = KeyboardOutput | LaunchApplicationOutput | ModifierOutput | SystemOutput | { kind: "passthrough" } | { kind: "suppress" };

export interface KeyMapping {
  id: string;
  from: MappingInput;
  to: MappingOutput;
}

export type MappingScope = { kind: "global" } | { kind: "application"; bundleId: string };

export interface KeyMappingGroup {
  id: string;
  scope: MappingScope;
  mappings: KeyMapping[];
}

export interface ProfileDraft {
  id: string;
  name: string;
  groups: KeyMappingGroup[];
}

export interface ProfileDocument {
  version: 1;
  keyboards: { type: number; profiles: ProfileDraft[] }[];
}

export interface ProfileStateDocument {
  version: 1;
  activeProfiles: Record<string, string>;
}

export interface ProfileSnapshot {
  profiles: readonly ProfileDraft[];
  activeProfile?: ProfileDraft;
}

export interface ProfilesSnapshot {
  generation: number;
  keyboards: Record<string, ProfileSnapshot>;
}

export interface CompiledTrigger {
  kind: "keyboard" | "modifier" | "system" | "hidUsage";
  code: number;
  modifiers: HIDModifier[];
}

export interface CompiledOutput {
  kind: "keyboard" | "launchApplication" | "modifier" | "system" | "passthrough" | "suppress";
  bundleId?: string;
  code?: number;
  modifier?: HIDModifier | "capsLock";
  modifiers: HIDModifier[];
}

export interface CompiledMapping {
  id: string;
  trigger: CompiledTrigger;
  output: CompiledOutput;
}

export interface CompiledActiveProfile {
  keyboardType: number;
  profileId: string;
  global: CompiledMapping[];
  applications: Record<string, CompiledMapping[]>;
}

export interface CompiledProfileSet {
  generation: number;
  profiles: CompiledActiveProfile[];
}

export interface NativeError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export type ProfileEvent =
  | { type: "changed"; snapshot: ProfilesSnapshot }
  | { type: "configurationError"; error: NativeError }
  | { type: "runtimeError"; error: NativeError };

export interface RawProfilesAPI {
  load(): Promise<ProfilesSnapshot>;
  reload(): Promise<ProfilesSnapshot>;
  snapshot(): Promise<ProfilesSnapshot>;
  create(keyboardType: number, draft: ProfileDraft): Promise<ProfilesSnapshot>;
  update(keyboardType: number, profileId: string, draft: ProfileDraft): Promise<ProfilesSnapshot>;
  remove(keyboardType: number, profileId: string): Promise<ProfilesSnapshot>;
  activate(keyboardType: number, profileId: string): Promise<ProfilesSnapshot>;
  deactivate(keyboardType: number): Promise<ProfilesSnapshot>;
  onEvent(handler: (event: ProfileEvent) => void): () => void;
}

export interface CodyboardAPI {
  applications: {
    pick(): Promise<CodyboardApplicationInfo | undefined>;
    resolve(bundleId: string): Promise<CodyboardApplicationInfo | undefined>;
  };
  listHIDs(options?: HIDListOptions): Promise<HIDDeviceInfo[]>;
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

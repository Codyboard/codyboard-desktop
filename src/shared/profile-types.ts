import type { HIDModifier } from "./hid-device";

export interface KeyboardInput { kind: "keyboard"; key?: string; keyCode?: number; modifiers?: HIDModifier[]; }
export interface ModifierInput { kind: "modifier"; key: HIDModifier | "capsLock"; modifiers?: HIDModifier[]; }
export interface SystemInput { kind: "system"; key?: string; systemCode?: number; }
export interface HIDUsageInput { kind: "hidUsage"; usage: number; }
export interface VoiceInput { kind: "voice"; }
export type MappingInput = KeyboardInput | ModifierInput | SystemInput | HIDUsageInput | VoiceInput;

export interface KeyboardOutput { kind: "keyboard"; key?: string; keyCode?: number; modifiers?: HIDModifier[]; }
export interface ModifierOutput { kind: "modifier"; key: HIDModifier | "capsLock"; modifiers?: HIDModifier[]; }
export interface SystemOutput { kind: "system"; key?: string; systemCode?: number; }
export interface LaunchApplicationOutput { kind: "launchApplication"; bundleId: string; }
export interface OpenURLOutput { kind: "openURL"; url: string; }
export interface TypeTextOutput { kind: "typeText"; pressEnter: boolean; text: string; }
export type MappingOutput = KeyboardOutput | LaunchApplicationOutput | ModifierOutput | OpenURLOutput | SystemOutput | TypeTextOutput | { kind: "passthrough" } | { kind: "suppress" };

export interface KeyMapping { id: string; from: MappingInput; to: MappingOutput; }
const VOICE_AUDIO_DEVICE_PREFIX = "device:";

export type VoiceAudioSource = "remote" | "system" | `device:${string}`;

export function isVoiceAudioSource(value: unknown): value is VoiceAudioSource {
  return value === "remote" || value === "system"
    || (typeof value === "string" && value.startsWith(VOICE_AUDIO_DEVICE_PREFIX)
      && value.length > VOICE_AUDIO_DEVICE_PREFIX.length);
}

export function voiceAudioDeviceSource(deviceUID: string): VoiceAudioSource {
  return `${VOICE_AUDIO_DEVICE_PREFIX}${deviceUID}`;
}

export function voiceAudioDeviceUID(source: VoiceAudioSource): string | undefined {
  return source.startsWith(VOICE_AUDIO_DEVICE_PREFIX)
    ? source.slice(VOICE_AUDIO_DEVICE_PREFIX.length)
    : undefined;
}
export type MappingScope = { kind: "global" } | { kind: "application"; bundleId: string };
export interface KeyMappingGroup {
  id: string;
  scope: MappingScope;
  mappings: KeyMapping[];
  voiceAudioSource?: VoiceAudioSource;
}
export interface ProfileDraft { id: string; name: string; groups: KeyMappingGroup[]; }
export type ProfileDomain = string;
export interface ProfileCollection { deviceId: string; profiles: ProfileDraft[]; }
export interface ProfileDocument { version: 1; keyboards: ProfileCollection[]; }
export interface ProfileStateDocument { version: 1; activeProfiles: Record<string, string>; }
export interface ProfileSnapshot { profiles: readonly ProfileDraft[]; activeProfile?: ProfileDraft; }
export interface ProfilesSnapshot { generation: number; keyboards: Record<string, ProfileSnapshot>; }

export function profileDomainKey(domain: ProfileDomain): string { return `device:${domain}`; }

export interface CompiledTrigger {
  kind: "keyboard" | "modifier" | "system" | "hidUsage" | "voice";
  code: number;
  modifiers: HIDModifier[];
}
export interface CompiledOutput {
  kind: "keyboard" | "launchApplication" | "modifier" | "openURL" | "system" | "typeText" | "passthrough" | "suppress";
  bundleId?: string;
  code?: number;
  modifier?: HIDModifier | "capsLock";
  modifiers: HIDModifier[];
  pressEnter?: boolean;
  text?: string;
  url?: string;
  voiceAudioDeviceUID?: string;
  voiceAudioSource?: "device" | "remote" | "system";
}
export interface CompiledMapping { id: string; trigger: CompiledTrigger; output: CompiledOutput; }
export interface CompiledActiveProfile {
  deviceId: string;
  profileId: string;
  global: CompiledMapping[];
  applications: Record<string, CompiledMapping[]>;
}
export interface CompiledProfileSet { generation: number; profiles: CompiledActiveProfile[]; }
export interface NativeError { code: string; message: string; details?: Record<string, string>; }
export type ProfileEvent =
  | { type: "changed"; snapshot: ProfilesSnapshot }
  | { type: "configurationError"; error: NativeError }
  | { type: "runtimeError"; error: NativeError };

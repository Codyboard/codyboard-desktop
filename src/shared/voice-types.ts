export interface VoiceConfiguration {
  enabled: boolean;
  gainDB: number;
  targetIdentifier?: string;
}

export interface VoiceSettings extends VoiceConfiguration {
  audioDeviceUID?: string;
}

export type VoiceBluetoothState =
  | "stopped" | "unavailable" | "scanning" | "connecting" | "discovering"
  | "ready" | "reconnecting" | "failed";

export interface VoiceCapabilities {
  codecs: number;
  frameSize: number;
  interaction: number;
  sampleRate: number;
  selectedCodec: number;
  version: number;
}

export interface VoiceStatus {
  capabilities?: VoiceCapabilities;
  deviceIdentifier?: string;
  deviceName?: string;
  enabled: boolean;
  error?: string;
  generation?: number;
  state: VoiceBluetoothState;
  streaming: boolean;
}

export interface AudioDeviceInfo {
  id: number;
  inputChannels: number;
  name: string;
  outputChannels: number;
  uid: string;
}

export type AudioOutputState =
  | "unconfigured" | "configured" | "starting" | "ready" | "draining" | "failed";

export interface AudioOutputStatus {
  active: boolean;
  error?: string;
  healthy: boolean;
  pendingBuffers: number;
  selectedDevice?: AudioDeviceInfo;
  state: AudioOutputState;
  testToneActive: boolean;
}

export type VoiceSessionState = "idle" | "active" | "draining" | "failed";

export interface VoiceSessionStatus {
  activeInputDeviceUID?: string;
  activeBundleIdentifier?: string;
  error?: string;
  previousInputDeviceUID?: string;
  state: VoiceSessionState;
}

export interface VoiceSnapshot {
  audio: AudioOutputStatus;
  audioDevices: AudioDeviceInfo[];
  inputDevices: AudioDeviceInfo[];
  session: VoiceSessionStatus;
  settings: VoiceSettings;
  voice: VoiceStatus;
}

export interface VoiceAudioLevel {
  peak: number;
  rms: number;
  sequence: number;
}

export type VoiceEvent =
  | { type: "changed"; snapshot: VoiceSnapshot }
  | { type: "level"; level: VoiceAudioLevel }
  | { type: "error"; message: string };

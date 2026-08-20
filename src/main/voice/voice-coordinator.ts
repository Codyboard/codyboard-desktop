import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import path from "node:path";

import type {
  AudioDeviceInfo,
  AudioOutputStatus,
  VoiceConfiguration,
  VoiceEvent,
  VoiceSessionStatus,
  VoiceSettings,
  VoiceSnapshot,
  VoiceStatus,
} from "../../shared/hid.js";

import { defaultVoiceSettings, VoiceSettingsStore } from "./voice-settings-store.js";

export interface VoiceRuntimeClient extends EventEmitter {
  audioStatus(): Promise<AudioOutputStatus>;
  configureAudio(deviceUID: string): Promise<AudioOutputStatus>;
  configureVoice(configuration: VoiceConfiguration): Promise<VoiceStatus>;
  listAudioDevices(): Promise<AudioDeviceInfo[]>;
  testAudioTone(): Promise<AudioOutputStatus>;
  voiceSessionStatus(): Promise<VoiceSessionStatus>;
  voiceStatus(): Promise<VoiceStatus>;
}

const emptyAudio: AudioOutputStatus = {
  active: false,
  healthy: false,
  pendingBuffers: 0,
  state: "unconfigured",
  testToneActive: false,
};
const emptyVoice: VoiceStatus = {
  enabled: false,
  state: "stopped",
  streaming: false,
};
const emptySession: VoiceSessionStatus = { state: "idle" };

export class VoiceCoordinator extends EventEmitter {
  private audio: AudioOutputStatus = emptyAudio;
  private audioDevices: AudioDeviceInfo[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private session: VoiceSessionStatus = emptySession;
  private settings: VoiceSettings = defaultVoiceSettings;
  private readonly store: VoiceSettingsStore;
  private voice: VoiceStatus = emptyVoice;

  constructor(
    private readonly runtime: VoiceRuntimeClient,
    settingsFile = path.join(homedir(), ".codyboard", "settings.yaml"),
  ) {
    super();
    this.store = new VoiceSettingsStore(settingsFile);
    runtime.on("audioStateChanged", (status: AudioOutputStatus) => {
      this.audio = status;
      this.publish();
    });
    runtime.on("audioTestToneFinished", (status: AudioOutputStatus) => {
      this.audio = status;
      this.publish();
    });
    runtime.on("bluetoothStateChanged", (status: VoiceStatus) => {
      this.voice = status;
      this.publish();
    });
    runtime.on("voiceSessionStateChanged", (status: VoiceSessionStatus) => {
      this.session = status;
      this.publish();
    });
  }

  load(): Promise<VoiceSnapshot> {
    return this.enqueue(async () => {
      this.settings = await this.store.load();
      this.audioDevices = await this.runtime.listAudioDevices();
      await this.applyRuntime(this.settings);
      return this.publish();
    });
  }

  snapshot(): VoiceSnapshot { return structuredClone(this.currentSnapshot); }

  update(settings: VoiceSettings): Promise<VoiceSnapshot> {
    return this.enqueue(async () => {
      validateSettings(settings);
      const previous = this.settings;
      await this.applyRuntime(settings, previous);
      try {
        await this.store.persist(settings);
      } catch (error) {
        await this.applyRuntime(previous, settings).catch(() => undefined);
        throw error;
      }
      this.settings = structuredClone(settings);
      return this.publish();
    });
  }

  testTone(): Promise<VoiceSnapshot> {
    return this.enqueue(async () => {
      if (!this.settings.audioDeviceUID)
        throw new Error("Select an audio output device first");
      this.audio = await this.runtime.testAudioTone();
      return this.publish();
    });
  }

  private get currentSnapshot(): VoiceSnapshot {
    return {
      audio: this.audio,
      audioDevices: this.audioDevices,
      session: this.session,
      settings: this.settings,
      voice: this.voice,
    };
  }

  private async applyRuntime(
    settings: VoiceSettings,
    previous?: VoiceSettings,
  ): Promise<void> {
    if (settings.enabled && !settings.audioDeviceUID)
      throw new Error("Select an audio output device before enabling remote microphone");
    const selectedDeviceAvailable = settings.audioDeviceUID
      ? this.audioDevices.some(({ uid }) => uid === settings.audioDeviceUID)
      : false;
    if (settings.enabled && settings.audioDeviceUID && !selectedDeviceAvailable)
      throw new Error("The selected audio output device is unavailable");
    if (previous?.enabled && !settings.enabled)
      this.voice = await this.runtime.configureVoice(configurationFor(settings));
    if (settings.audioDeviceUID && selectedDeviceAvailable
      && settings.audioDeviceUID !== previous?.audioDeviceUID)
      this.audio = await this.runtime.configureAudio(settings.audioDeviceUID);
    else if (!previous)
      this.audio = await this.runtime.audioStatus();
    if (!(previous?.enabled && !settings.enabled))
      this.voice = await this.runtime.configureVoice(configurationFor(settings));
    this.session = await this.runtime.voiceSessionStatus();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private publish(): VoiceSnapshot {
    const snapshot = this.snapshot();
    this.emit("event", { type: "changed", snapshot } satisfies VoiceEvent);
    return snapshot;
  }
}

function configurationFor(settings: VoiceSettings): VoiceConfiguration {
  return {
    enabled: settings.enabled,
    gainDB: settings.gainDB,
    ...(settings.targetIdentifier ? { targetIdentifier: settings.targetIdentifier } : {}),
  };
}

function validateSettings(settings: VoiceSettings): void {
  if (typeof settings.enabled !== "boolean" || !Number.isFinite(settings.gainDB)
    || settings.gainDB < -24 || settings.gainDB > 24)
    throw new Error("Invalid remote microphone settings");
  if (settings.audioDeviceUID !== undefined && !settings.audioDeviceUID)
    throw new Error("Invalid audio output device");
}

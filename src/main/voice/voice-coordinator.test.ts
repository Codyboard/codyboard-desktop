import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import type {
  AudioOutputStatus,
  VoiceConfiguration,
  VoiceSessionStatus,
  VoiceStatus,
} from "../../shared/hid.js";

import { VoiceCoordinator, type VoiceRuntimeClient } from "./voice-coordinator.js";

const configuredAudio: AudioOutputStatus = {
  active: false,
  healthy: false,
  pendingBuffers: 0,
  selectedDevice: {
    id: 101,
    inputChannels: 2,
    name: "Codyboard Virtual Microphone",
    outputChannels: 2,
    uid: "CodyboardVirtualMicrophone2ch_UID",
  },
  state: "configured",
  testToneActive: false,
};

describe("VoiceCoordinator", () => {
  it("loads settings and configures audio before BLE", async () => {
    const file = await settingsFile();
    await writeFile(file, [
      "version: 1",
      "keyboards: {}",
      "voice:",
      "  enabled: true",
      "  gainDB: 4",
      "  audioDeviceUID: CodyboardVirtualMicrophone2ch_UID",
      "",
    ].join("\n"));
    const runtime = new FakeVoiceRuntime();
    const coordinator = new VoiceCoordinator(runtime, file);

    const snapshot = await coordinator.load();

    expect(runtime.calls).toEqual([
      "devices",
      "audio:CodyboardVirtualMicrophone2ch_UID",
      "voice:true:4",
      "session",
    ]);
    expect(snapshot.settings.enabled).toBe(true);
  });

  it("persists voice without replacing profile settings", async () => {
    const file = await settingsFile();
    await writeFile(file, "version: 1\nkeyboards:\n  device:remote:\n    activeProfile: default\n");
    const coordinator = new VoiceCoordinator(new FakeVoiceRuntime(), file);
    await coordinator.load();

    await coordinator.update({
      audioDeviceUID: "CodyboardVirtualMicrophone2ch_UID",
      enabled: true,
      gainDB: -3,
    });

    const document = parse(await readFile(file, "utf8")) as Record<string, unknown>;
    expect(document.keyboards).toEqual({ "device:remote": { activeProfile: "default" } });
    expect(document.voice).toEqual({
      audioDeviceUID: "CodyboardVirtualMicrophone2ch_UID",
      enabled: true,
      gainDB: -3,
    });
  });

  it("rejects enabling voice without an audio device", async () => {
    const coordinator = new VoiceCoordinator(new FakeVoiceRuntime(), await settingsFile());
    await coordinator.load();
    await expect(coordinator.update({ enabled: true, gainDB: 0 }))
      .rejects.toThrow(/audio output device/);
  });
});

class FakeVoiceRuntime extends EventEmitter implements VoiceRuntimeClient {
  calls: string[] = [];

  audioStatus(): Promise<AudioOutputStatus> {
    this.calls.push("audio-status");
    return Promise.resolve(configuredAudio);
  }

  configureAudio(deviceUID: string): Promise<AudioOutputStatus> {
    this.calls.push(`audio:${deviceUID}`);
    return Promise.resolve(configuredAudio);
  }

  configureVoice(configuration: VoiceConfiguration): Promise<VoiceStatus> {
    this.calls.push(`voice:${configuration.enabled}:${configuration.gainDB}`);
    return Promise.resolve({
      enabled: configuration.enabled,
      state: configuration.enabled ? "ready" : "stopped",
      streaming: false,
    });
  }

  listAudioDevices() {
    this.calls.push("devices");
    return Promise.resolve([configuredAudio.selectedDevice!]);
  }

  testAudioTone(): Promise<AudioOutputStatus> { return Promise.resolve(configuredAudio); }

  voiceSessionStatus(): Promise<VoiceSessionStatus> {
    this.calls.push("session");
    return Promise.resolve({ state: "idle" });
  }

  voiceStatus(): Promise<VoiceStatus> {
    return Promise.resolve({ enabled: false, state: "stopped", streaming: false });
  }
}

async function settingsFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "codyboard-voice-"));
  return path.join(directory, "settings.yaml");
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import type { ProfileEvent, VoiceEvent } from '../shared/hid.js';

import { registerIPCHandlers } from './app/ipc-handlers.js';
import { SettingsWindowController } from './app/settings-window.js';
import { TrayController } from './app/tray-controller.js';
import { CodyboardDaemonClient } from './daemon/codyboard-daemon-client.js';
import { MIDICaptureController } from './daemon/midi-capture-controller.js';
import { ProfileCoordinator } from './profiles/profile-coordinator.js';
import { VoiceCoordinator } from './voice/voice-coordinator.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const resourcePath = (...segments: string[]): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, ...segments)
    : path.join(currentDir, '..', 'resources', ...segments);

const daemon = new CodyboardDaemonClient(resourcePath('bin', 'CodyboardDaemon'));
const midiCapture = new MIDICaptureController(daemon);
const voice = new VoiceCoordinator(daemon);
const profiles = new ProfileCoordinator(
  daemon,
  undefined,
  resourcePath('default-config'),
);
const settings = new SettingsWindowController({
  currentDir,
  developmentURL: process.env.VITE_DEV_SERVER_URL,
  releaseMIDICapture: () => midiCapture.release(),
  stopDiagnostics: () => daemon.setDiagnosticKeyboardType(),
});
const tray = new TrayController({
  daemon,
  iconPath: resourcePath('tray-iconTemplate.png'),
  profiles,
  showSettings: (route) => settings.show(route),
});
let quitting = false;
let recoveryPromise: Promise<void> | undefined;

registerIPCHandlers({
  daemon,
  midiCapture,
  profiles,
  settingsWindow: () => settings.browserWindow,
  voice,
});
connectNativeEvents();

void app.whenReady().then(async () => {
  app.dock?.hide();
  daemon.start();
  tray.start();
  await voice.load().catch((error: unknown) => {
    console.error('Unable to load remote microphone settings', error);
    publishVoiceEvent({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  });
  try {
    const permissions = await daemon.permissionStatus();
    if (permissions.accessibility && permissions.inputMonitoring)
      await profiles.load();
  } catch (error) {
    console.error('Unable to load Codyboard profiles', error);
  }
  if (process.platform === 'linux') await tray.refresh();
});

app.on('before-quit', () => {
  quitting = true;
  settings.beginQuit();
  void midiCapture.release().catch(() => undefined);
  daemon.stop();
});
app.on('window-all-closed', () => {
  /* Tray daemon stays alive. */
});

function connectNativeEvents(): void {
  profiles.on('event', publishProfileEvent);
  voice.on('event', publishVoiceEvent);
  daemon.on('error', (payload: { message: string }) =>
    publishProfileEvent({
      type: 'runtimeError',
      error: { code: 'daemonError', message: payload.message },
    }),
  );
  daemon.on('diagnosticKey', (payload) => {
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send('diagnostics:key', payload);
  });
  daemon.on('exit', ({ expected }: { expected: boolean }) => {
    if (!expected && !quitting && !recoveryPromise) {
      recoveryPromise = recoverNativeRuntime().finally(() => {
        recoveryPromise = undefined;
      });
    }
  });
}

async function recoverNativeRuntime(): Promise<void> {
  const retryDelays = [250, 1_000, 3_000];
  let lastError: unknown;
  for (const delay of retryDelays) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (quitting) return;
    try {
      daemon.start();
      await voice.recoverRuntime();
      const permissions = await daemon.permissionStatus();
      if (permissions.accessibility && permissions.inputMonitoring)
        await profiles.reload();
      await midiCapture.recover();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('Unable to recover Codyboard daemon', lastError);
  publishVoiceEvent({ type: 'error', message });
}

function publishVoiceEvent(event: VoiceEvent): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('voice:event', event);
}

function publishProfileEvent(event: ProfileEvent): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('profiles:event', event);
}

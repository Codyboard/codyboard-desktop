import {
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type BrowserWindow,
} from 'electron';

import type {
  CodyboardPermission,
  CodyboardTheme,
  CompiledOutput,
  HIDListOptions,
  ProfileDomain,
  ProfileDraft,
} from '../../shared/hid.js';
import type { CodyboardDaemonClient } from '../daemon/codyboard-daemon-client.js';
import type { MIDICaptureController } from '../daemon/midi-capture-controller.js';
import type { ProfileCoordinator } from '../profiles/profile-coordinator.js';

import { applicationInfoAt, resolveApplication } from './application-catalog.js';

export interface IPCHandlerDependencies {
  daemon: CodyboardDaemonClient;
  midiCapture: MIDICaptureController;
  profiles: ProfileCoordinator;
  settingsWindow: () => BrowserWindow | undefined;
}

export function registerIPCHandlers({
  daemon,
  midiCapture,
  profiles,
  settingsWindow,
}: IPCHandlerDependencies): void {
  ipcMain.handle('hid:list', (_event, options?: HIDListOptions) =>
    daemon.listDevices(options),
  );
  ipcMain.handle('appearance:set', (_event, theme: CodyboardTheme) => {
    if (theme !== 'dark' && theme !== 'light')
      throw new Error('Invalid appearance');
    nativeTheme.themeSource = theme;
  });
  ipcMain.handle('applications:pick', async () => {
    const options: Electron.OpenDialogOptions = {
      defaultPath: '/Applications',
      filters: [{ name: 'Applications', extensions: ['app'] }],
      message: 'Choose an application for this profile',
      properties: ['openFile', 'dontAddToRecent'],
    };
    const parent = settingsWindow();
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths[0]
      ? undefined
      : applicationInfoAt(result.filePaths[0]);
  });
  ipcMain.handle('applications:resolve', (_event, bundleId: string) => {
    if (typeof bundleId !== 'string')
      throw new Error('Invalid bundle identifier');
    return resolveApplication(bundleId);
  });
  ipcMain.handle('keyboard:send', (_event, output: CompiledOutput) =>
    daemon.sendKeyboardInput(output),
  );
  ipcMain.handle('diagnostics:set', async (_event, keyboardType?: number) => {
    if (
      keyboardType !== undefined &&
      (!Number.isInteger(keyboardType) || keyboardType < 0)
    )
      throw new Error('Invalid keyboard type');
    return daemon.setDiagnosticKeyboardType(keyboardType);
  });
  ipcMain.handle(
    'midi:set-exclusive-device',
    (_event, deviceId: string | undefined, ownerId: string) =>
      deviceId === undefined
        ? midiCapture.release(ownerId)
        : midiCapture.claim(deviceId, ownerId),
  );
  ipcMain.handle('permissions:status', () => daemon.permissionStatus());
  ipcMain.handle(
    'permissions:open-settings',
    (_event, permission: CodyboardPermission) =>
      openPermissionSettings(daemon, permission),
  );
  ipcMain.handle('profiles:load', () => profiles.load());
  ipcMain.handle('profiles:reload', () => profiles.reload());
  ipcMain.handle('profiles:snapshot', () => profiles.snapshot());
  ipcMain.handle(
    'profiles:create',
    (_event, domain: ProfileDomain, draft: ProfileDraft) =>
      profiles.create(domain, draft),
  );
  ipcMain.handle(
    'profiles:update',
    (_event, domain: ProfileDomain, id: string, draft: ProfileDraft) =>
      profiles.update(domain, id, draft),
  );
  ipcMain.handle(
    'profiles:remove',
    (_event, domain: ProfileDomain, id: string) => profiles.remove(domain, id),
  );
  ipcMain.handle(
    'profiles:activate',
    (_event, domain: ProfileDomain, id: string) => profiles.activate(domain, id),
  );
  ipcMain.handle('profiles:deactivate', (_event, domain: ProfileDomain) =>
    profiles.deactivate(domain),
  );
}

async function openPermissionSettings(
  daemon: CodyboardDaemonClient,
  permission: CodyboardPermission,
): Promise<void> {
  if (permission !== 'accessibility' && permission !== 'inputMonitoring')
    throw new Error('Unknown permission');
  await daemon.requestPermission(permission).catch(() => undefined);
  const pane =
    permission === 'accessibility'
      ? 'Privacy_Accessibility'
      : 'Privacy_ListenEvent';
  await shell.openExternal(
    `x-apple.systempreferences:com.apple.preference.security?${pane}`,
  );
}

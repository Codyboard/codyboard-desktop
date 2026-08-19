import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  Tray,
} from 'electron';

import {
  findSupportedDevices,
  type SupportedDevice,
} from '../shared/device-catalog.js';
import type {
  CodyboardApplicationInfo,
  CodyboardPermission,
  CodyboardTheme,
  CompiledOutput,
  HIDListOptions,
  ProfileDomain,
  ProfileDraft,
  ProfileEvent,
} from '../shared/hid.js';
import { profileDomainKey } from '../shared/hid.js';

import { CodyboardDaemonClient } from './codyboard-daemon-client.js';
import { ProfileCoordinator } from './profile-coordinator.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const daemonPath = app.isPackaged
  ? path.join(process.resourcesPath, 'bin', 'CodyboardDaemon')
  : path.join(currentDir, '..', 'resources', 'bin', 'CodyboardDaemon');
const defaultConfigPath = app.isPackaged
  ? path.join(process.resourcesPath, 'default-config')
  : path.join(currentDir, '..', 'resources', 'default-config');
const trayIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'tray-iconTemplate.png')
  : path.join(currentDir, '..', 'resources', 'tray-iconTemplate.png');
let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let midiCaptureOwnerId: string | undefined;
let isQuitting = false;
let isOpeningTrayMenu = false;
const daemon = new CodyboardDaemonClient(daemonPath);
const profiles = new ProfileCoordinator(daemon, undefined, defaultConfigPath);

async function releaseMIDICapture(): Promise<void> {
  midiCaptureOwnerId = undefined;
  await daemon.setMIDICapture();
}

function trayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(trayIconPath);
  if (icon.isEmpty())
    throw new Error(`Unable to load tray icon: ${trayIconPath}`);
  icon.setTemplateImage(true);
  return icon;
}

function publishProfileEvent(event: ProfileEvent): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('profiles:event', event);
}

async function applicationInfoAt(
  applicationPath: string,
): Promise<CodyboardApplicationInfo> {
  if (path.extname(applicationPath).toLowerCase() !== '.app')
    throw new Error('Select a macOS application.');
  const plistPath = path.join(applicationPath, 'Contents', 'Info.plist');
  const { stdout } = await execFileAsync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', plistPath],
    {
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const plist = JSON.parse(stdout) as Record<string, unknown>;
  const bundleId =
    typeof plist.CFBundleIdentifier === 'string'
      ? plist.CFBundleIdentifier.trim()
      : '';
  if (!bundleId)
    throw new Error('The selected application has no bundle identifier.');
  const displayName =
    typeof plist.CFBundleDisplayName === 'string'
      ? plist.CFBundleDisplayName.trim()
      : '';
  const bundleName =
    typeof plist.CFBundleName === 'string' ? plist.CFBundleName.trim() : '';
  return {
    bundleId,
    iconDataUrl: await applicationIconDataUrl(applicationPath, plist),
    name: displayName || bundleName || path.basename(applicationPath, '.app'),
    path: applicationPath,
  };
}

async function applicationIconDataUrl(
  applicationPath: string,
  plist: Record<string, unknown>,
): Promise<string> {
  const declaredIcon =
    typeof plist.CFBundleIconFile === 'string'
      ? plist.CFBundleIconFile.trim()
      : '';
  if (!declaredIcon) return '';

  const iconFile = path.extname(declaredIcon)
    ? declaredIcon
    : `${declaredIcon}.icns`;
  const iconPath = path.join(
    applicationPath,
    'Contents',
    'Resources',
    path.basename(iconFile),
  );
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'codyboard-app-icon-'),
  );
  const pngPath = path.join(temporaryDirectory, 'icon.png');
  try {
    await execFileAsync(
      '/usr/bin/sips',
      ['-Z', '128', '-s', 'format', 'png', iconPath, '--out', pngPath],
      {
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const png = await readFile(pngPath);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    // An unreadable icon should never prevent an application scope from loading.
    return '';
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function resolveApplication(
  bundleId: string,
): Promise<CodyboardApplicationInfo | undefined> {
  if (!bundleId.trim()) return undefined;
  const escaped = bundleId.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const { stdout } = await execFileAsync(
    '/usr/bin/mdfind',
    [`kMDItemCFBundleIdentifier == "${escaped}"c`],
    {
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const candidates = stdout
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.endsWith('.app'));
  for (const candidate of candidates.sort(
    (left, right) => left.length - right.length,
  )) {
    try {
      const info = await applicationInfoAt(candidate);
      if (info.bundleId === bundleId) return info;
    } catch {
      // Spotlight may include stale or inaccessible application paths.
    }
  }
  return undefined;
}

function showSettings(route = '/'): void {
  if (!route.startsWith('/midi')) void releaseMIDICapture().catch(() => undefined);
  const navigate = async () => {
    await settingsWindow?.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(route)}`,
    );
    if (settingsWindow?.isVisible())
      settingsWindow.webContents.setAudioMuted(false);
  };

  if (!settingsWindow) {
    const workArea = screen.getPrimaryDisplay().workArea;
    const maximumWidth = Math.floor(workArea.width * 0.75);
    const maximumHeight = Math.floor(workArea.height * 0.75);
    const width = Math.min(maximumWidth, Math.floor((maximumHeight * 16) / 10));
    const height = Math.floor((width * 10) / 16);

    settingsWindow = new BrowserWindow({
      width,
      height,
      x: workArea.x + Math.floor((workArea.width - width) / 2),
      y: workArea.y + Math.floor((workArea.height - height) / 2),
      minWidth: 800,
      minHeight: 450,
      maximizable: false,
      show: false,
      title: 'Codyboard Settings',
      backgroundColor: '#00000000',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 23 },
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      webPreferences: {
        autoplayPolicy: 'no-user-gesture-required',
        preload: path.join(currentDir, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    settingsWindow.on('close', (event) => {
      settingsWindow?.webContents.setAudioMuted(true);
      if (!isQuitting) {
        event.preventDefault();
        settingsWindow?.hide();
        void settingsWindow?.webContents.executeJavaScript(
          `if (window.location.hash.startsWith('#/midi')) window.location.hash = '/'`,
        );
        void releaseMIDICapture().catch(() => undefined);
        void daemon
          .setDiagnosticKeyboardType()
          .catch((error: unknown) =>
            console.error('Unable to stop diagnostics', error),
          );
      }
    });
    settingsWindow.webContents.on('render-process-gone', () => {
      void releaseMIDICapture().catch(() => undefined);
    });
    settingsWindow.webContents.once('did-finish-load', () => void navigate());
    if (isDevelopment)
      void settingsWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    else
      void settingsWindow.loadFile(
        path.join(currentDir, '..', 'dist', 'index.html'),
      );
  } else {
    void navigate();
  }
  settingsWindow.show();
  settingsWindow.focus();
}

function deviceProfileDomain(device: SupportedDevice): ProfileDomain {
  return device.profileDomain;
}

function deviceSettingsRoute(device: SupportedDevice): string {
  return `/devices/${encodeURIComponent(device.hid.id)}?model=${encodeURIComponent(device.model)}`;
}

async function setDeviceProfile(
  device: SupportedDevice,
  profileId?: string,
): Promise<void> {
  const domain = deviceProfileDomain(device);
  try {
    if (profileId) await profiles.activate(domain, profileId);
    else await profiles.deactivate(domain);
  } catch (error) {
    console.error('Unable to change device profile from the tray', error);
  }
}

async function buildTrayMenu(): Promise<Menu> {
  let connectedDevices: SupportedDevice[] = [];
  try {
    connectedDevices = findSupportedDevices(await daemon.listDevices());
  } catch (error) {
    console.error('Unable to refresh tray devices', error);
  }

  const snapshot = profiles.snapshot();
  const deviceItems: Electron.MenuItemConstructorOptions[] = connectedDevices.map(
    (device) => {
      const domain = deviceProfileDomain(device);
      const keyboard = snapshot.keyboards[profileDomainKey(domain)];
      const profileItems: Electron.MenuItemConstructorOptions[] =
        keyboard?.profiles.map((profile) => ({
          label: profile.id === 'default' ? 'Default' : profile.name,
          type: 'checkbox',
          checked: keyboard.activeProfile?.id === profile.id,
          click: () => void setDeviceProfile(device, profile.id),
        })) ?? [];
      if (profileItems.length === 0) {
        profileItems.push({ label: 'No profiles', enabled: false });
      }
      return {
        label: device.hid.product?.trim() || device.name,
        submenu: [
          ...profileItems,
          {
            label: 'Inactivated',
            type: 'checkbox',
            checked: !keyboard?.activeProfile,
            enabled: true,
            click: () => void setDeviceProfile(device),
          },
          { type: 'separator' },
          {
            label: 'Open Settings…',
            click: () => showSettings(deviceSettingsRoute(device)),
          },
        ],
      };
    },
  );

  const connectedDeviceGroup: Electron.MenuItemConstructorOptions[] =
    deviceItems.length > 0
      ? [
          { label: 'Connected Devices', enabled: false },
          ...deviceItems,
          { type: 'separator' },
        ]
      : [];

  return Menu.buildFromTemplate([
    ...connectedDeviceGroup,
    { label: 'Get Funky 🪩', click: () => showSettings('/midi') },
    { label: 'Open Codyboard…', click: () => showSettings('/') },
    { label: 'Manage Permissions…', click: () => showSettings('/permissions') },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

async function showTrayMenu(): Promise<void> {
  if (!tray || isOpeningTrayMenu) return;
  isOpeningTrayMenu = true;
  try {
    const menu = await buildTrayMenu();
    if (process.platform === 'linux') tray.setContextMenu(menu);
    else tray.popUpContextMenu(menu);
  } finally {
    isOpeningTrayMenu = false;
  }
}

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
  const result = settingsWindow
    ? await dialog.showOpenDialog(settingsWindow, options)
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
  ) {
    throw new Error('Invalid keyboard type');
  }
  console.info(`[diagnostics:set] requested=${keyboardType ?? 'off'}`);
  const result = await daemon.setDiagnosticKeyboardType(keyboardType);
  console.info(`[diagnostics:set] listening=${result.listening} generation=${result.generation}`);
  return result;
});
ipcMain.handle('midi:set-exclusive-device', async (
  _event,
  deviceId: string | undefined,
  ownerId: string,
) => {
  if (deviceId !== undefined && (typeof deviceId !== 'string' || !deviceId.trim()))
    throw new Error('Invalid MIDI capture device');
  if (typeof ownerId !== 'string' || !ownerId.trim())
    throw new Error('Invalid MIDI capture owner');
  if (deviceId === undefined) {
    if (midiCaptureOwnerId !== ownerId) return;
    await releaseMIDICapture();
    return;
  }
  midiCaptureOwnerId = ownerId;
  try {
    await daemon.setMIDICapture(deviceId);
  } catch (error) {
    if (midiCaptureOwnerId === ownerId) midiCaptureOwnerId = undefined;
    throw error;
  }
});
ipcMain.handle('permissions:status', () => daemon.permissionStatus());
ipcMain.handle(
  'permissions:open-settings',
  async (_event, permission: CodyboardPermission) => {
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
  },
);
ipcMain.handle('profiles:load', () => profiles.load());
ipcMain.handle('profiles:reload', () => profiles.reload());
ipcMain.handle('profiles:snapshot', () => profiles.snapshot());
ipcMain.handle('profiles:create', (_event, domain: ProfileDomain, draft: ProfileDraft) =>
  profiles.create(domain, draft),
);
ipcMain.handle(
  'profiles:update',
  (_event, domain: ProfileDomain, id: string, draft: ProfileDraft) =>
    profiles.update(domain, id, draft),
);
ipcMain.handle('profiles:remove', (_event, domain: ProfileDomain, id: string) =>
  profiles.remove(domain, id),
);
ipcMain.handle('profiles:activate', (_event, domain: ProfileDomain, id: string) =>
  profiles.activate(domain, id),
);
ipcMain.handle('profiles:deactivate', (_event, domain: ProfileDomain) =>
  profiles.deactivate(domain),
);

profiles.on('event', publishProfileEvent);
daemon.on('error', (payload: { message: string }) =>
  publishProfileEvent({
    type: 'runtimeError',
    error: { code: 'daemonError', message: payload.message },
  }),
);
daemon.on('diagnosticKey', (payload) => {
  console.info(`[diagnostics:key] ${JSON.stringify(payload)}`);
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('diagnostics:key', payload);
});

void app.whenReady().then(async () => {
  app.dock?.hide();
  daemon.start();
  tray = new Tray(trayIcon());
  tray.setToolTip('Codyboard Daemon');
  tray.on('click', () => void showTrayMenu());
  if (process.platform !== 'linux')
    tray.on('right-click', () => void showTrayMenu());
  try {
    const permissions = await daemon.permissionStatus();
    if (permissions.accessibility && permissions.inputMonitoring)
      await profiles.load();
  } catch (error) {
    console.error('Unable to load Codyboard profiles', error);
  }
  if (process.platform === 'linux') tray.setContextMenu(await buildTrayMenu());
});

app.on('before-quit', () => {
  isQuitting = true;
  void releaseMIDICapture().catch(() => undefined);
  daemon.stop();
});
app.on('window-all-closed', () => {
  /* Tray daemon stays alive. */
});

import {
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  findSupportedDevices,
  type SupportedDevice,
} from '../../shared/device-catalog.js';
import { profileDomainKey } from '../../shared/hid.js';
import type { CodyboardDaemonClient } from '../daemon/codyboard-daemon-client.js';
import type { ProfileCoordinator } from '../profiles/profile-coordinator.js';

export interface TrayControllerDependencies {
  daemon: CodyboardDaemonClient;
  iconPath: string;
  profiles: ProfileCoordinator;
  showSettings(route?: string): void;
}

export class TrayController {
  private isOpening = false;
  private tray?: Tray;

  constructor(private readonly dependencies: TrayControllerDependencies) {}

  start(): void {
    this.tray = new Tray(this.loadIcon());
    this.tray.setToolTip('Codyboard Daemon');
    this.tray.on('click', () => void this.showMenu());
    if (process.platform !== 'linux')
      this.tray.on('right-click', () => void this.showMenu());
  }

  async refresh(): Promise<void> {
    if (this.tray) this.tray.setContextMenu(await this.buildMenu());
  }

  private loadIcon(): Electron.NativeImage {
    const icon = nativeImage.createFromPath(this.dependencies.iconPath);
    if (icon.isEmpty())
      throw new Error(`Unable to load tray icon: ${this.dependencies.iconPath}`);
    icon.setTemplateImage(true);
    return icon;
  }

  private async showMenu(): Promise<void> {
    if (!this.tray || this.isOpening) return;
    this.isOpening = true;
    try {
      const menu = await this.buildMenu();
      if (process.platform === 'linux') this.tray.setContextMenu(menu);
      else this.tray.popUpContextMenu(menu);
    } finally {
      this.isOpening = false;
    }
  }

  private async buildMenu(): Promise<Menu> {
    let connectedDevices: SupportedDevice[] = [];
    try {
      connectedDevices = findSupportedDevices(
        await this.dependencies.daemon.listDevices(),
      );
    } catch (error) {
      console.error('Unable to refresh tray devices', error);
    }

    return Menu.buildFromTemplate([
      ...this.connectedDeviceItems(connectedDevices),
      {
        label: 'Get Funky 🪩',
        click: () => this.dependencies.showSettings('/midi'),
      },
      {
        label: 'Open Codyboard…',
        click: () => this.dependencies.showSettings('/'),
      },
      {
        label: 'Setup…',
        click: () => this.dependencies.showSettings('/setup'),
      },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]);
  }

  private connectedDeviceItems(
    devices: readonly SupportedDevice[],
  ): MenuItemConstructorOptions[] {
    if (devices.length === 0) return [];
    return [
      { label: 'Connected Devices', enabled: false },
      ...devices.map((device) => this.deviceItem(device)),
      { type: 'separator' },
    ];
  }

  private deviceItem(device: SupportedDevice): MenuItemConstructorOptions {
    const keyboard =
      this.dependencies.profiles.snapshot().keyboards[
        profileDomainKey(device.profileDomain)
      ];
    const profileItems: MenuItemConstructorOptions[] =
      keyboard?.profiles.map((profile) => ({
        label: profile.id === 'default' ? 'Default' : profile.name,
        type: 'checkbox',
        checked: keyboard.activeProfile?.id === profile.id,
        click: () => void this.setProfile(device, profile.id),
      })) ?? [];
    if (profileItems.length === 0)
      profileItems.push({ label: 'No profiles', enabled: false });

    return {
      label: device.hid.product?.trim() || device.name,
      submenu: [
        ...profileItems,
        {
          label: 'Inactivated',
          type: 'checkbox',
          checked: !keyboard?.activeProfile,
          click: () => void this.setProfile(device),
        },
        { type: 'separator' },
        {
          label: 'Open Settings…',
          click: () => this.dependencies.showSettings(deviceRoute(device)),
        },
      ],
    };
  }

  private async setProfile(
    device: SupportedDevice,
    profileId?: string,
  ): Promise<void> {
    try {
      if (profileId)
        await this.dependencies.profiles.activate(device.profileDomain, profileId);
      else await this.dependencies.profiles.deactivate(device.profileDomain);
    } catch (error) {
      console.error('Unable to change device profile from the tray', error);
    }
  }
}

function deviceRoute(device: SupportedDevice): string {
  return `/devices/${encodeURIComponent(device.hid.id)}?model=${encodeURIComponent(device.model)}`;
}

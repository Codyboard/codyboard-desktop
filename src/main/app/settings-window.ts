import path from 'node:path';

import { BrowserWindow, screen } from 'electron';

export interface SettingsWindowDependencies {
  currentDir: string;
  developmentURL?: string;
  releaseMIDICapture(): Promise<void>;
  stopDiagnostics(): Promise<unknown>;
}

export class SettingsWindowController {
  private isQuitting = false;
  private window?: BrowserWindow;

  constructor(private readonly dependencies: SettingsWindowDependencies) {}

  get browserWindow(): BrowserWindow | undefined {
    return this.window;
  }

  beginQuit(): void {
    this.isQuitting = true;
  }

  show(route = '/'): void {
    if (!route.startsWith('/midi')) void this.releaseMIDICapture();
    if (!this.window) this.window = this.createWindow(route);
    else void this.navigate(route);
    this.window.show();
    this.window.focus();
  }

  private createWindow(initialRoute: string): BrowserWindow {
    const workArea = screen.getPrimaryDisplay().workArea;
    const maximumWidth = Math.floor(workArea.width * 0.75);
    const maximumHeight = Math.floor(workArea.height * 0.75);
    const width = Math.min(maximumWidth, Math.floor((maximumHeight * 16) / 10));
    const height = Math.floor((width * 10) / 16);
    const window = new BrowserWindow({
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
        preload: path.join(this.dependencies.currentDir, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.on('close', (event) => this.handleClose(event));
    window.webContents.on('render-process-gone', () => {
      void this.releaseMIDICapture();
    });
    window.webContents.once('did-finish-load', () => {
      void this.navigate(initialRoute);
    });
    if (this.dependencies.developmentURL)
      void window.loadURL(this.dependencies.developmentURL);
    else
      void window.loadFile(
        path.join(this.dependencies.currentDir, '..', 'dist', 'index.html'),
      );
    return window;
  }

  private handleClose(event: Electron.Event): void {
    this.window?.webContents.setAudioMuted(true);
    if (this.isQuitting) return;
    event.preventDefault();
    this.window?.hide();
    void this.window?.webContents.executeJavaScript(
      `if (window.location.hash.startsWith('#/midi')) window.location.hash = '/'`,
    );
    void this.releaseMIDICapture();
    void this.dependencies.stopDiagnostics().catch((error: unknown) =>
      console.error('Unable to stop diagnostics', error),
    );
  }

  private async navigate(route: string): Promise<void> {
    await this.window?.webContents.executeJavaScript(
      `window.location.hash = ${JSON.stringify(route)}`,
    );
    if (this.window?.isVisible()) this.window.webContents.setAudioMuted(false);
  }

  private async releaseMIDICapture(): Promise<void> {
    await this.dependencies.releaseMIDICapture().catch(() => undefined);
  }
}

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HIDListOptions, ProfileDraft, ProfileEvent } from "../shared/hid.js";
import { HIDBridge } from "./hid-bridge.js";
import { ProfileService } from "./profile-service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const daemonPath = app.isPackaged
  ? path.join(process.resourcesPath, "bin", "CodyboardDaemon")
  : path.join(currentDir, "..", "resources", "bin", "CodyboardDaemon");
const defaultConfigPath = app.isPackaged
  ? path.join(process.resourcesPath, "default-config")
  : path.join(currentDir, "..", "resources", "default-config");
let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;
const daemon = new HIDBridge(daemonPath);
const profiles = new ProfileService(daemon, undefined, defaultConfigPath);

function trayIcon(): Electron.NativeImage {
  // Seven keycaps form a pixel-sharp "C" at macOS menu-bar size.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><g fill="black"><rect x="1.5" y="2" width="4" height="4" rx="1"/><rect x="7" y="2" width="4" height="4" rx="1"/><rect x="12.5" y="2" width="4" height="4" rx="1"/><rect x="1.5" y="7" width="4" height="4" rx="1"/><rect x="1.5" y="12" width="4" height="4" rx="1"/><rect x="7" y="12" width="4" height="4" rx="1"/><rect x="12.5" y="12" width="4" height="4" rx="1"/></g></svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  icon.setTemplateImage(true);
  return icon;
}

function publishProfileEvent(event: ProfileEvent): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("profiles:event", event);
}

function showSettings(): void {
  if (!settingsWindow) {
    settingsWindow = new BrowserWindow({
      width: 720,
      height: 520,
      show: false,
      title: "Codyboard Settings",
      backgroundColor: "#090b0c",
      webPreferences: {
        preload: path.join(currentDir, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    settingsWindow.on("close", (event) => {
      if (!isQuitting) {
        event.preventDefault();
        settingsWindow?.hide();
        void daemon.setDiagnostics().catch((error: unknown) => console.error("Unable to stop diagnostics", error));
      }
    });
    if (isDevelopment) void settingsWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    else void settingsWindow.loadFile(path.join(currentDir, "..", "dist", "index.html"));
  }
  settingsWindow.show();
  settingsWindow.focus();
  void daemon.setDiagnostics(40).catch((error: unknown) => publishProfileEvent({
    type: "runtimeError",
    error: { code: "diagnosticsError", message: error instanceof Error ? error.message : String(error) }
  }));
}

ipcMain.handle("hid:list", (_event, options?: HIDListOptions) => daemon.list(options));
ipcMain.handle("keyboard:send", (_event, output) => daemon.send(output));
ipcMain.handle("profiles:load", () => profiles.load());
ipcMain.handle("profiles:reload", () => profiles.reload());
ipcMain.handle("profiles:snapshot", () => profiles.snapshot());
ipcMain.handle("profiles:create", (_event, type: number, draft: ProfileDraft) => profiles.create(type, draft));
ipcMain.handle("profiles:update", (_event, type: number, id: string, draft: ProfileDraft) => profiles.update(type, id, draft));
ipcMain.handle("profiles:remove", (_event, type: number, id: string) => profiles.remove(type, id));
ipcMain.handle("profiles:activate", (_event, type: number, id: string) => profiles.activate(type, id));
ipcMain.handle("profiles:deactivate", (_event, type: number) => profiles.deactivate(type));

profiles.on("event", publishProfileEvent);
daemon.on("error", (payload: { message: string }) => publishProfileEvent({
  type: "runtimeError", error: { code: "daemonError", message: payload.message }
}));
daemon.on("diagnosticKey", (payload) => {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("diagnostics:key", payload);
});

app.whenReady().then(async () => {
  daemon.start();
  tray = new Tray(trayIcon());
  tray.setToolTip("Codyboard Daemon");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Settings…", click: showSettings },
    { type: "separator" },
    { label: "Quit", role: "quit" }
  ]));
  try { await profiles.load(); }
  catch (error) { console.error("Unable to load Codyboard profiles", error); }
});

app.on("before-quit", () => { isQuitting = true; daemon.stop(); });
app.on("window-all-closed", () => { /* Tray daemon stays alive. */ });

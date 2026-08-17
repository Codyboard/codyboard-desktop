import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HIDEventName, HIDFilter } from "../shared/hid.js";
import { HIDBridge } from "./hid-bridge.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const helperPath = app.isPackaged
  ? path.join(process.resourcesPath, "bin", "CodyboardHIDHelper")
  : path.join(currentDir, "..", "resources", "bin", "CodyboardHIDHelper");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const bridge = new HIDBridge(helperPath);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 640,
    minHeight: 480,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#090b0c",
    webPreferences: {
      preload: path.join(currentDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  if (isDevelopment) void window.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else void window.loadFile(path.join(currentDir, "..", "dist", "index.html"));
  return window;
}

function trayIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path fill="black" d="M3 2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM4.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  icon.setTemplateImage(true);
  return icon;
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip("Codyboard Presenter");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Codyboard", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on("click", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });
}

for (const event of ["keydown", "keyup", "deviceconnected", "devicedisconnected", "error"] as HIDEventName[]) {
  bridge.on(event, (payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(`hid:${event}`, payload);
  });
}

ipcMain.handle("hid:get", (_event, filter: HIDFilter) => bridge.get(filter));
ipcMain.handle("window:hide", () => mainWindow?.hide());

app.whenReady().then(() => {
  bridge.start();
  // Native capture belongs to the app process, not the renderer window lifecycle.
  // It remains active while the window is hidden and the tray app is still running.
  void bridge.get({ type: 40 }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("hid:error", { message });
  });
  mainWindow = createWindow();
  createTray();
  app.on("activate", () => {
    if (!mainWindow) mainWindow = createWindow();
    mainWindow.show();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  bridge.stop();
});

app.on("window-all-closed", () => {
  // macOS menu bar apps stay alive until the tray menu explicitly quits.
});

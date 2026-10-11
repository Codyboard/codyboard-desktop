import { contextBridge, ipcRenderer } from "electron";

import type { CodyboardAPI, ProfileEvent } from "../shared/hid.js";

const api: CodyboardAPI = {
  appearance: { set: (theme) => ipcRenderer.invoke("appearance:set", theme) },
  applications: {
    pick: () => ipcRenderer.invoke("applications:pick"),
    resolve: (bundleId) => ipcRenderer.invoke("applications:resolve", bundleId),
  },
  listHIDs: (options) => ipcRenderer.invoke("hid:list", options),
  midi: {
    setExclusiveDevice: (deviceId, ownerId) =>
      ipcRenderer.invoke("midi:set-exclusive-device", deviceId, ownerId),
  },
  keyboard: { send: (output) => ipcRenderer.invoke("keyboard:send", output) },
  permissions: {
    status: () => ipcRenderer.invoke("permissions:status"),
    openSettings: (permission) => ipcRenderer.invoke("permissions:open-settings", permission),
  },
  profiles: {
    load: () => ipcRenderer.invoke("profiles:load"),
    reload: () => ipcRenderer.invoke("profiles:reload"),
    snapshot: () => ipcRenderer.invoke("profiles:snapshot"),
    create: (type, draft) => ipcRenderer.invoke("profiles:create", type, draft),
    ensureDefault: (domain, draft) => ipcRenderer.invoke("profiles:ensure-default", domain, draft),
    update: (type, id, draft) => ipcRenderer.invoke("profiles:update", type, id, draft),
    remove: (type, id) => ipcRenderer.invoke("profiles:remove", type, id),
    activate: (type, id) => ipcRenderer.invoke("profiles:activate", type, id),
    deactivate: (type) => ipcRenderer.invoke("profiles:deactivate", type),
    onEvent: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, value: ProfileEvent) => handler(value);
      ipcRenderer.on("profiles:event", listener);
      return () => ipcRenderer.removeListener("profiles:event", listener);
    }
  },
  voice: {
    snapshot: () => ipcRenderer.invoke("voice:snapshot"),
    update: (settings) => ipcRenderer.invoke("voice:update", settings),
    testTone: () => ipcRenderer.invoke("voice:test-tone"),
    onEvent: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof handler>[0]) => handler(value);
      ipcRenderer.on("voice:event", listener);
      return () => ipcRenderer.removeListener("voice:event", listener);
    },
  },
  diagnostics: {
    setKeyboardType: (keyboardType) => ipcRenderer.invoke("diagnostics:set", keyboardType),
    onKey: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof handler>[0]) => handler(value);
      ipcRenderer.on("diagnostics:key", listener);
      return () => ipcRenderer.removeListener("diagnostics:key", listener);
    }
  }
};

contextBridge.exposeInMainWorld("codyboard", api);

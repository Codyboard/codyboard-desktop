import { contextBridge, ipcRenderer } from "electron";
import type { CodyboardAPI, ProfileEvent } from "../shared/hid.js";

const api: CodyboardAPI = {
  listHIDs: (options) => ipcRenderer.invoke("hid:list", options),
  keyboard: { send: (output) => ipcRenderer.invoke("keyboard:send", output) },
  profiles: {
    load: () => ipcRenderer.invoke("profiles:load"),
    reload: () => ipcRenderer.invoke("profiles:reload"),
    snapshot: () => ipcRenderer.invoke("profiles:snapshot"),
    create: (type, draft) => ipcRenderer.invoke("profiles:create", type, draft),
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
  diagnostics: {
    onKey: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof handler>[0]) => handler(value);
      ipcRenderer.on("diagnostics:key", listener);
      return () => ipcRenderer.removeListener("diagnostics:key", listener);
    }
  },
  window: { hide: async () => undefined }
};

contextBridge.exposeInMainWorld("codyboard", api);

import { contextBridge, ipcRenderer } from "electron";
import type { CodyboardAPI, HIDEventMap, HIDEventName, HIDFilter } from "../shared/hid.js";

const api: CodyboardAPI = {
  getHID: (filter: HIDFilter) => ipcRenderer.invoke("hid:get", filter),
  hid: {
    on: <K extends HIDEventName>(event: K, handler: (payload: HIDEventMap[K]) => void) => {
      const listener = (_ipcEvent: Electron.IpcRendererEvent, payload: HIDEventMap[K]) => handler(payload);
      ipcRenderer.on(`hid:${event}`, listener);
      return () => ipcRenderer.removeListener(`hid:${event}`, listener);
    }
  },
  window: {
    hide: () => ipcRenderer.invoke("window:hide")
  }
};

contextBridge.exposeInMainWorld("codyboard", api);

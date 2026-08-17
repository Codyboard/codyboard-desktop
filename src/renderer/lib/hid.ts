import type { HIDDeviceInfo, HIDEventMap, HIDEventName, HIDFilter } from "../../shared/hid";

export interface HIDConnection {
  devices: HIDDeviceInfo[];
  on<K extends HIDEventName>(event: K, handler: (payload: HIDEventMap[K]) => void): () => void;
}

export async function getHID(filter: HIDFilter): Promise<HIDConnection> {
  const devices = await window.codyboard.getHID(filter);
  return {
    devices,
    on<K extends HIDEventName>(event: K, handler: (payload: HIDEventMap[K]) => void) {
      return window.codyboard.hid.on(event, handler);
    }
  };
}

export const hidEvents = {
  on<K extends HIDEventName>(event: K, handler: (payload: HIDEventMap[K]) => void) {
    return window.codyboard.hid.on(event, handler);
  }
};

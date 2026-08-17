export interface HIDFilter {
  /** Value of CGEventField.keyboardEventKeyboardType (Codyboard Presenter is 40). */
  type?: number;
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
  transport?: string;
  /** Reserved for selecting a physical IOHID device in the multi-device milestone. */
  id?: string;
}

export interface HIDDeviceInfo {
  id: string;
  type?: number;
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  transport?: string;
  locationId?: number;
  properties: Record<string, string>;
}

export interface HIDKeyEvent {
  device: HIDDeviceInfo;
  key: string;
  code: number;
  usagePage: number;
  pressed: boolean;
  value: number;
  timestamp: number;
  flags: number;
}

export interface HIDEventMap {
  keydown: HIDKeyEvent;
  keyup: HIDKeyEvent;
  deviceconnected: HIDDeviceInfo;
  devicedisconnected: HIDDeviceInfo;
  error: { message: string };
}

export type HIDEventName = keyof HIDEventMap;

export interface CodyboardAPI {
  getHID(filter: HIDFilter): Promise<HIDDeviceInfo[]>;
  hid: {
    on<K extends HIDEventName>(event: K, handler: (payload: HIDEventMap[K]) => void): () => void;
  };
  window: {
    hide(): Promise<void>;
  };
}

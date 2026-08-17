import type { HIDDeviceInfo } from "../../shared/hid";

export type SupportedDeviceModel = "xiaomi-presenter" | "sweep-pro";

export interface SupportedDeviceDefinition {
  keyboardType?: number;
  model: SupportedDeviceModel;
  name: string;
  vendorId: number;
  productId: number;
}

export interface SupportedDevice extends SupportedDeviceDefinition {
  hid: HIDDeviceInfo;
}

export const SUPPORTED_DEVICES: readonly SupportedDeviceDefinition[] = [
  {
    keyboardType: 40,
    model: "xiaomi-presenter",
    name: "Xiaomi Presenter",
    vendorId: 0x2717,
    productId: 0x32b8,
  },
  {
    model: "sweep-pro",
    name: "Sweep Pro",
    vendorId: 0x1d50,
    productId: 0x615e,
  },
];

export function findSupportedDevices(devices: readonly HIDDeviceInfo[]): SupportedDevice[] {
  return devices.flatMap((hid) => {
    const definition = SUPPORTED_DEVICES.find(
      ({ productId, vendorId }) => hid.productId === productId && hid.vendorId === vendorId,
    );
    return definition ? [{ ...definition, hid }] : [];
  });
}

export function getDeviceDefinition(model: string | null): SupportedDeviceDefinition | undefined {
  return SUPPORTED_DEVICES.find((device) => device.model === model);
}

import type { HIDDeviceInfo } from './hid.js';

export type SupportedDeviceModel = 'xiaomi-presenter' | 'sweep-pro';

export interface SupportedDeviceDefinition {
  keyboardType?: number;
  model: SupportedDeviceModel;
  name: string;
  vendorId: number;
  productId: number;
}

export interface SupportedDevice extends SupportedDeviceDefinition {
  hid: HIDDeviceInfo;
  profileDomain: string;
}

export const SUPPORTED_DEVICES: readonly SupportedDeviceDefinition[] = [
  {
    keyboardType: 40,
    model: 'xiaomi-presenter',
    name: '小米蓝牙语音遥控器',
    vendorId: 0x2717,
    productId: 0x32b8,
  },
  {
    model: 'sweep-pro',
    name: 'Sweep Pro',
    vendorId: 0x1d50,
    productId: 0x615e,
  },
];

export function findSupportedDevices(
  devices: readonly HIDDeviceInfo[],
): SupportedDevice[] {
  return devices.flatMap((hid) => {
    const definition = SUPPORTED_DEVICES.find(
      ({ productId, vendorId }) =>
        hid.productId === productId && hid.vendorId === vendorId,
    );
    return definition
      ? [{ ...definition, hid, profileDomain: profileDomainForDevice(definition, hid) }]
      : [];
  });
}

export function profileDomainForDevice(
  definition: SupportedDeviceDefinition | undefined,
  hid: HIDDeviceInfo,
): string {
  if (hid.product) return hid.product;
  return definition?.name || hid.id;
}

export function getDeviceDefinition(
  model: string | null,
): SupportedDeviceDefinition | undefined {
  return SUPPORTED_DEVICES.find((device) => device.model === model);
}

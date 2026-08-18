import { describe, expect, it } from "vitest";

import { findSupportedDevices } from "./device-catalog";
import type { HIDDeviceInfo } from "./hid";

describe("device catalog", () => {
  it("uses the stable device name as the profile identity", () => {
    const hid: HIDDeviceInfo = {
      id: "sweep-pro",
      isVirtual: false,
      product: "Sweep Pro",
      productId: 0x615e,
      properties: {},
      vendorId: 0x1d50,
    };

    expect(findSupportedDevices([hid])[0]?.hid.id).toBe("sweep-pro");
    expect(findSupportedDevices([hid])[0]?.profileDomain).toBe("Sweep Pro");
    expect(findSupportedDevices([hid])[0]?.keyboardType).toBeUndefined();
  });

  it("falls back to the catalog name when HID product is empty", () => {
    const hid: HIDDeviceInfo = {
      id: "xiaomi-live-id",
      isVirtual: false,
      product: "",
      productId: 0x32b8,
      properties: {},
      vendorId: 0x2717,
    };

    expect(findSupportedDevices([hid])[0]?.profileDomain).toBe("小米蓝牙语音遥控器");
  });

  it("preserves the HID product name exactly", () => {
    const hid: HIDDeviceInfo = {
      id: "live-id",
      isVirtual: false,
      product: "  Sweep  PRO  ",
      productId: 0x615e,
      properties: {},
      vendorId: 0x1d50,
    };

    expect(findSupportedDevices([hid])[0]?.profileDomain).toBe("  Sweep  PRO  ");
  });
});

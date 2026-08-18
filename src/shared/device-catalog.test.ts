import { describe, expect, it } from "vitest";

import { findSupportedDevices } from "./device-catalog";
import type { HIDDeviceInfo } from "./hid";

describe("device catalog", () => {
  it("leaves the Sweep Pro keyboard type unresolved until input is observed", () => {
    const hid: HIDDeviceInfo = {
      id: "sweep-pro",
      isVirtual: false,
      productId: 0x615e,
      properties: {},
      vendorId: 0x1d50,
    };

    expect(findSupportedDevices([hid])[0]?.keyboardType).toBeUndefined();
  });
});

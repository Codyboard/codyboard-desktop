import { describe, expect, it } from "vitest";

import { SWEEP_PRO_CONTROLS } from "./DeviceButtonMappings";

describe("Sweep Pro controls", () => {
  it("maps every printed key to itself by default", () => {
    expect(SWEEP_PRO_CONTROLS.map(({ key }) => key)).toEqual([
      "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
    ]);
    for (const control of SWEEP_PRO_CONTROLS) {
      expect(control.input).toEqual({ kind: "keyboard", key: control.key.toLowerCase(), modifiers: [] });
      expect(control.defaultOutput).toEqual({ kind: "keyboard", key: control.key.toLowerCase(), modifiers: [] });
    }
  });
});

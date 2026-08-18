import { describe, expect, it } from "vitest";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

import { sweepProKeyForDiagnostic, sweepProKnobDelta } from "./SweepPro";

const event = (overrides: Partial<HIDDiagnosticEvent> = {}): HIDDiagnosticEvent => ({
  code: 17,
  deviceId: "Sweep Pro",
  eventType: "keydown",
  flags: 0,
  source: "keyCode",
  timestamp: 0,
  ...overrides,
});

describe("Sweep Pro hardware diagnostics", () => {
  it("maps a key from the exact physical device", () => {
    expect(sweepProKeyForDiagnostic(event(), "Sweep Pro")).toBe("T");
  });

  it("rejects input from any other keyboard", () => {
    expect(sweepProKeyForDiagnostic(event({ deviceId: undefined }), "Sweep Pro")).toBeUndefined();
    expect(sweepProKeyForDiagnostic(event({ deviceId: "Built-in Keyboard" }), "Sweep Pro")).toBeUndefined();
    expect(sweepProKeyForDiagnostic(event(), "sweep-pro")).toBeUndefined();
  });

  it("maps consumer controls from the exact physical device", () => {
    expect(sweepProKeyForDiagnostic(event({ code: 0xe9, source: "hidUsage" }), "Sweep Pro"))
      .toBe("volumeUp");
  });
});

describe("Sweep Pro volume knob", () => {
  it("adds 12 degrees for volume up and subtracts 12 for volume down", () => {
    expect(sweepProKnobDelta("volumeUp")).toBe(12);
    expect(sweepProKnobDelta("volumeDown")).toBe(-12);
  });

  it("does not rotate for a non-volume key", () => {
    expect(sweepProKnobDelta("mute")).toBe(0);
  });
});

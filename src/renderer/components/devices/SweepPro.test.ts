import { describe, expect, it } from "vitest";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

import {
  acceptKnobPulse, IDLE_KNOB_PULSE_GUARD, KNOB_REVERSAL_MS,
  sweepProKeyForDiagnostic, sweepProKnobDelta,
} from "./SweepPro";

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

describe("Sweep Pro knob debounce", () => {
  it("accepts the first pulse whenever it arrives", () => {
    const pulse = acceptKnobPulse(IDLE_KNOB_PULSE_GUARD, 1, 0);
    expect(pulse.accepted).toBe(true);
    expect(pulse.guard).toEqual({ direction: 1, time: 0 });
  });

  it("drops a reversal that arrives inside the bounce window", () => {
    const first = acceptKnobPulse(IDLE_KNOB_PULSE_GUARD, 1, 1_000);
    const bounce = acceptKnobPulse(first.guard, -1, 1_000 + KNOB_REVERSAL_MS - 1);
    expect(bounce.accepted).toBe(false);
    expect(bounce.guard).toBe(first.guard);
  });

  it("accepts a reversal once the window has passed", () => {
    const first = acceptKnobPulse(IDLE_KNOB_PULSE_GUARD, 1, 1_000);
    const back = acceptKnobPulse(first.guard, -1, 1_000 + KNOB_REVERSAL_MS);
    expect(back.accepted).toBe(true);
    expect(back.guard).toEqual({ direction: -1, time: 1_000 + KNOB_REVERSAL_MS });
  });

  it("never slows a turn that keeps going the same way", () => {
    const first = acceptKnobPulse(IDLE_KNOB_PULSE_GUARD, 1, 1_000);
    const next = acceptKnobPulse(first.guard, 1, 1_001);
    expect(next.accepted).toBe(true);
    expect(next.guard.time).toBe(1_001);
  });

  it("measures the window from the last accepted pulse, not the last bounce", () => {
    const first = acceptKnobPulse(IDLE_KNOB_PULSE_GUARD, 1, 1_000);
    const bounce = acceptKnobPulse(first.guard, -1, 1_004);
    expect(bounce.accepted).toBe(false);
    expect(acceptKnobPulse(bounce.guard, -1, 1_000 + KNOB_REVERSAL_MS).accepted).toBe(true);
  });
});

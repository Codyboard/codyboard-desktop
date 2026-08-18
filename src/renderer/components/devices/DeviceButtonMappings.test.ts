import { describe, expect, it } from "vitest";

import { recordedKeyboardOutput, SWEEP_PRO_CONTROLS } from "./DeviceButtonMappings";

describe("Sweep Pro controls", () => {
  it("maps every physical key to itself by default", () => {
    expect(SWEEP_PRO_CONTROLS.map(({ key }) => key)).toEqual([
      "leftShift", "tab",
      "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
    ]);
    expect(SWEEP_PRO_CONTROLS[0]?.input).toEqual({ key: "shift", kind: "modifier", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[0]?.defaultOutput).toEqual({ key: "shift", kind: "modifier", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[1]?.input).toEqual({ key: "tab", kind: "keyboard", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[1]?.defaultOutput).toEqual({ key: "tab", kind: "keyboard", modifiers: [] });
    for (const control of SWEEP_PRO_CONTROLS.slice(2)) {
      expect(control.input).toEqual({ kind: "keyboard", key: control.key.toLowerCase(), modifiers: [] });
      expect(control.defaultOutput).toEqual({ kind: "keyboard", key: control.key.toLowerCase(), modifiers: [] });
    }
  });
});

describe("keystroke recording", () => {
  const keyboardEvent = (overrides: Partial<Parameters<typeof recordedKeyboardOutput>[0]>) => ({
    altKey: false,
    code: "KeyB",
    ctrlKey: false,
    getModifierState: () => false,
    key: "b",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });

  it("records the physical letter separately from Option and Command", () => {
    expect(recordedKeyboardOutput(keyboardEvent({ altKey: true, key: "∫", metaKey: true }))).toEqual({
      key: "b",
      kind: "keyboard",
      modifiers: ["command", "option"],
    });
  });

  it("does not treat Option dead keys or Shift punctuation as the base key", () => {
    expect(recordedKeyboardOutput(keyboardEvent({ altKey: true, code: "KeyE", key: "Dead" }))).toMatchObject({ key: "e" });
    expect(recordedKeyboardOutput(keyboardEvent({ code: "BracketLeft", key: "{", shiftKey: true }))).toEqual({
      key: "[",
      kind: "keyboard",
      modifiers: ["shift"],
    });
  });
});

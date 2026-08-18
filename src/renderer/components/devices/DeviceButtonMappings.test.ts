import { describe, expect, it } from "vitest";

import {
  mappingPreviewForControl,
  recordedKeyboardOutput,
  SWEEP_PRO_CONTROLS,
} from "./DeviceButtonMappings";

describe("Sweep Pro controls", () => {
  it("maps every physical key to itself by default", () => {
    expect(SWEEP_PRO_CONTROLS.map(({ key }) => key)).toEqual([
      "leftShift", "tab", "mute", "volumeUp", "volumeDown",
      "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
    ]);
    expect(SWEEP_PRO_CONTROLS[0]?.input).toEqual({ key: "shift", kind: "modifier", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[0]?.defaultOutput).toEqual({ key: "shift", kind: "modifier", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[1]?.input).toEqual({ key: "tab", kind: "keyboard", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS[1]?.defaultOutput).toEqual({ key: "tab", kind: "keyboard", modifiers: [] });
    expect(SWEEP_PRO_CONTROLS.slice(2, 5).map(({ input }) => input)).toEqual([
      { key: "mute", kind: "system" },
      { key: "volumeUp", kind: "system" },
      { key: "volumeDown", kind: "system" },
    ]);
    for (const control of SWEEP_PRO_CONTROLS.slice(5)) {
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

describe("device mapping previews", () => {
  const control = SWEEP_PRO_CONTROLS.find(({ key }) => key === "A")!;

  it("shows only successfully resolved outputs", () => {
    expect(mappingPreviewForControl(control, undefined, {})).toBeUndefined();
    expect(mappingPreviewForControl(control, { kind: "suppress" }, {})).toBeUndefined();
    expect(mappingPreviewForControl(control, { key: "k", kind: "keyboard", modifiers: ["command"] }, {}))
      .toEqual({ compact: true, kind: "key", label: "⌘  K" });
  });

  it("prefers a Lucide icon for a known special key", () => {
    const preview = mappingPreviewForControl(control, { key: "playPause", kind: "system" }, {});
    expect(preview).toMatchObject({ kind: "key", label: "Play / Pause" });
    expect(preview?.kind === "key" && preview.icon).toBeDefined();
  });

  it("uses the resolved application identity", () => {
    expect(mappingPreviewForControl(control, { bundleId: "com.openai.codex", kind: "launchApplication" }, {
      "com.openai.codex": {
        bundleId: "com.openai.codex",
        iconDataUrl: "data:image/png;base64,icon",
        name: "Codex",
        path: "/Applications/Codex.app",
      },
    })).toEqual({
      bundleId: "com.openai.codex",
      iconDataUrl: "data:image/png;base64,icon",
      kind: "application",
      label: "Codex",
    });
  });

  it("shows an open URL as a link action", () => {
    const preview = mappingPreviewForControl(control, { kind: "openURL", url: "file:///tmp/demo.pdf" }, {});
    expect(preview).toMatchObject({ kind: "key", label: "file:///tmp/demo.pdf" });
    expect(preview?.kind === "key" && preview.icon).toBeDefined();
  });
});

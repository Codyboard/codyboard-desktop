import { describe, expect, it } from "vitest";

import type { ProfileDocument, ProfileStateDocument } from "../../shared/hid.js";

import { compileProfiles, parseProfileDocument } from "./profile-schema.js";

const validDocument: ProfileDocument = {
  version: 1,
  keyboards: [{
    deviceId: "0x100004baa",
    profiles: [{
      id: "presenter",
      name: "Presenter",
      groups: [
        { id: "global", scope: { kind: "global" }, mappings: [{
          id: "left-to-l", from: { kind: "keyboard", key: "arrowLeft" }, to: { kind: "keyboard", key: "l" }
        }] },
        { id: "codex", scope: { kind: "application", bundleId: "com.openai.codex" }, mappings: [{
          id: "left-to-command-b", from: { kind: "keyboard", key: "arrowLeft" },
          to: { kind: "keyboard", key: "b", modifiers: ["command"] }
        }] }
      ]
    }]
  }]
};

describe("profile schema", () => {
  it("compiles symbolic mappings into a daemon snapshot", () => {
    const state: ProfileStateDocument = { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } };
    const compiled = compileProfiles(parseProfileDocument(validDocument), state, 7);
    expect(compiled.generation).toBe(7);
    expect(compiled.profiles[0].global[0].trigger.code).toBe(123);
    expect(compiled.profiles[0].applications["com.openai.codex"][0].output).toEqual({
      kind: "keyboard", code: 11, modifiers: ["command"]
    });
  });

  it("requires exactly one global group", () => {
    const invalid = structuredClone(validDocument);
    invalid.keyboards[0].profiles[0].groups = invalid.keyboards[0].profiles[0].groups.slice(1);
    expect(() => parseProfileDocument(invalid)).toThrow(/exactly one global group/);
  });

  it("preserves launch-application outputs in the daemon snapshot", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = {
      kind: "launchApplication",
      bundleId: "com.apple.Keynote",
    };
    const compiled = compileProfiles(document, { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } }, 8);
    expect(compiled.profiles[0].global[0].output).toEqual({
      bundleId: "com.apple.Keynote",
      kind: "launchApplication",
      modifiers: [],
    });
  });

  it("rejects a launch-application output without a bundle identifier", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = {
      kind: "launchApplication",
      bundleId: "",
    };
    expect(() => parseProfileDocument(document)).toThrow();
  });

  it.each([
    "https://codyboard.app/docs",
    "file:///Users/example/Presentation.pdf",
    "obsidian://open?vault=notes",
  ])("compiles an open-URL output for %s", (url) => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = { kind: "openURL", url };
    const compiled = compileProfiles(document, { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } }, 9);
    expect(compiled.profiles[0].global[0].output).toEqual({ kind: "openURL", modifiers: [], url });
  });

  it("rejects a URL without a scheme", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = { kind: "openURL", url: "example.com/docs" };
    expect(() => parseProfileDocument(document)).toThrow(/absolute URL/);
  });

  it("compiles Unicode text with an optional trailing Enter", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = {
      kind: "typeText",
      pressEnter: true,
      text: "你好, Codyboard",
    };
    const compiled = compileProfiles(document, { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } }, 10);
    expect(compiled.profiles[0].global[0].output).toEqual({
      kind: "typeText",
      modifiers: [],
      pressEnter: true,
      text: "你好, Codyboard",
    });
  });

  it("rejects an empty text action", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = {
      kind: "typeText",
      pressEnter: false,
      text: "",
    };
    expect(() => parseProfileDocument(document)).toThrow();
  });

  it("compiles an Fn modifier stroke", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0].to = {
      kind: "modifier",
      key: "fn",
      modifiers: [],
    };
    const compiled = compileProfiles(document, { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } }, 9);
    expect(compiled.profiles[0].global[0].output).toEqual({
      code: 63,
      kind: "modifier",
      modifier: "fn",
      modifiers: [],
    });
  });

  it("compiles the synthetic voice trigger for normal profile fallback", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0] = {
      from: { kind: "voice" },
      id: "voice-to-fn",
      to: { kind: "modifier", key: "fn", modifiers: [] },
    };
    const compiled = compileProfiles(
      document,
      { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } },
      11,
    );
    expect(compiled.profiles[0].global[0].trigger).toEqual({
      code: 0,
      kind: "voice",
      modifiers: [],
    });
    expect(compiled.profiles[0].global[0].output.voiceAudioSource).toBe("remote");
  });

  it("inherits a global voice shortcut with an application audio-source override", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0] = {
      from: { kind: "voice" },
      id: "voice-to-fn",
      to: { kind: "modifier", key: "fn", modifiers: [] },
    };
    document.keyboards[0].profiles[0].groups[1].mappings = [];
    document.keyboards[0].profiles[0].groups[1].voiceAudioSource = "system";

    const compiled = compileProfiles(
      document,
      { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } },
      12,
    );

    expect(compiled.profiles[0].applications["com.openai.codex"][0]).toEqual({
      id: "voice-to-fn",
      output: {
        code: 63,
        kind: "modifier",
        modifier: "fn",
        modifiers: [],
        voiceAudioSource: "system",
      },
      trigger: { code: 0, kind: "voice", modifiers: [] },
    });
  });

  it("compiles a selected physical microphone UID", () => {
    const document = structuredClone(validDocument);
    document.keyboards[0].profiles[0].groups[0].mappings[0] = {
      from: { kind: "voice" },
      id: "voice-to-fn",
      to: { kind: "modifier", key: "fn", modifiers: [] },
    };
    document.keyboards[0].profiles[0].groups[0].voiceAudioSource = "device:built-in-mic";

    const compiled = compileProfiles(
      document,
      { version: 1, activeProfiles: { "device:0x100004baa": "presenter" } },
      13,
    );

    expect(compiled.profiles[0].global[0].output).toMatchObject({
      voiceAudioDeviceUID: "built-in-mic",
      voiceAudioSource: "device",
    });
  });

  it("rejects duplicate normalized triggers in a group", () => {
    const invalid = structuredClone(validDocument);
    invalid.keyboards[0].profiles[0].groups[0].mappings.push({
      id: "duplicate", from: { kind: "keyboard", key: "arrowLeft", modifiers: [] }, to: { kind: "suppress" }
    });
    expect(() => parseProfileDocument(invalid)).toThrow(/Duplicate trigger/);
  });
});

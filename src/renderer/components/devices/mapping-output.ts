import { Link2, TextCursorInput } from "lucide-react";

import type {
  CodyboardApplicationInfo,
  HIDModifier,
  MappingOutput,
  ProfileDraft,
} from "../../../shared/hid";
import { mappingOutputSignature } from "../../../shared/profile-mappings";

import type { DeviceControl } from "./device-controls";
import {
  KEY_OUTPUT_LABELS,
  KEY_OUTPUT_OPTIONS_BY_SIGNATURE,
} from "./mapping-output-presets";
import type { DeviceMappingPreview } from "./SweepPro";

export function mappingIdFor(
  groupId: string,
  key: string,
  profile: ProfileDraft,
): string {
  const base = `${groupId}-${key.toLowerCase()}`;
  const ids = new Set(
    profile.groups.flatMap(({ mappings }) => mappings.map(({ id }) => id)),
  );
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function applicationGroupId(
  bundleId: string,
  profile: ProfileDraft,
): string {
  const slug = bundleId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const base = `app-${slug || "application"}`;
  let candidate = base;
  let suffix = 2;
  while (profile.groups.some(({ id }) => id === candidate))
    candidate = `${base}-${suffix++}`;
  return candidate;
}

export function describeOutput(output: MappingOutput | undefined): string {
  if (!output) return "";
  const presetLabel = KEY_OUTPUT_LABELS.get(mappingOutputSignature(output));
  if (presetLabel) return presetLabel;
  if (output.kind === "suppress") return "No action";
  if (output.kind === "passthrough") return "Pass through";
  if (output.kind === "launchApplication") return output.bundleId;
  if (output.kind === "openURL") return output.url;
  if (output.kind === "typeText") return output.text;
  if (output.kind === "modifier")
    return output.key === "capsLock" ? "Caps Lock" : MODIFIER_GLYPHS[output.key];
  if (output.kind === "system")
    return output.key ?? `System ${output.systemCode}`;
  const modifiers = (output.modifiers ?? []).map(
    (modifier) => MODIFIER_GLYPHS[modifier],
  );
  return [...modifiers, displayKey(output.key ?? `Key ${output.keyCode}`)].join("  ");
}

export async function performActionTypeChange(
  action: string,
  clear: () => Promise<boolean>,
  reset: () => Promise<void>,
  activate: () => Promise<void> | void,
): Promise<void> {
  if (action === "unchanged") {
    await reset();
    return;
  }
  if (!await clear()) return;
  await activate();
}

export function mappingPreviewForControl<Key extends string>(
  control: DeviceControl<Key>,
  output: MappingOutput | undefined,
  applicationInfo: Readonly<Record<string, CodyboardApplicationInfo>>,
): DeviceMappingPreview | undefined {
  if (!output || output.kind === "suppress") return undefined;
  if (output.kind === "launchApplication") {
    const application = applicationInfo[output.bundleId];
    return {
      bundleId: output.bundleId,
      iconDataUrl: application?.iconDataUrl || undefined,
      kind: "application",
      label: application?.name ?? output.bundleId,
    };
  }
  if (output.kind === "openURL")
    return { icon: Link2, kind: "key", label: output.url };
  if (output.kind === "typeText")
    return { icon: TextCursorInput, kind: "key", label: output.text };
  if (output.kind === "passthrough") {
    if (control.input.kind === "hidUsage" || control.input.kind === "voice")
      return undefined;
    return keyPreview(control.input);
  }
  return keyPreview(output);
}

export function recordedKeyboardOutput(
  event: RecordableKeyboardEvent,
): MappingOutput | undefined {
  if (event.code === "Backspace") return { kind: "suppress" };
  if (["Alt", "Control", "Fn", "Meta", "Shift"].includes(event.key))
    return undefined;
  const key = browserKey(event.code, event.key);
  if (!key) return undefined;
  const modifiers: HIDModifier[] = [];
  if (event.metaKey) modifiers.push("command");
  if (event.ctrlKey) modifiers.push("control");
  if (event.altKey) modifiers.push("option");
  if (event.shiftKey) modifiers.push("shift");
  if (event.getModifierState("Fn")) modifiers.push("fn");
  return { kind: "keyboard", key, modifiers };
}

interface RecordableKeyboardEvent {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  getModifierState(key: string): boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

function keyPreview(
  output: Exclude<
    MappingOutput,
    | { kind: "launchApplication" }
    | { kind: "openURL" }
    | { kind: "passthrough" }
    | { kind: "suppress" }
    | { kind: "typeText" }
  >,
): DeviceMappingPreview {
  const option = KEY_OUTPUT_OPTIONS_BY_SIGNATURE.get(
    mappingOutputSignature(output),
  );
  const compact = "modifiers" in output && (output.modifiers?.length ?? 0) > 0;
  return {
    ...(compact ? { compact: true } : {}),
    ...(option ? { icon: option.icon } : {}),
    kind: "key",
    label: describeOutput(output),
  };
}

const MODIFIER_GLYPHS: Readonly<Record<HIDModifier, string>> = {
  command: "⌘",
  control: "⌃",
  fn: "fn",
  option: "⌥",
  shift: "⇧",
};

const NAMED_KEYS: Readonly<Record<string, string>> = {
  arrowDown: "↓",
  arrowLeft: "←",
  arrowRight: "→",
  arrowUp: "↑",
  backspace: "Backspace",
  deleteForward: "Delete",
  enter: "Enter",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
};

function displayKey(key: string): string {
  return NAMED_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function browserKey(code: string, key: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1\d|20)$/.test(code)) return code.toLowerCase();
  const namedCodes: Readonly<Record<string, string>> = {
    ArrowDown: "arrowDown", ArrowLeft: "arrowLeft", ArrowRight: "arrowRight",
    ArrowUp: "arrowUp", Backquote: "`", Backslash: "\\", BracketLeft: "[",
    BracketRight: "]", Comma: ",", Delete: "deleteForward", End: "end",
    Enter: "enter", Equal: "=", Escape: "escape", Home: "home",
    IntlBackslash: "\\", Minus: "-", PageDown: "pageDown", PageUp: "pageUp",
    Period: ".", Quote: "'", Semicolon: ";", Slash: "/", Space: "space",
    Tab: "tab",
  };
  if (namedCodes[code]) return namedCodes[code];
  if (/^F(?:[1-9]|1\d|20)$/.test(key)) return key.toLowerCase();
  return key.length === 1 ? key.toLowerCase() : undefined;
}

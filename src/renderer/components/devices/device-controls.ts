import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerDownLeft,
  Home,
  Menu,
  Minus,
  Plus,
  Tv,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";

import type { MappingInput, MappingOutput, ProfileDraft } from "../../../shared/hid";

import type { SweepProKey } from "./SweepPro";
import type { XiaomiRemoteKey } from "./XiaomiRemote";

export interface DeviceControl<Key extends string> {
  defaultOutput?: MappingOutput;
  icon?: LucideIcon;
  input: MappingInput;
  key: Key;
  label: string;
  legend?: string;
}

export const XIAOMI_REMOTE_CONTROLS: readonly DeviceControl<XiaomiRemoteKey>[] = [
  { icon: ChevronUp, input: { kind: "keyboard", key: "arrowUp", modifiers: ["fn"] }, key: "up", label: "Up" },
  { icon: ChevronDown, input: { kind: "keyboard", key: "arrowDown", modifiers: ["fn"] }, key: "down", label: "Down" },
  { icon: ChevronLeft, input: { kind: "keyboard", key: "arrowLeft", modifiers: ["fn"] }, key: "left", label: "Left" },
  { icon: ChevronRight, input: { kind: "keyboard", key: "arrowRight", modifiers: ["fn"] }, key: "right", label: "Right" },
  { icon: CornerDownLeft, input: { kind: "keyboard", key: "enter", modifiers: [] }, key: "enter", label: "Enter" },
  { icon: Undo2, input: { kind: "hidUsage", usage: 0xf1 }, key: "back", label: "Back" },
  { icon: Plus, input: { kind: "system", key: "volumeUp" }, key: "volumeUp", label: "Volume Up" },
  { icon: Minus, input: { kind: "system", key: "volumeDown" }, key: "volumeDown", label: "Volume Down" },
  { icon: Home, input: { kind: "keyboard", keyCode: 115, modifiers: ["fn"] }, key: "home", label: "Home" },
  { icon: Menu, input: { kind: "keyboard", keyCode: 110, modifiers: [] }, key: "menu", label: "Menu" },
  { icon: Tv, input: { kind: "keyboard", key: "`", modifiers: [] }, key: "tv", label: "TV" },
];

export const SWEEP_PRO_CONTROLS: readonly DeviceControl<SweepProKey>[] = [
  {
    defaultOutput: { key: "shift", kind: "modifier", modifiers: [] },
    input: { key: "shift", kind: "modifier", modifiers: [] },
    key: "leftShift",
    label: "Left Shift",
    legend: "⇧",
  },
  {
    defaultOutput: { key: "tab", kind: "keyboard", modifiers: [] },
    input: { key: "tab", kind: "keyboard", modifiers: [] },
    key: "tab",
    label: "Tab",
    legend: "⇥",
  },
  {
    defaultOutput: { key: "mute", kind: "system" },
    icon: VolumeX,
    input: { key: "mute", kind: "system" },
    key: "mute",
    label: "Mute",
  },
  {
    defaultOutput: { key: "volumeUp", kind: "system" },
    icon: Volume2,
    input: { key: "volumeUp", kind: "system" },
    key: "volumeUp",
    label: "Volume Up",
  },
  {
    defaultOutput: { key: "volumeDown", kind: "system" },
    icon: Volume1,
    input: { key: "volumeDown", kind: "system" },
    key: "volumeDown",
    label: "Volume Down",
  },
  ...[
    "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
  ].map((key) => ({
    defaultOutput: { kind: "keyboard" as const, key: key.toLowerCase(), modifiers: [] },
    input: { kind: "keyboard" as const, key: key.toLowerCase(), modifiers: [] },
    key: key as SweepProKey,
    label: key,
    legend: key,
  })),
];

export const SWEEP_PRO_DEFAULT_PROFILE = defaultProfile(
  "Sweep Pro Default",
  SWEEP_PRO_CONTROLS,
  (control) => control.defaultOutput!,
);

export const XIAOMI_REMOTE_DEFAULT_PROFILE = defaultProfile(
  "小米蓝牙语音遥控器 Default",
  XIAOMI_REMOTE_CONTROLS,
  () => ({ kind: "passthrough" }),
);

function defaultProfile<Key extends string>(
  name: string,
  controls: readonly DeviceControl<Key>[],
  output: (control: DeviceControl<Key>) => MappingOutput,
): ProfileDraft {
  return {
    groups: [{
      id: "global",
      mappings: controls.map((control) => ({
        from: control.input,
        id: `global-${control.key.toLowerCase()}`,
        to: output(control),
      })),
      scope: { kind: "global" },
    }],
    id: "default",
    name,
  };
}

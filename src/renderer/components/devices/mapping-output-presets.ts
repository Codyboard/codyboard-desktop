import {
  AppWindow,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpFromLine,
  Bell,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  CaseUpper,
  ChevronUp,
  CirclePlay,
  Command,
  Delete,
  Dock,
  FastForward,
  GalleryVerticalEnd,
  Keyboard,
  KeyboardOff,
  LockKeyhole,
  Monitor,
  Option,
  PanelTop,
  PictureInPicture,
  Redo2,
  RefreshCw,
  Rewind,
  Rocket,
  ScreenShare,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  SquareFunction,
  StickyNote,
  SunDim,
  SunMedium,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";

import type { MappingOutput } from "../../../shared/hid";
import { mappingOutputSignature } from "../../../shared/profile-mappings";

export interface KeyOutputOption {
  id: string;
  icon: LucideIcon;
  label: string;
  output: MappingOutput;
}

export interface KeyOutputGroup {
  label: string;
  options: readonly KeyOutputOption[];
}

export const KEY_OUTPUT_GROUPS: readonly KeyOutputGroup[] = [
  {
    label: "Input Behavior",
    options: [
      preset(ArrowRightToLine, "passthrough", "Pass through", { kind: "passthrough" }),
    ],
  },
  {
    label: "Media & Volume",
    options: [
      preset(Volume2, "volume-up", "Volume Up", { kind: "system", key: "volumeUp" }),
      preset(Volume1, "volume-down", "Volume Down", { kind: "system", key: "volumeDown" }),
      preset(VolumeX, "mute", "Mute", { kind: "system", key: "mute" }),
      preset(CirclePlay, "play-pause", "Play / Pause", { kind: "system", key: "playPause" }),
      preset(SkipForward, "next-track", "Next Track", { kind: "system", key: "nextTrack" }),
      preset(SkipBack, "previous-track", "Previous Track", { kind: "system", key: "previousTrack" }),
      preset(FastForward, "fast-forward", "Fast Forward", { kind: "system", key: "fastForward" }),
      preset(Rewind, "rewind", "Rewind", { kind: "system", key: "rewind" }),
      preset(SunMedium, "brightness-up", "Display Brightness Up", { kind: "system", key: "brightnessUp" }),
      preset(SunDim, "brightness-down", "Display Brightness Down", { kind: "system", key: "brightnessDown" }),
      preset(Keyboard, "keyboard-brightness-up", "Keyboard Brightness Up", { kind: "system", key: "keyboardBrightnessUp" }),
      preset(Keyboard, "keyboard-brightness-down", "Keyboard Brightness Down", { kind: "system", key: "keyboardBrightnessDown" }),
      preset(KeyboardOff, "keyboard-brightness-toggle", "Keyboard Backlight Toggle", { kind: "system", key: "keyboardBrightnessToggle" }),
      preset(ScreenShare, "video-mirroring", "Video Mirroring", { kind: "system", key: "videoMirror" }),
      preset(ArrowUpFromLine, "eject", "Eject", { kind: "system", key: "eject" }),
    ],
  },
  {
    label: "System",
    options: [
      keyboardPreset(LockKeyhole, "lock-screen", "Lock Screen", "q", ["command", "control"]),
      keyboardPreset(GalleryVerticalEnd, "mission-control", "Mission Control", "arrowUp", ["control"]),
      keyboardPreset(AppWindow, "application-windows", "Application Windows", "arrowDown", ["control"]),
      keyboardPreset(ArrowLeft, "space-left", "Move Left a Space", "arrowLeft", ["control"]),
      keyboardPreset(ArrowRight, "space-right", "Move Right a Space", "arrowRight", ["control"]),
      keyboardPreset(Monitor, "show-desktop", "Show Desktop", "h", ["fn"]),
      keyboardPreset(Rocket, "launchpad", "Launchpad", "f4", ["fn"]),
      keyboardPreset(Search, "spotlight", "Spotlight", "space", ["command"]),
      keyboardPreset(Bell, "notification-center", "Notification Center", "n", ["fn"]),
      keyboardPreset(SlidersHorizontal, "control-center", "Control Center", "c", ["fn"]),
      keyboardPreset(Dock, "focus-dock", "Focus Dock", "a", ["fn"]),
      keyboardPreset(PanelTop, "focus-menu-bar", "Focus Menu Bar", "m", ["fn"]),
      keyboardPreset(StickyNote, "quick-note", "Quick Note", "q", ["fn"]),
      keyboardPreset(Smile, "emoji-symbols", "Emoji & Symbols", "e", ["fn"]),
      keyboardPreset(RefreshCw, "app-switcher", "Application Switcher", "tab", ["command"]),
      keyboardPreset(PictureInPicture, "next-window", "Next Window", "`", ["command"]),
    ],
  },
  {
    label: "Navigation",
    options: [
      keyboardPreset(Undo2, "browser-back", "Browser Back", "[", ["command"]),
      keyboardPreset(Redo2, "browser-forward", "Browser Forward", "]", ["command"]),
    ],
  },
  {
    label: "Special Keys",
    options: [
      modifierPreset(Command, "command", "Command", "command"),
      modifierPreset(Option, "option", "Option", "option"),
      modifierPreset(ArrowUp, "control", "Control", "control"),
      modifierPreset(ChevronUp, "shift", "Shift", "shift"),
      modifierPreset(SquareFunction, "fn", "Fn", "fn"),
      modifierPreset(CaseUpper, "caps-lock", "Caps Lock", "capsLock"),
      keyboardPreset(Delete, "escape", "Escape", "escape"),
      keyboardPreset(Delete, "delete-forward", "Forward Delete", "deleteForward"),
      keyboardPreset(BetweenHorizontalStart, "home", "Home", "home"),
      keyboardPreset(BetweenHorizontalEnd, "end", "End", "end"),
      keyboardPreset(ArrowUp, "page-up", "Page Up", "pageUp"),
      keyboardPreset(ArrowDown, "page-down", "Page Down", "pageDown"),
    ],
  },
  {
    label: "Function Keys",
    options: Array.from({ length: 20 }, (_, index) =>
      keyboardPreset(SquareFunction, `f${index + 1}`, `F${index + 1}`, `f${index + 1}`),
    ),
  },
];

export const KEY_OUTPUT_OPTIONS = new Map(
  KEY_OUTPUT_GROUPS.flatMap(({ options }) => options.map((option) => [option.id, option])),
);
export const KEY_OUTPUT_OPTIONS_BY_SIGNATURE = new Map(
  KEY_OUTPUT_GROUPS.flatMap(({ options }) =>
    options.map((option) => [mappingOutputSignature(option.output), option]),
  ),
);
export const KEY_OUTPUT_LABELS = new Map(
  KEY_OUTPUT_GROUPS.flatMap(({ options }) =>
    options.map((option) => [mappingOutputSignature(option.output), option.label]),
  ),
);

function preset(
  icon: LucideIcon,
  id: string,
  label: string,
  output: MappingOutput,
): KeyOutputOption {
  return { icon, id, label, output };
}

function keyboardPreset(
  icon: LucideIcon,
  id: string,
  label: string,
  key: string,
  modifiers: MappingOutput extends never ? never : ("command" | "control" | "fn" | "option" | "shift")[] = [],
): KeyOutputOption {
  return preset(icon, id, label, { kind: "keyboard", key, modifiers });
}

function modifierPreset(
  icon: LucideIcon,
  id: string,
  label: string,
  key: "capsLock" | "command" | "control" | "fn" | "option" | "shift",
): KeyOutputOption {
  return preset(icon, id, label, { kind: "modifier", key, modifiers: [] });
}

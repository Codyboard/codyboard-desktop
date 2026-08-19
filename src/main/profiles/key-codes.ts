import type { HIDModifier } from "../../shared/hid.js";

export const KEY_CODES: Readonly<Record<string, number>> = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24,
  "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30,
  o: 31, u: 32, "[": 33, i: 34, p: 35, enter: 36, l: 37, j: 38,
  "'": 39, k: 40, ";": 41, "\\": 42, ",": 43, "/": 44, n: 45,
  m: 46, ".": 47, tab: 48, space: 49, "`": 50, backspace: 51, escape: 53,
  commandRight: 54, command: 55, shift: 56, capsLock: 57, option: 58,
  control: 59, shiftRight: 60, optionRight: 61, controlRight: 62, fn: 63,
  f17: 64, volumeUp: 72, volumeDown: 73, mute: 74, f18: 79, f19: 80,
  f20: 90, f5: 96, f6: 97, f7: 98, f3: 99, f8: 100, f9: 101,
  f11: 103, f13: 105, f16: 106, f14: 107, f10: 109, f12: 111,
  f15: 113, help: 114, home: 115, pageUp: 116, deleteForward: 117,
  f4: 118, end: 119, f2: 120, pageDown: 121, f1: 122,
  arrowLeft: 123, arrowRight: 124, arrowDown: 125, arrowUp: 126
};

export const MODIFIER_KEY_CODES: Readonly<Record<HIDModifier | "capsLock", number>> = {
  command: 55,
  control: 59,
  option: 58,
  shift: 56,
  fn: 63,
  capsLock: 57
};

export const SYSTEM_KEY_CODES: Readonly<Record<string, number>> = {
  volumeUp: 0,
  volumeDown: 1,
  brightnessUp: 2,
  brightnessDown: 3,
  capsLock: 4,
  power: 6,
  mute: 7,
  eject: 14,
  videoMirror: 15,
  playPause: 16,
  nextTrack: 17,
  previousTrack: 18,
  fastForward: 19,
  rewind: 20,
  keyboardBrightnessUp: 21,
  keyboardBrightnessDown: 22,
  keyboardBrightnessToggle: 23
};

export const normalizeModifiers = (modifiers: readonly HIDModifier[] = []): HIDModifier[] =>
  [...new Set(modifiers)].sort();

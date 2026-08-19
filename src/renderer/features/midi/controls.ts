import { MIDI_PAD_SLOTS, padPosition, type ChordSlot, type MidiPadKey } from "./harmony";
import { DRUM_FAMILIES, type DrumFamily } from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

export type PerformanceFx = "double" | "drop" | "filter" | "half" | "riser";

export type PadAction =
  | { kind: "chord"; slot: ChordSlot }
  | { fx: PerformanceFx; kind: "fx" }
  | { family: DrumFamily; kind: "drumFamily" }
  | { index: number; kind: "rig" };

export interface ShiftLayerState {
  held: boolean;
  latched: boolean;
}

export const FX_ORDER: readonly PerformanceFx[] = ["filter", "drop", "half", "double", "riser"];

export const FX_LABELS: Readonly<Record<PerformanceFx, string>> = {
  double: "DBL", drop: "DROP", filter: "FILTER", half: "HALF", riser: "RISER",
};

export const IDLE_SHIFT_LAYER: ShiftLayerState = { held: false, latched: false };

interface DirectionModifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function directionFromModifiers(modifiers: DirectionModifiers): -1 | 1 {
  return modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey ? -1 : 1;
}

export function shiftActive(state: ShiftLayerState): boolean {
  return state.held || state.latched;
}

/** Pressing arms the layer; a second tap disarms it, so pointer users get a latch too. */
export function shiftDown(state: ShiftLayerState): ShiftLayerState {
  return { held: true, latched: !state.latched };
}

export function shiftUp(state: ShiftLayerState): ShiftLayerState {
  return { held: false, latched: state.latched };
}

export function consumeShift(state: ShiftLayerState): ShiftLayerState {
  return { held: state.held, latched: false };
}

export function padAction(key: MidiPadKey, shifted: boolean): PadAction {
  if (!shifted) return { kind: "chord", slot: MIDI_PAD_SLOTS[key] };
  const { column, row } = padPosition(key);
  if (column === 0) return { index: row % MIDI_RIGS.length, kind: "rig" };
  if (column === 1) return { family: DRUM_FAMILIES[row % DRUM_FAMILIES.length], kind: "drumFamily" };
  return { fx: FX_ORDER[row % FX_ORDER.length], kind: "fx" };
}

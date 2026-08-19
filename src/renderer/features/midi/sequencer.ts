import type { ChordSlot } from "./harmony";

export const MAX_SLOTS = 4;
/** Each chord holds for half a bar, so four slots make a two-bar loop. */
export const SLOT_STEPS = 8;

export function appendSlot(
  progression: readonly ChordSlot[],
  slot: ChordSlot,
): readonly ChordSlot[] {
  return [...progression, slot].slice(-MAX_SLOTS);
}

/** Removing a slot closes the gap, so the loop shortens instead of leaving a hole. */
export function removeSlot(
  progression: readonly ChordSlot[],
  index: number,
): readonly ChordSlot[] {
  if (index < 0 || index >= progression.length) return progression;
  return progression.filter((_, position) => position !== index);
}

export function slotAtStep(
  progression: readonly ChordSlot[],
  step: number,
): ChordSlot | undefined {
  if (progression.length === 0) return undefined;
  return progression[Math.floor(step / SLOT_STEPS) % progression.length];
}

export function wrappedIndex(index: number, delta: number, length: number): number {
  return (index + delta % length + length) % length;
}

export function adjustedTempo(bpm: number, delta: -1 | 1): number {
  return Math.max(60, Math.min(180, bpm + delta * 2));
}

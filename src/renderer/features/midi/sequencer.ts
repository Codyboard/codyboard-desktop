import type { ChordChoice } from "./harmony";

export const MAX_CHORDS = 4;

export function appendChord(
  progression: readonly ChordChoice[],
  choice: ChordChoice,
): readonly ChordChoice[] {
  return [...progression, choice].slice(-MAX_CHORDS);
}

export function chordAtStep(
  progression: readonly ChordChoice[],
  step: number,
): ChordChoice | undefined {
  if (progression.length === 0) return undefined;
  return progression[Math.floor(step / 4) % progression.length];
}

export function wrappedIndex(index: number, delta: number, length: number): number {
  return (index + delta % length + length) % length;
}

export function adjustedTempo(bpm: number, delta: -1 | 1): number {
  return Math.max(60, Math.min(180, bpm + delta * 2));
}

export type ArpeggioShape = "down" | "pulse" | "up";
export type HarmonyDegree = "III" | "VI" | "i" | "iv" | "v";

export interface ChordChoice {
  degree: HarmonyDegree;
  shape: ArpeggioShape;
}

export const MIDI_PAD_KEYS = [
  "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
] as const;
export type MidiPadKey = typeof MIDI_PAD_KEYS[number];

const rows: readonly HarmonyDegree[] = ["VI", "v", "iv", "III", "i"];
const columns: readonly ArpeggioShape[] = ["up", "down", "pulse"];
const degreeNotes: Readonly<Record<HarmonyDegree, readonly number[]>> = {
  i: [0, 3, 7], III: [3, 7, 10], iv: [5, 8, 12], v: [7, 10, 14], VI: [8, 12, 15],
};
const shapeIndices: Readonly<Record<ArpeggioShape, readonly number[]>> = {
  up: [0, 1, 2, 1], down: [2, 1, 0, 1], pulse: [0, 2, 1, 2],
};

export const MIDI_PAD_CHOICES: Readonly<Record<MidiPadKey, ChordChoice>> = Object.fromEntries(
  MIDI_PAD_KEYS.map((key, index) => [key, { degree: rows[Math.floor(index / 3)], shape: columns[index % 3] }]),
) as Readonly<Record<MidiPadKey, ChordChoice>>;

export function chordLabel(choice: ChordChoice): string {
  const shape = choice.shape === "up" ? "↑" : choice.shape === "down" ? "↓" : "•";
  return `${choice.degree}${shape}`;
}

export function arpeggioNote(choice: ChordChoice, rootMidi: number, stepInBeat: number): number {
  const chord = degreeNotes[choice.degree];
  const noteIndex = shapeIndices[choice.shape][stepInBeat % 4];
  return rootMidi + 24 + chord[noteIndex];
}

export function isMidiPadKey(key: string): key is MidiPadKey {
  return Object.hasOwn(MIDI_PAD_CHOICES, key);
}

export type HarmonyDegree = "III" | "IV" | "VI" | "i" | "v";
export type PhraseEngine = "arp" | "riff" | "stab";
export type PhraseRole = "chord" | "lead";

export interface ChordSlot {
  degree: HarmonyDegree;
  phrase: PhraseEngine;
}

export interface PhraseEvent {
  notes: readonly number[];
  role: PhraseRole;
  velocity: number;
}

export interface PhraseSource {
  arp: readonly number[];
  chordOctave: number;
  comp: string;
  leadOctave: number;
  riff: readonly number[];
}

export const MIDI_PAD_KEYS = [
  "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
] as const;
export type MidiPadKey = typeof MIDI_PAD_KEYS[number];

export const HARMONY_ROWS: readonly HarmonyDegree[] = ["VI", "v", "IV", "III", "i"];
export const PHRASE_COLUMNS: readonly PhraseEngine[] = ["stab", "arp", "riff"];

/** Dorian-leaning funk voicings: seventh and ninth stacks instead of bare triads. */
const degreeVoicings: Readonly<Record<HarmonyDegree, readonly number[]>> = {
  i: [0, 3, 7, 10],
  III: [3, 7, 10, 14],
  IV: [5, 9, 15, 19],
  v: [7, 10, 14, 17],
  VI: [8, 12, 15, 19],
};

const degreeLabels: Readonly<Record<HarmonyDegree, string>> = {
  i: "i7", III: "III", IV: "IV9", v: "v7", VI: "VI",
};

const phraseGlyphs: Readonly<Record<PhraseEngine, string>> = {
  arp: "↗", riff: "~", stab: "■",
};

const pentatonic = [0, 3, 5, 7, 10] as const;
const strongSteps = new Set([0, 4, 8, 12]);

export const MIDI_PAD_SLOTS: Readonly<Record<MidiPadKey, ChordSlot>> = Object.fromEntries(
  MIDI_PAD_KEYS.map((key, index) => [
    key,
    { degree: HARMONY_ROWS[Math.floor(index / 3)], phrase: PHRASE_COLUMNS[index % 3] },
  ]),
) as Readonly<Record<MidiPadKey, ChordSlot>>;

export function isMidiPadKey(key: string): key is MidiPadKey {
  return Object.hasOwn(MIDI_PAD_SLOTS, key);
}

export function padPosition(key: MidiPadKey): { column: number; row: number } {
  const index = MIDI_PAD_KEYS.indexOf(key);
  return { column: index % 3, row: Math.floor(index / 3) };
}

export function chordLabel(slot: ChordSlot): string {
  return `${degreeLabels[slot.degree]}${phraseGlyphs[slot.phrase]}`;
}

export function degreeLabel(degree: HarmonyDegree): string {
  return degreeLabels[degree];
}

export function chordVoicing(degree: HarmonyDegree): readonly number[] {
  return degreeVoicings[degree];
}

/** Chord tones spread across two octaves so arpeggios can climb without leaving the chord. */
export function chordTones(degree: HarmonyDegree): readonly number[] {
  const voicing = degreeVoicings[degree];
  return [...voicing, ...voicing.map((semitone) => semitone + 12)];
}

export function scaleSemitone(index: number): number {
  const octave = Math.floor(index / pentatonic.length);
  const position = ((index % pentatonic.length) + pentatonic.length) % pentatonic.length;
  return pentatonic[position] + octave * 12;
}

/** Keeps improvised riff notes consonant by pulling downbeats onto the nearest chord tone. */
export function snapToChordTone(semitone: number, degree: HarmonyDegree): number {
  const candidates = [-12, 0, 12].flatMap((octave) =>
    degreeVoicings[degree].map((tone) => tone + octave));
  let closest = semitone;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate - semitone);
    if (gap < distance) {
      closest = candidate;
      distance = gap;
    }
  }
  return closest;
}

export function phraseAt(
  slot: ChordSlot,
  source: PhraseSource,
  step: number,
): PhraseEvent | undefined {
  const index = ((step % 16) + 16) % 16;
  const accent = strongSteps.has(index) ? 1 : index % 2 === 0 ? 0.86 : 0.7;
  if (slot.phrase === "stab") {
    const mark = source.comp[index];
    if (mark !== "x" && mark !== "o") return undefined;
    return {
      notes: chordVoicing(slot.degree).map((semitone) => semitone + source.chordOctave),
      role: "chord",
      velocity: mark === "o" ? accent * 0.42 : accent,
    };
  }
  if (slot.phrase === "arp") {
    const tone = source.arp[index];
    if (tone < 0) return undefined;
    const tones = chordTones(slot.degree);
    return {
      notes: [tones[tone % tones.length] + source.chordOctave],
      role: "chord",
      velocity: accent,
    };
  }
  const degreeIndex = source.riff[index];
  if (degreeIndex < 0) return undefined;
  const raw = scaleSemitone(degreeIndex);
  const semitone = strongSteps.has(index) ? snapToChordTone(raw, slot.degree) : raw;
  return { notes: [semitone + source.leadOctave], role: "lead", velocity: accent };
}

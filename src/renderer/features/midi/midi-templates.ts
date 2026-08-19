export const MIDI_STEPS = 16;
export const LOOP_STEPS = 32;

export const DRUM_TRACKS = ["kick", "snare", "hat", "ohat", "clap", "tom", "perc"] as const;
export type DrumTrack = typeof DRUM_TRACKS[number];

export const DRUM_FAMILIES = ["FUNK", "DISCO", "HOUSE", "HIPHOP", "GLOBAL"] as const;
export type DrumFamily = typeof DRUM_FAMILIES[number];

export interface DrumKit {
  bpm: number;
  family: DrumFamily;
  name: string;
  swing: number;
  tracks: Record<DrumTrack, string>;
}

export interface BassPattern {
  /** Sixteenth-note trigger mask. */
  mask: string;
  name: string;
  /** Indices into the chord-following bass tones, one per sixteenth. */
  notes: readonly number[];
}

export const DRUM_KITS: readonly DrumKit[] = [
  {
    name: "FUNK77", family: "FUNK", bpm: 104, swing: 0.22,
    tracks: {
      kick: "x..x..x..x.x..x.", snare: "....x..x....x...", hat: "x.xxx.x.x.xxx.x.",
      ohat: "..........x.....", clap: "................", tom: ".............x.x",
      perc: "x...x...x...x..x",
    },
  },
  {
    name: "MOTOWN", family: "FUNK", bpm: 122, swing: 0.1,
    tracks: {
      kick: "x..x..x...x..x..", snare: "....x.......x...", hat: "xxxxxxxxxxxxxxxx",
      ohat: "................", clap: "..x...x...x...x.", tom: "................",
      perc: "................",
    },
  },
  {
    name: "NOLA", family: "FUNK", bpm: 96, swing: 0.18,
    tracks: {
      kick: "x..x.x..x..x.x..", snare: "..x..x.x..x..xx.", hat: "x.x.x.x.x.x.x.x.",
      ohat: "................", clap: "................", tom: "............x.x.",
      perc: "x..x..x.x..x..x.",
    },
  },
  {
    name: "BAD", family: "DISCO", bpm: 115, swing: 0.14,
    tracks: {
      kick: "x..x..x...x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "..............x.", clap: "....x.......x...", tom: "................",
      perc: "..x...x...x...x.",
    },
  },
  {
    name: "STRUT", family: "DISCO", bpm: 124, swing: 0.08,
    tracks: {
      kick: "x...x...x...x..x", snare: "....x.......x...", hat: "..x...x...x...x.",
      ohat: "..x...x...x...x.", clap: "....x.......x..x", tom: "................",
      perc: "..x.x...x.x...x.",
    },
  },
  {
    name: "PHILLY", family: "DISCO", bpm: 118, swing: 0,
    tracks: {
      kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "..x...x...x...x.", clap: "....x.......x...", tom: ".............x.x",
      perc: "x.x.x.x.x.x.x.x.",
    },
  },
  {
    name: "SMOOTH", family: "HOUSE", bpm: 122, swing: 0,
    tracks: {
      kick: "x...x...x...x...", snare: "....x.......x...", hat: "xxxxxxxxxxxxxxxx",
      ohat: "......x.......x.", clap: "....x.......x...", tom: "..............x.",
      perc: "................",
    },
  },
  {
    name: "DEEP", family: "HOUSE", bpm: 120, swing: 0,
    tracks: {
      kick: "x...x...x...x...", snare: "................", hat: "..x...x...x...x.",
      ohat: "..x...x...x...x.", clap: "....x.......x...", tom: "................",
      perc: "...x..x...x..x..",
    },
  },
  {
    name: "GARAGE", family: "HOUSE", bpm: 134, swing: 0.28,
    tracks: {
      kick: "x.....x.........", snare: "....x.......x...", hat: "x.xxx.x.xx.xx.x.",
      ohat: "......x.......x.", clap: "....x.......x...", tom: "................",
      perc: "..x......x......",
    },
  },
  {
    name: "ELECTRO", family: "HOUSE", bpm: 119, swing: 0,
    tracks: {
      kick: "x...x...x...x...", snare: "................", hat: "x.xxx.xxx.xxx.xx",
      ohat: "..x...x...x...x.", clap: "....x.......x...", tom: "..............x.",
      perc: "............x.x.",
    },
  },
  {
    name: "BILLIE", family: "HIPHOP", bpm: 117, swing: 0,
    tracks: {
      kick: "x.......x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "................", clap: "................", tom: "................",
      perc: "................",
    },
  },
  {
    name: "BOOMBAP", family: "HIPHOP", bpm: 92, swing: 0.24,
    tracks: {
      kick: "x..x..x....x....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "..............x.", clap: "................", tom: "................",
      perc: "................",
    },
  },
  {
    name: "TRAP", family: "HIPHOP", bpm: 140, swing: 0,
    tracks: {
      kick: "x.....x...x.....", snare: "........x.......", hat: "x.x.xxx.x.x.xxxx",
      ohat: "................", clap: "........x.......", tom: "..............xx",
      perc: "................",
    },
  },
  {
    name: "AFRO", family: "GLOBAL", bpm: 112, swing: 0,
    tracks: {
      kick: "x..x..x.x..x..x.", snare: "................", hat: "..x...x...x...x.",
      ohat: "................", clap: "....x.......x...", tom: "......x.......x.",
      perc: "x.xx.xx.x.xx.xx.",
    },
  },
  {
    name: "LATIN", family: "GLOBAL", bpm: 108, swing: 0,
    tracks: {
      kick: "x..x..x.x..x..x.", snare: "..x..x.x..x..x.x", hat: "x.x.x.x.x.x.x.x.",
      ohat: "................", clap: "................", tom: ".....x.......x..",
      perc: "x..x..x...x.x...",
    },
  },
  {
    name: "DNB", family: "GLOBAL", bpm: 174, swing: 0,
    tracks: {
      kick: "x......x..x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "..............x.", clap: "................", tom: "................",
      perc: "..x...x...x...x.",
    },
  },
] as const;

export const BASS_PATTERNS: readonly BassPattern[] = [
  { name: "FUNK77", mask: "x..xx..x..x.x.x.", notes: [0, 0, 0, 3, 4, 0, 0, 2, 0, 0, 4, 0, 1, 0, 2, 0] },
  { name: "SLAP16", mask: "x.xx..x.x.xx.x..", notes: [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 4, 2, 0, 0, 1, 0] },
  { name: "OCTAVE", mask: "x.x.x.x.x.x.x.x.", notes: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  { name: "PUMP", mask: "..x...x...x...x.", notes: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 0] },
  { name: "DEEPSUB", mask: "x.......x.......", notes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "WALK", mask: "x...x...x...x...", notes: [0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0] },
  { name: "BOOGIE", mask: "x..x.x..x..x.x..", notes: [0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0] },
  { name: "REESE", mask: "x.....x.x.......", notes: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "EIGHT08", mask: "x.....x.....x...", notes: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0, 0, 0] },
  { name: "TUMBAO", mask: "..x.x..x..x.x..x", notes: [0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 3] },
  { name: "ROLL", mask: "x.x.x.xxx.x.x.xx", notes: [0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 2, 0, 1, 0] },
  { name: "GHOST", mask: "xxx.x.xxx.x.xx.x", notes: [0, 3, 0, 0, 4, 0, 0, 2, 0, 0, 3, 0, 1, 2, 0, 0] },
  { name: "ACID", mask: "x.xxx.xxx.xxx.xx", notes: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 4, 0, 2, 0] },
  { name: "DUB", mask: "x.......x.x.....", notes: [0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0] },
  { name: "TWOSTEP", mask: "x..x....x.x.....", notes: [0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0] },
  { name: "POKER", mask: "x.x.x.x.x.x.xx.x", notes: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 3, 0, 2] },
] as const;

/** Root, octave, fifth and fourth stay consonant against every chord quality on the grid. */
export function bassTones(chordRoot: number): readonly number[] {
  return [chordRoot, chordRoot + 12, chordRoot + 7, chordRoot - 5, chordRoot + 10];
}

export function drumKitIndex(name: string): number {
  const index = DRUM_KITS.findIndex((kit) => kit.name === name);
  return index < 0 ? 0 : index;
}

export function bassPatternIndex(name: string): number {
  const index = BASS_PATTERNS.findIndex((pattern) => pattern.name === name);
  return index < 0 ? 0 : index;
}

/** Selecting a family enters it, then walks its variants on repeated presses. */
export function nextKitInFamily(current: number, family: DrumFamily): number {
  const members = DRUM_KITS.reduce<number[]>((indices, kit, index) => {
    if (kit.family === family) indices.push(index);
    return indices;
  }, []);
  const position = members.indexOf(current);
  return position < 0 ? members[0] : members[(position + 1) % members.length];
}

export function noteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

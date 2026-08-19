export const MIDI_STEPS = 16;

export const DRUM_TRACKS = ["kick", "snare", "hat", "ohat", "clap", "tom", "perc"] as const;
export type DrumTrack = typeof DRUM_TRACKS[number];

export interface MidiTemplate {
  bass: string;
  bpm: number;
  drums: Record<DrumTrack, string>;
  name: string;
  notes: readonly number[];
  rootMidi: number;
  swing: number;
}

export const MIDI_TEMPLATES: readonly MidiTemplate[] = [
  {
    name: "BAD", bpm: 115, rootMidi: 42, swing: 0.14,
    drums: {
      kick: "x..x..x...x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "..............x.", clap: "....x.......x...", tom: "................",
      perc: "..x...x...x...x.",
    },
    bass: "x.xx..x.x.xx.x..",
    notes: [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 3, 5, 0, 0, 0, 0],
  },
  {
    name: "BILLIE", bpm: 117, rootMidi: 36, swing: 0,
    drums: {
      kick: "x.......x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
      ohat: "................", clap: "................", tom: "................",
      perc: "................",
    },
    bass: "x..x.x..x..x.x..",
    notes: [0, 0, 0, 7, 0, 5, 0, 0, 0, 0, 0, 7, 0, 3, 0, 0],
  },
  {
    name: "SMOOTH", bpm: 118, rootMidi: 45, swing: 0,
    drums: {
      kick: "x...x...x...x...", snare: "....x.......x...", hat: "xxxxxxxxxxxxxxxx",
      ohat: "......x.......x.", clap: "....x.......x...", tom: "..............x.",
      perc: "................",
    },
    bass: "x.x.x.x.x.x.x.x.",
    notes: [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 10, 0, 0, 0, 7, 0],
  },
  {
    name: "FUNK77", bpm: 104, rootMidi: 40, swing: 0.22,
    drums: {
      kick: "x..x..x..x.x..x.", snare: "....x..x....x...", hat: "x.xxx.x.x.xxx.x.",
      ohat: "..........x.....", clap: "................", tom: ".............x.x",
      perc: "x...x...x...x..x",
    },
    bass: "x..xx..x..x.x.x.",
    notes: [0, 0, 0, 3, 5, 0, 0, 7, 0, 0, 10, 0, 12, 0, 7, 0],
  },
] as const;

export function noteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

import type { PhraseSource } from "./harmony";

export type BassVoiceId = "moog" | "octave" | "reese" | "slap" | "sub";
export type ChordVoiceId = "brass" | "clav" | "epiano" | "pluck" | "poly";
export type LeadVoiceId = "clavLead" | "fm" | "saw" | "square" | "talk";

export interface MidiRig extends PhraseSource {
  bassVoice: BassVoiceId;
  chordVoice: ChordVoiceId;
  /** Default bass pattern adopted when the rig is selected. */
  defaultBass: string;
  /** Default drum kit adopted when the rig is selected. */
  defaultDrum: string;
  delayMix: number;
  leadVoice: LeadVoiceId;
  name: string;
  rootMidi: number;
  tagline: string;
}

/**
 * A rig is the whole instrument combo: timbres, comping rhythm, chord decomposition,
 * riff contour and key. Switching rigs rewrites the melody without touching the loop.
 */
export const MIDI_RIGS: readonly MidiRig[] = [
  {
    name: "CLAV77", tagline: "CLAVINET · SLAP",
    chordVoice: "clav", leadVoice: "clavLead", bassVoice: "slap",
    defaultDrum: "FUNK77", defaultBass: "FUNK77",
    rootMidi: 45, chordOctave: 24, leadOctave: 36, delayMix: 0.16,
    comp: "x.oxx.o.x.oxx.o.",
    arp: [0, -1, 2, 1, -1, 4, 2, -1, 5, -1, 2, 3, -1, 1, 6, -1],
    riff: [0, -1, 2, 3, -1, 2, -1, 4, 3, -1, 2, -1, 1, 0, -1, 2],
  },
  {
    name: "HORNS", tagline: "BRASS · OCTAVE BASS",
    chordVoice: "brass", leadVoice: "saw", bassVoice: "octave",
    defaultDrum: "BAD", defaultBass: "OCTAVE",
    rootMidi: 43, chordOctave: 24, leadOctave: 36, delayMix: 0.22,
    comp: "..x..x..x...x.x.",
    arp: [0, 2, 4, 6, 7, 5, 3, 1, 0, 2, 4, 6, 7, 5, 3, 1],
    riff: [4, -1, -1, 3, 2, -1, 3, -1, 4, -1, 5, -1, 4, 3, 2, -1],
  },
  {
    name: "RHODES", tagline: "RHODES · SUB",
    chordVoice: "epiano", leadVoice: "square", bassVoice: "sub",
    defaultDrum: "SMOOTH", defaultBass: "PUMP",
    rootMidi: 41, chordOctave: 24, leadOctave: 36, delayMix: 0.3,
    comp: "..x...x...x...x.",
    arp: [0, -1, 1, -1, 2, -1, 3, -1, 4, -1, 3, -1, 2, -1, 1, -1],
    riff: [-1, -1, 2, -1, -1, 3, -1, -1, 4, -1, -1, 3, -1, 2, -1, -1],
  },
  {
    name: "MOOG", tagline: "POLY SYNTH · MOOG",
    chordVoice: "poly", leadVoice: "talk", bassVoice: "moog",
    defaultDrum: "BILLIE", defaultBass: "BOOGIE",
    rootMidi: 40, chordOctave: 24, leadOctave: 36, delayMix: 0.24,
    comp: "x..x..x.x..x..x.",
    arp: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, 1],
    riff: [0, -1, 3, -1, 2, -1, -1, 4, -1, 3, -1, 2, 1, -1, 0, -1],
  },
  {
    name: "NEON", tagline: "FM PLUCK · REESE",
    chordVoice: "pluck", leadVoice: "fm", bassVoice: "reese",
    defaultDrum: "STRUT", defaultBass: "REESE",
    rootMidi: 42, chordOctave: 24, leadOctave: 36, delayMix: 0.34,
    comp: "x..x.x..x..x.x..",
    arp: [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 2, 0],
    riff: [7, -1, 6, -1, 5, -1, 4, 5, -1, 6, -1, 7, -1, 5, 4, -1],
  },
] as const;

import type { PerformanceFx } from "./controls";
import type { ChordSlot } from "./harmony";
import { BASS_PATTERNS, DRUM_KITS, noteName } from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

export type MidiLayer = "BASS" | "DRUM" | "RIG" | "TEMPO";

export interface MidiEngineSnapshot {
  activeFx: readonly PerformanceFx[];
  activeLayer: MidiLayer;
  bassTemplate: string;
  bpm: number;
  drumTemplate: string;
  playing: boolean;
  progression: readonly ChordSlot[];
  rig: string;
  rigTagline: string;
  root: string;
  step: number;
  swing: number;
}

export function createEngineSnapshot(state: {
  activeFx: readonly PerformanceFx[];
  activeLayer: MidiLayer;
  bassIndex: number;
  drumIndex: number;
  pendingProgression?: readonly ChordSlot[];
  playing: boolean;
  progression: readonly ChordSlot[];
  rigIndex: number;
  step: number;
  tempo: number;
}): MidiEngineSnapshot {
  const drum = DRUM_KITS[state.drumIndex];
  const rig = MIDI_RIGS[state.rigIndex];
  return {
    activeFx: state.activeFx,
    activeLayer: state.activeLayer,
    bassTemplate: BASS_PATTERNS[state.bassIndex].name,
    bpm: state.tempo,
    drumTemplate: drum.name,
    playing: state.playing,
    progression: state.pendingProgression ?? state.progression,
    rig: rig.name,
    rigTagline: rig.tagline,
    root: noteName(rig.rootMidi),
    step: state.step,
    swing: drum.swing,
  };
}

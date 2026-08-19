import { AudioVoicePrimitives } from "./audio-primitives";
import { DrumVoices } from "./drum-voices";
import { MelodicVoices } from "./melodic-voices";
import type { BassVoiceId, ChordVoiceId, LeadVoiceId } from "./rigs";

export { midiToFrequency } from "./audio-primitives";

export interface MidiBuses {
  bass: AudioNode;
  drum: AudioNode;
  music: AudioNode;
}

/** Stable facade used by the scheduler; synthesis details live in focused voice modules. */
export class MidiVoices {
  private readonly drums: DrumVoices;
  private readonly melodic: MelodicVoices;

  constructor(context: AudioContext, buses: MidiBuses) {
    const primitives = new AudioVoicePrimitives(context);
    this.drums = new DrumVoices(context, buses.drum, primitives);
    this.melodic = new MelodicVoices(
      context,
      buses.bass,
      buses.music,
      primitives,
    );
  }

  playDrum(id: string, time: number): void {
    this.drums.play(id, time);
  }

  chord(
    time: number,
    midis: readonly number[],
    voice: ChordVoiceId,
    velocity: number,
  ): void {
    this.melodic.chord(time, midis, voice, velocity);
  }

  lead(time: number, midi: number, voice: LeadVoiceId, velocity: number): void {
    this.melodic.lead(time, midi, voice, velocity);
  }

  bass(time: number, midi: number, voice: BassVoiceId, velocity: number): void {
    this.melodic.bass(time, midi, voice, velocity);
  }

  crash(time: number): void {
    this.drums.crash(time);
  }

  riser(time: number, duration: number): void {
    this.drums.riser(time, duration);
  }
}

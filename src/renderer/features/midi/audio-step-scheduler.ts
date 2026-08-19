import type { MidiVoices } from "./audio-voices";
import { chordVoicing, phraseAt, type ChordSlot } from "./harmony";
import {
  BASS_PATTERNS,
  bassTones,
  DRUM_KITS,
  DRUM_TRACKS,
  MIDI_STEPS,
} from "./midi-templates";
import type { PerformanceEffects } from "./performance-effects";
import { MIDI_RIGS } from "./rigs";
import { slotAtStep } from "./sequencer";

export function scheduleStep({
  bassIndex,
  drumIndex,
  effects,
  progression,
  rigIndex,
  step,
  stepDuration,
  time,
  voices,
}: {
  bassIndex: number;
  drumIndex: number;
  effects: PerformanceEffects;
  progression: readonly ChordSlot[];
  rigIndex: number;
  step: number;
  stepDuration: number;
  time: number;
  voices: MidiVoices;
}): string[] {
  const stepInBar = step % MIDI_STEPS;
  const drum = DRUM_KITS[drumIndex];
  const bass = BASS_PATTERNS[bassIndex];
  const rig = MIDI_RIGS[rigIndex];
  const hits = effects.scheduleTransitions(stepInBar, time, stepDuration, voices);

  if (!effects.dropActive && (!effects.halfTime || step % 2 === 0)) {
    const drumStep = effects.halfTime
      ? Math.floor(step / 2) % MIDI_STEPS
      : stepInBar;
    for (const track of DRUM_TRACKS) {
      if (drum.tracks[track][drumStep] === "x") {
        voices.playDrum(track, time);
        hits.push(track);
      }
    }
  }

  const slot = slotAtStep(progression, step);
  const chordRoot = slot ? chordVoicing(slot.degree)[0] : 0;
  if (!effects.dropActive && bass.mask[stepInBar] === "x") {
    const tones = bassTones(rig.rootMidi + chordRoot);
    voices.bass(time, tones[bass.notes[stepInBar]], rig.bassVoice, 1);
    hits.push("bass");
  }
  if (!slot) return hits;

  const phrase = phraseAt(slot, rig, effects.doubleTime ? step * 2 : step);
  if (!phrase) return hits;
  const midis = phrase.notes.map((semitone) => rig.rootMidi + semitone);
  if (phrase.role === "chord") {
    voices.chord(time, midis, rig.chordVoice, phrase.velocity);
    hits.push("chord");
  } else {
    voices.lead(time, midis[0], rig.leadVoice, phrase.velocity);
    hits.push("lead");
  }
  return hits;
}

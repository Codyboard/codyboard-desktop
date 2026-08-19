import { MidiVoices } from "./audio-voices";
import { arpeggioNote, type ChordChoice } from "./harmony";
import { DRUM_TRACKS, MIDI_STEPS, MIDI_TEMPLATES, noteName } from "./midi-templates";
import { adjustedTempo, appendChord, chordAtStep, wrappedIndex } from "./sequencer";

export type MidiLayer = "BASS" | "DRUM" | "TEMPO";

export interface MidiEngineSnapshot {
  activeLayer: MidiLayer;
  bassTemplate: string;
  bpm: number;
  drumTemplate: string;
  playing: boolean;
  progression: readonly ChordChoice[];
  root: string;
  step: number;
  swing: number;
}

export interface MidiPulse {
  hits: readonly string[];
  step: number;
}

type Listener<T> = (value: T) => void;

export class MidiAudioEngine {
  private readonly analyser: AnalyserNode;
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly pulses = new Set<Listener<MidiPulse>>();
  private readonly stateListeners = new Set<Listener<MidiEngineSnapshot>>();
  private readonly timeouts = new Set<number>();
  private readonly voices: MidiVoices;
  private activeLayer: MidiLayer = "DRUM";
  private bassIndex = 0;
  private drumIndex = 0;
  private nextTime = 0;
  private pendingBassIndex?: number;
  private pendingDrumIndex?: number;
  private pendingProgression?: readonly ChordChoice[];
  private playing = false;
  private progression: readonly ChordChoice[] = [];
  private sequenceStep = 0;
  private step = 0;
  private tempo = MIDI_TEMPLATES[0].bpm;
  private timer?: number;
  private resumeWhenVisible = false;

  constructor() {
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 22;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    this.master.gain.value = 0.82;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.72;
    this.master.connect(compressor).connect(this.analyser);
    compressor.connect(this.context.destination);
    this.voices = new MidiVoices(this.context, this.master);
    this.play();
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getSnapshot(): MidiEngineSnapshot {
    const drum = MIDI_TEMPLATES[this.drumIndex];
    const bass = MIDI_TEMPLATES[this.bassIndex];
    return {
      activeLayer: this.activeLayer,
      bassTemplate: bass.name,
      bpm: this.tempo,
      drumTemplate: drum.name,
      playing: this.playing,
      progression: this.pendingProgression ?? this.progression,
      root: noteName(bass.rootMidi),
      step: this.step,
      swing: drum.swing,
    };
  }

  onPulse(listener: Listener<MidiPulse>): () => void {
    this.pulses.add(listener);
    return () => this.pulses.delete(listener);
  }

  onState(listener: Listener<MidiEngineSnapshot>): () => void {
    this.stateListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.stateListeners.delete(listener);
  }

  addChord(choice: ChordChoice): void {
    this.pendingProgression = appendChord(this.pendingProgression ?? this.progression, choice);
    this.emitState();
  }

  clearHarmony(): void {
    this.pendingProgression = [];
    this.emitState();
  }

  toggleLayer(): void {
    this.activeLayer = this.activeLayer === "DRUM"
      ? "BASS"
      : this.activeLayer === "BASS" ? "TEMPO" : "DRUM";
    this.emitState();
  }

  turnKnob(delta: -1 | 1): void {
    if (this.activeLayer === "DRUM")
      this.pendingDrumIndex = wrappedIndex(this.pendingDrumIndex ?? this.drumIndex, delta, MIDI_TEMPLATES.length);
    else if (this.activeLayer === "BASS")
      this.pendingBassIndex = wrappedIndex(this.pendingBassIndex ?? this.bassIndex, delta, MIDI_TEMPLATES.length);
    else
      this.tempo = adjustedTempo(this.tempo, delta);
    this.emitState();
  }

  togglePlayback(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setPageVisible(visible: boolean): void {
    if (!visible) {
      this.resumeWhenVisible = this.playing;
      this.pause();
    } else if (this.resumeWhenVisible) {
      this.resumeWhenVisible = false;
      this.play();
    }
  }

  dispose(): void {
    this.pause();
    for (const timeout of this.timeouts) window.clearTimeout(timeout);
    this.timeouts.clear();
    this.stateListeners.clear();
    this.pulses.clear();
    void this.context.close();
  }

  private play(): void {
    if (this.playing) return;
    this.playing = true;
    this.sequenceStep = 0;
    this.step = 0;
    this.nextTime = this.context.currentTime + 0.06;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.82, this.context.currentTime, 0.012);
    void this.context.resume();
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
    this.emitState();
  }

  private pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.012);
    this.emitState();
  }

  private tick(): void {
    while (this.playing && this.nextTime < this.context.currentTime + 0.12) {
      this.applyQueuedChanges();
      const drum = MIDI_TEMPLATES[this.drumIndex];
      const swingDelay = this.sequenceStep % 2 === 1 ? drum.swing * this.stepDuration() * 0.6 : 0;
      this.schedule(this.sequenceStep, this.nextTime + swingDelay);
      this.nextTime += this.stepDuration();
      this.sequenceStep = (this.sequenceStep + 1) % MIDI_STEPS;
    }
  }

  private applyQueuedChanges(): void {
    if (this.sequenceStep % 4 === 0 && this.pendingProgression !== undefined) {
      this.progression = this.pendingProgression;
      this.pendingProgression = undefined;
    }
    if (this.sequenceStep === 0) {
      if (this.pendingDrumIndex !== undefined) {
        this.drumIndex = this.pendingDrumIndex;
        this.tempo = MIDI_TEMPLATES[this.drumIndex].bpm;
      }
      if (this.pendingBassIndex !== undefined) this.bassIndex = this.pendingBassIndex;
      this.pendingDrumIndex = undefined;
      this.pendingBassIndex = undefined;
    }
  }

  private schedule(step: number, time: number): void {
    const drum = MIDI_TEMPLATES[this.drumIndex];
    const bass = MIDI_TEMPLATES[this.bassIndex];
    const hits: string[] = [];
    for (const track of DRUM_TRACKS) {
      if (drum.drums[track][step] === "x") {
        this.voices.playDrum(track, time);
        hits.push(track);
      }
    }
    if (bass.bass[step] === "x") {
      this.voices.bass(time, bass.rootMidi + bass.notes[step]);
      hits.push("bass");
    }
    const chord = chordAtStep(this.progression, step);
    if (chord) {
      this.voices.arpeggio(time, arpeggioNote(chord, bass.rootMidi, step % 4));
      hits.push("arp");
    }
    if (step % 4 === 0) {
      this.voices.metronome(time, step === 0);
      hits.push("click");
    }
    const delay = Math.max(0, (time - this.context.currentTime) * 1_000);
    const timeout = window.setTimeout(() => {
      this.timeouts.delete(timeout);
      this.step = step;
      const pulse = { hits, step };
      for (const listener of this.pulses) listener(pulse);
      this.emitState();
    }, delay);
    this.timeouts.add(timeout);
  }

  private stepDuration(): number {
    return 60 / this.tempo / 4;
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) listener(snapshot);
  }
}

import { MidiVoices } from "./audio-voices";
import type { PerformanceFx } from "./controls";
import { chordVoicing, phraseAt, type ChordSlot } from "./harmony";
import {
  BASS_PATTERNS, bassPatternIndex, bassTones, DRUM_KITS, DRUM_TRACKS, drumKitIndex, LOOP_STEPS,
  MIDI_STEPS, nextKitInFamily, noteName, type DrumFamily,
} from "./midi-templates";
import { MIDI_RIGS } from "./rigs";
import {
  adjustedTempo, appendSlot, removeSlot, slotAtStep, SLOT_STEPS, wrappedIndex,
} from "./sequencer";

export type MidiLayer = "BASS" | "DRUM" | "RIG" | "TEMPO";

const LAYER_ORDER: readonly MidiLayer[] = ["RIG", "DRUM", "BASS", "TEMPO"];

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

export interface MidiPulse {
  hits: readonly string[];
  step: number;
}

type Listener<T> = (value: T) => void;

export class MidiAudioEngine {
  private readonly analyser: AnalyserNode;
  private readonly bassBus: GainNode;
  private readonly context = new AudioContext();
  private readonly delay: DelayNode;
  private readonly delaySend: GainNode;
  private readonly djFilter: BiquadFilterNode;
  private readonly drumBus: GainNode;
  private readonly master = this.context.createGain();
  private readonly musicBus: GainNode;
  private readonly pulses = new Set<Listener<MidiPulse>>();
  private readonly stateListeners = new Set<Listener<MidiEngineSnapshot>>();
  private readonly timeouts = new Set<number>();
  private readonly voices: MidiVoices;
  private activeLayer: MidiLayer = "RIG";
  private bassIndex = bassPatternIndex(MIDI_RIGS[0].defaultBass);
  private crashPending = false;
  private doubleTime = false;
  private dropActive = false;
  private dropRequested = false;
  private drumIndex = drumKitIndex(MIDI_RIGS[0].defaultDrum);
  private filterActive = false;
  private halfTime = false;
  private nextTime = 0;
  private pendingProgression?: readonly ChordSlot[];
  private playing = false;
  private progression: readonly ChordSlot[] = [];
  private rigIndex = 0;
  private riserRequested = false;
  private sequenceStep = 0;
  private step = 0;
  private tempo = DRUM_KITS[drumKitIndex(MIDI_RIGS[0].defaultDrum)].bpm;
  private timer?: number;

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

    this.djFilter = this.context.createBiquadFilter();
    this.djFilter.type = "lowpass";
    this.djFilter.frequency.value = 18_000;
    this.djFilter.Q.value = 1.4;
    this.djFilter.connect(this.master);

    const mix = this.context.createGain();
    mix.connect(this.djFilter);
    this.drumBus = this.context.createGain();
    this.bassBus = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.drumBus.connect(mix);
    this.bassBus.connect(mix);
    this.musicBus.connect(mix);

    this.delay = this.context.createDelay(1.5);
    this.delaySend = this.context.createGain();
    this.delaySend.gain.value = MIDI_RIGS[0].delayMix;
    const feedback = this.context.createGain();
    feedback.gain.value = 0.32;
    const delayTone = this.context.createBiquadFilter();
    delayTone.type = "lowpass";
    delayTone.frequency.value = 2_800;
    this.musicBus.connect(this.delaySend).connect(this.delay);
    this.delay.connect(delayTone).connect(feedback).connect(this.delay);
    this.delay.connect(mix);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0.16;
    const reverb = this.context.createConvolver();
    reverb.buffer = this.impulseResponse(1.7);
    this.musicBus.connect(reverbSend).connect(reverb).connect(mix);

    this.voices = new MidiVoices(this.context, {
      bass: this.bassBus, drum: this.drumBus, music: this.musicBus,
    });
    this.syncDelayTime();
    this.play();
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getSnapshot(): MidiEngineSnapshot {
    const drum = DRUM_KITS[this.drumIndex];
    const bass = BASS_PATTERNS[this.bassIndex];
    const rig = MIDI_RIGS[this.rigIndex];
    const activeFx: PerformanceFx[] = [];
    if (this.filterActive) activeFx.push("filter");
    if (this.halfTime) activeFx.push("half");
    if (this.doubleTime) activeFx.push("double");
    if (this.dropActive || this.dropRequested) activeFx.push("drop");
    if (this.riserRequested || this.crashPending) activeFx.push("riser");
    return {
      activeFx,
      activeLayer: this.activeLayer,
      bassTemplate: bass.name,
      bpm: this.tempo,
      drumTemplate: drum.name,
      playing: this.playing,
      progression: this.pendingProgression ?? this.progression,
      rig: rig.name,
      rigTagline: rig.tagline,
      root: noteName(rig.rootMidi),
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

  addChord(slot: ChordSlot): void {
    this.pendingProgression = appendSlot(this.pendingProgression ?? this.progression, slot);
    this.emitState();
  }

  /** Drops one slot from the loop; like addChord it lands on the next half bar. */
  removeChord(index: number): void {
    const current = this.pendingProgression ?? this.progression;
    const next = removeSlot(current, index);
    if (next === current) return;
    this.pendingProgression = next;
    this.emitState();
  }

  clearHarmony(): void {
    this.pendingProgression = [];
    this.emitState();
  }

  selectRig(index: number): void {
    this.rigIndex = wrappedIndex(0, index, MIDI_RIGS.length);
    this.adoptRigDefaults();
    this.restartLoop();
  }

  selectDrumFamily(family: DrumFamily): void {
    this.adoptDrumKit(nextKitInFamily(this.drumIndex, family));
    this.restartLoop();
  }

  triggerFx(fx: PerformanceFx): void {
    if (fx === "filter") {
      this.filterActive = !this.filterActive;
      const target = this.filterActive ? 380 : 18_000;
      this.djFilter.frequency.cancelScheduledValues(this.context.currentTime);
      this.djFilter.frequency.exponentialRampToValueAtTime(target, this.context.currentTime + 0.3);
    } else if (fx === "half") {
      this.halfTime = !this.halfTime;
      if (this.halfTime) this.doubleTime = false;
    } else if (fx === "double") {
      this.doubleTime = !this.doubleTime;
      if (this.doubleTime) this.halfTime = false;
    } else if (fx === "drop") {
      this.dropRequested = true;
    } else {
      this.riserRequested = true;
    }
    this.emitState();
  }

  /** Returns the instrument to its opening state: first rig, empty loop, no effects, playing. */
  reset(): void {
    this.progression = [];
    this.pendingProgression = undefined;
    this.rigIndex = 0;
    this.adoptRigDefaults();
    this.activeLayer = "RIG";
    this.doubleTime = false;
    this.halfTime = false;
    this.dropActive = false;
    this.dropRequested = false;
    this.riserRequested = false;
    this.crashPending = false;
    if (this.filterActive) {
      this.filterActive = false;
      this.djFilter.frequency.cancelScheduledValues(this.context.currentTime);
      this.djFilter.frequency.exponentialRampToValueAtTime(18_000, this.context.currentTime + 0.3);
    }
    if (this.playing) this.restartLoop();
    else this.play();
  }

  toggleLayer(): void {
    const index = LAYER_ORDER.indexOf(this.activeLayer);
    this.activeLayer = LAYER_ORDER[(index + 1) % LAYER_ORDER.length];
    this.emitState();
  }

  turnKnob(delta: -1 | 1): void {
    if (this.activeLayer === "RIG") {
      this.rigIndex = wrappedIndex(this.rigIndex, delta, MIDI_RIGS.length);
      this.adoptRigDefaults();
      this.restartLoop();
    } else if (this.activeLayer === "DRUM") {
      this.adoptDrumKit(wrappedIndex(this.drumIndex, delta, DRUM_KITS.length));
      this.restartLoop();
    } else if (this.activeLayer === "BASS") {
      this.bassIndex = wrappedIndex(this.bassIndex, delta, BASS_PATTERNS.length);
      this.restartLoop();
    } else {
      // Tempo is continuous: it takes effect at once but must not stutter the groove back to step one.
      this.tempo = adjustedTempo(this.tempo, delta);
      this.syncDelayTime();
      this.emitState();
    }
  }

  togglePlayback(): void {
    if (this.playing) this.pause();
    else this.play();
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
      const drum = DRUM_KITS[this.drumIndex];
      const swingDelay = this.sequenceStep % 2 === 1 ? drum.swing * this.stepDuration() * 0.6 : 0;
      this.schedule(this.sequenceStep, this.nextTime + swingDelay);
      this.nextTime += this.stepDuration();
      this.sequenceStep = (this.sequenceStep + 1) % LOOP_STEPS;
    }
  }

  private applyQueuedChanges(): void {
    if (this.sequenceStep % SLOT_STEPS !== 0 || this.pendingProgression === undefined) return;
    this.progression = this.pendingProgression;
    this.pendingProgression = undefined;
  }

  private schedule(step: number, time: number): void {
    const stepInBar = step % MIDI_STEPS;
    const drum = DRUM_KITS[this.drumIndex];
    const bass = BASS_PATTERNS[this.bassIndex];
    const rig = MIDI_RIGS[this.rigIndex];
    const hits: string[] = [];

    if (this.riserRequested) {
      this.riserRequested = false;
      this.voices.riser(time, (MIDI_STEPS - stepInBar) * this.stepDuration());
      this.crashPending = true;
      hits.push("perc");
    }
    if (stepInBar === 0) {
      if (this.dropActive) {
        this.dropActive = false;
        this.crashPending = true;
      }
      if (this.crashPending) {
        this.crashPending = false;
        this.voices.crash(time);
        hits.push("ohat");
      }
    }
    if (this.dropRequested) {
      this.dropRequested = false;
      this.dropActive = true;
    }

    if (!this.dropActive && (!this.halfTime || step % 2 === 0)) {
      const drumStep = this.halfTime ? Math.floor(step / 2) % MIDI_STEPS : stepInBar;
      for (const track of DRUM_TRACKS) {
        if (drum.tracks[track][drumStep] === "x") {
          this.voices.playDrum(track, time);
          hits.push(track);
        }
      }
    }

    const slot = slotAtStep(this.progression, step);
    const chordRoot = slot ? chordVoicing(slot.degree)[0] : 0;
    if (!this.dropActive && bass.mask[stepInBar] === "x") {
      const tones = bassTones(rig.rootMidi + chordRoot);
      this.voices.bass(time, tones[bass.notes[stepInBar]], rig.bassVoice, 1);
      hits.push("bass");
    }

    if (slot) {
      const event = phraseAt(slot, rig, this.doubleTime ? step * 2 : step);
      if (event) {
        const midis = event.notes.map((semitone) => rig.rootMidi + semitone);
        if (event.role === "chord") {
          this.voices.chord(time, midis, rig.chordVoice, event.velocity);
          hits.push("chord");
        } else {
          this.voices.lead(time, midis[0], rig.leadVoice, event.velocity);
          hits.push("lead");
        }
      }
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

  private adoptRigDefaults(): void {
    const rig = MIDI_RIGS[this.rigIndex];
    this.bassIndex = bassPatternIndex(rig.defaultBass);
    this.adoptDrumKit(drumKitIndex(rig.defaultDrum));
    this.delaySend.gain.setTargetAtTime(rig.delayMix, this.context.currentTime, 0.05);
  }

  private adoptDrumKit(index: number): void {
    this.drumIndex = index;
    this.tempo = DRUM_KITS[this.drumIndex].bpm;
    this.syncDelayTime();
  }

  /** Instrument changes are live: the loop jumps straight back to step one instead of finishing the bar. */
  private restartLoop(): void {
    this.sequenceStep = 0;
    this.step = 0;
    if (this.playing) this.nextTime = this.context.currentTime + 0.03;
    this.emitState();
  }

  private syncDelayTime(): void {
    this.delay.delayTime.setTargetAtTime(
      (60 / this.tempo) * 0.75, this.context.currentTime, 0.05,
    );
  }

  private impulseResponse(seconds: number): AudioBuffer {
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1)
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3.2;
    }
    return buffer;
  }

  private stepDuration(): number {
    return 60 / this.tempo / 4;
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) listener(snapshot);
  }
}

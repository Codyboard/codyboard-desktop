import {
  createEngineSnapshot,
  type MidiEngineSnapshot,
  type MidiLayer,
} from "./audio-engine-snapshot";
import { createMidiAudioGraph } from "./audio-graph";
import { scheduleStep } from "./audio-step-scheduler";
import type { MidiVoices } from "./audio-voices";
import type { PerformanceFx } from "./controls";
import type { ChordSlot } from "./harmony";
import {
  BASS_PATTERNS, bassPatternIndex, DRUM_KITS, drumKitIndex, LOOP_STEPS,
  nextKitInFamily, type DrumFamily,
} from "./midi-templates";
import { PerformanceEffects } from "./performance-effects";
import { MIDI_RIGS } from "./rigs";
import { adjustedTempo, appendSlot, removeSlot, SLOT_STEPS, wrappedIndex } from "./sequencer";

export type { MidiEngineSnapshot, MidiLayer } from "./audio-engine-snapshot";

const LAYER_ORDER: readonly MidiLayer[] = ["RIG", "DRUM", "BASS", "TEMPO"];

export interface MidiPulse {
  hits: readonly string[];
  step: number;
}

type Listener<T> = (value: T) => void;

export class MidiAudioEngine {
  private readonly analyser: AnalyserNode;
  private readonly context: AudioContext;
  private readonly delay: DelayNode;
  private readonly delaySend: GainNode;
  private readonly djFilter: BiquadFilterNode;
  private readonly master: GainNode;
  private readonly pulses = new Set<Listener<MidiPulse>>();
  private readonly stateListeners = new Set<Listener<MidiEngineSnapshot>>();
  private readonly timeouts = new Set<number>();
  private readonly voices: MidiVoices;
  private activeLayer: MidiLayer = "RIG";
  private bassIndex = bassPatternIndex(MIDI_RIGS[0].defaultBass);
  private drumIndex = drumKitIndex(MIDI_RIGS[0].defaultDrum);
  private readonly effects: PerformanceEffects;
  private nextTime = 0;
  private pendingProgression?: readonly ChordSlot[];
  private playing = false;
  private progression: readonly ChordSlot[] = [];
  private rigIndex = 0;
  private sequenceStep = 0;
  private step = 0;
  private tempo = DRUM_KITS[drumKitIndex(MIDI_RIGS[0].defaultDrum)].bpm;
  private timer?: number;

  constructor() {
    const graph = createMidiAudioGraph(MIDI_RIGS[0].delayMix);
    this.analyser = graph.analyser;
    this.context = graph.context;
    this.delay = graph.delay;
    this.delaySend = graph.delaySend;
    this.djFilter = graph.djFilter;
    this.master = graph.master;
    this.voices = graph.voices;
    this.effects = new PerformanceEffects(this.context, this.djFilter);
    this.syncDelayTime();
    this.play();
  }

  getAnalyser(): AnalyserNode {
    return this.analyser;
  }

  getSnapshot(): MidiEngineSnapshot {
    return createEngineSnapshot({
      activeFx: this.effects.active(),
      activeLayer: this.activeLayer,
      bassIndex: this.bassIndex,
      drumIndex: this.drumIndex,
      pendingProgression: this.pendingProgression,
      playing: this.playing,
      progression: this.progression,
      rigIndex: this.rigIndex,
      step: this.step,
      tempo: this.tempo,
    });
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
    this.effects.trigger(fx);
    this.emitState();
  }

  /** Returns the instrument to its opening state: first rig, empty loop, no effects, playing. */
  reset(): void {
    this.progression = [];
    this.pendingProgression = undefined;
    this.rigIndex = 0;
    this.adoptRigDefaults();
    this.activeLayer = "RIG";
    this.effects.reset();
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
    const hits = scheduleStep({
      bassIndex: this.bassIndex,
      drumIndex: this.drumIndex,
      effects: this.effects,
      progression: this.progression,
      rigIndex: this.rigIndex,
      step,
      stepDuration: this.stepDuration(),
      time,
      voices: this.voices,
    });

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

  private stepDuration(): number {
    return 60 / this.tempo / 4;
  }

  private emitState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) listener(snapshot);
  }
}

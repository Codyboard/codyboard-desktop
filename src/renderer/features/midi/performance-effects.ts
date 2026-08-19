import type { MidiVoices } from "./audio-voices";
import type { PerformanceFx } from "./controls";
import { MIDI_STEPS } from "./midi-templates";

export class PerformanceEffects {
  private crashPending = false;
  private doubleTimeActive = false;
  private dropIsActive = false;
  private dropRequested = false;
  private filterActive = false;
  private halfTimeActive = false;
  private riserRequested = false;

  constructor(
    private readonly context: AudioContext,
    private readonly filter: BiquadFilterNode,
  ) {}

  get doubleTime(): boolean { return this.doubleTimeActive; }
  get dropActive(): boolean { return this.dropIsActive; }
  get halfTime(): boolean { return this.halfTimeActive; }

  active(): PerformanceFx[] {
    const active: PerformanceFx[] = [];
    if (this.filterActive) active.push("filter");
    if (this.halfTimeActive) active.push("half");
    if (this.doubleTimeActive) active.push("double");
    if (this.dropIsActive || this.dropRequested) active.push("drop");
    if (this.riserRequested || this.crashPending) active.push("riser");
    return active;
  }

  trigger(effect: PerformanceFx): void {
    if (effect === "filter") {
      this.filterActive = !this.filterActive;
      this.rampFilter(this.filterActive ? 380 : 18_000);
    } else if (effect === "half") {
      this.halfTimeActive = !this.halfTimeActive;
      if (this.halfTimeActive) this.doubleTimeActive = false;
    } else if (effect === "double") {
      this.doubleTimeActive = !this.doubleTimeActive;
      if (this.doubleTimeActive) this.halfTimeActive = false;
    } else if (effect === "drop") this.dropRequested = true;
    else this.riserRequested = true;
  }

  reset(): void {
    this.doubleTimeActive = false;
    this.halfTimeActive = false;
    this.dropIsActive = false;
    this.dropRequested = false;
    this.riserRequested = false;
    this.crashPending = false;
    if (this.filterActive) {
      this.filterActive = false;
      this.rampFilter(18_000);
    }
  }

  scheduleTransitions(
    stepInBar: number,
    time: number,
    stepDuration: number,
    voices: MidiVoices,
  ): string[] {
    const hits: string[] = [];
    if (this.riserRequested) {
      this.riserRequested = false;
      voices.riser(time, (MIDI_STEPS - stepInBar) * stepDuration);
      this.crashPending = true;
      hits.push("perc");
    }
    if (stepInBar === 0) {
      if (this.dropIsActive) {
        this.dropIsActive = false;
        this.crashPending = true;
      }
      if (this.crashPending) {
        this.crashPending = false;
        voices.crash(time);
        hits.push("ohat");
      }
    }
    if (this.dropRequested) {
      this.dropRequested = false;
      this.dropIsActive = true;
    }
    return hits;
  }

  private rampFilter(frequency: number): void {
    this.filter.frequency.cancelScheduledValues(this.context.currentTime);
    this.filter.frequency.exponentialRampToValueAtTime(
      frequency,
      this.context.currentTime + 0.3,
    );
  }
}

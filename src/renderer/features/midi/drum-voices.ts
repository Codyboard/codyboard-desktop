import { AudioVoicePrimitives, envelope } from "./audio-primitives";

export class DrumVoices {
  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
    private readonly primitives: AudioVoicePrimitives,
  ) {}

  play(id: string, time: number): void {
    if (id === "kick") this.kick(time);
    else if (id === "snare") this.snare(time);
    else if (id === "hat") this.primitives.noise(time, 0.045, 7_500, 16_000, 0.3, this.output);
    else if (id === "ohat") this.primitives.noise(time, 0.34, 6_800, 16_000, 0.26, this.output);
    else if (id === "clap") [0, 0.011, 0.023, 0.038].forEach((offset, index) =>
      this.primitives.noise(time + offset, index === 3 ? 0.16 : 0.028, 1_100, 6_500, index === 3 ? 0.42 : 0.34, this.output));
    else if (id === "tom") this.tonalHit(time, 260, 88, 0.6, 0.3);
    else if (id === "perc") this.cowbell(time);
  }

  crash(time: number): void {
    this.primitives.noise(time, 1.4, 4_200, 16_000, 0.34, this.output);
  }

  riser(time: number, duration: number): void {
    const source = this.primitives.loopingNoiseSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass";
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.exponentialRampToValueAtTime(7_800, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.3, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.08);
    source.connect(filter).connect(gain).connect(this.output);
    source.start(time);
    source.stop(time + duration + 0.12);
  }

  private kick(time: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(165, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    envelope(gain.gain, time, 0.94, 0.42, 0.002);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + 0.5);
    this.primitives.noise(time, 0.02, 1_200, 9_000, 0.2, this.output);
  }

  private snare(time: number): void {
    this.tonalHit(time, 196, 140, 0.35, 0.13);
    this.primitives.noise(time, 0.17, 1_500, 9_500, 0.45, this.output);
  }

  private tonalHit(
    time: number,
    start: number,
    end: number,
    peak: number,
    decay: number,
  ): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(start, time);
    oscillator.frequency.exponentialRampToValueAtTime(end, time + decay * 0.75);
    envelope(gain.gain, time, peak, decay, 0.002);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + decay + 0.1);
  }

  private cowbell(time: number): void {
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 2_400;
    filter.Q.value = 2.2;
    envelope(gain.gain, time, 0.28, 0.14, 0.002);
    this.primitives.oscillators(time, [["square", 540], ["square", 800]], filter, 0.14);
    filter.connect(gain).connect(this.output);
  }
}

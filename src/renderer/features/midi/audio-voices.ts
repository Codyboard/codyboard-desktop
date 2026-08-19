function envelope(
  parameter: AudioParam,
  time: number,
  peak: number,
  decay: number,
  attack = 0.001,
) {
  parameter.setValueAtTime(0.0001, time);
  parameter.exponentialRampToValueAtTime(peak, time + attack);
  parameter.exponentialRampToValueAtTime(0.0001, time + decay);
}

export class MidiVoices {
  private readonly noiseBuffer: AudioBuffer;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1)
      channel[index] = Math.random() * 2 - 1;
  }

  playDrum(id: string, time: number): void {
    if (id === "kick") this.kick(time);
    else if (id === "snare") this.snare(time);
    else if (id === "hat") this.noise(time, 0.045, 7_500, 16_000, 0.3);
    else if (id === "ohat") this.noise(time, 0.34, 6_800, 16_000, 0.26);
    else if (id === "clap") [0, 0.011, 0.023, 0.038].forEach((offset, index) =>
      this.noise(time + offset, index === 3 ? 0.16 : 0.028, 1_100, 6_500, index === 3 ? 0.42 : 0.34));
    else if (id === "tom") this.tonalHit(time, 260, 88, 0.6, 0.3);
    else if (id === "perc") this.cowbell(time);
  }

  bass(time: number, midi: number): void {
    const frequency = midiToFrequency(midi);
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 9;
    filter.frequency.setValueAtTime(frequency * 9, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.6, 90), time + 0.2);
    const gain = this.context.createGain();
    envelope(gain.gain, time, 0.46, 0.26, 0.006);
    ([
      ["sawtooth", frequency, 0.48], ["square", frequency * 1.005, 0.24], ["sine", frequency / 2, 0.52],
    ] as const).forEach(([type, value, volume]) => {
      const oscillator = this.context.createOscillator();
      const oscillatorGain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = value;
      oscillatorGain.gain.value = volume;
      oscillator.connect(oscillatorGain).connect(filter);
      oscillator.start(time);
      oscillator.stop(time + 0.42);
    });
    filter.connect(gain).connect(this.output);
  }

  arpeggio(time: number, midi: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = "triangle";
    oscillator.frequency.value = midiToFrequency(midi);
    filter.type = "lowpass";
    filter.frequency.value = 2_600;
    envelope(gain.gain, time, 0.2, 0.17, 0.008);
    oscillator.connect(filter).connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + 0.22);
  }

  metronome(time: number, accented: boolean): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = accented ? 1_450 : 1_050;
    envelope(gain.gain, time, accented ? 0.09 : 0.05, 0.035, 0.001);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
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
    this.noise(time, 0.02, 1_200, 9_000, 0.2);
  }

  private snare(time: number): void {
    this.tonalHit(time, 196, 140, 0.35, 0.13);
    this.noise(time, 0.17, 1_500, 9_500, 0.45);
  }

  private tonalHit(time: number, start: number, end: number, peak: number, decay: number): void {
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
    [540, 800].forEach((frequency) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      oscillator.start(time);
      oscillator.stop(time + 0.2);
    });
    filter.connect(gain).connect(this.output);
  }

  private noise(time: number, duration: number, highpass: number, lowpass: number, volume: number): void {
    const source = this.context.createBufferSource();
    const high = this.context.createBiquadFilter();
    const low = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    high.type = "highpass";
    high.frequency.value = highpass;
    low.type = "lowpass";
    low.frequency.value = lowpass;
    envelope(gain.gain, time, volume, duration);
    source.connect(high).connect(low).connect(gain).connect(this.output);
    source.start(time);
    source.stop(time + duration + 0.05);
  }
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

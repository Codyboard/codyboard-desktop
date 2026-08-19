import type { BassVoiceId, ChordVoiceId, LeadVoiceId } from "./rigs";

export interface MidiBuses {
  bass: AudioNode;
  drum: AudioNode;
  music: AudioNode;
}

function envelope(
  parameter: AudioParam,
  time: number,
  peak: number,
  decay: number,
  attack = 0.001,
) {
  parameter.setValueAtTime(0.0001, time);
  parameter.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
  parameter.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class MidiVoices {
  private readonly noiseBuffer: AudioBuffer;

  constructor(
    private readonly context: AudioContext,
    private readonly buses: MidiBuses,
  ) {
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1)
      channel[index] = Math.random() * 2 - 1;
  }

  playDrum(id: string, time: number): void {
    if (id === "kick") this.kick(time);
    else if (id === "snare") this.snare(time);
    else if (id === "hat") this.noise(time, 0.045, 7_500, 16_000, 0.3, this.buses.drum);
    else if (id === "ohat") this.noise(time, 0.34, 6_800, 16_000, 0.26, this.buses.drum);
    else if (id === "clap") [0, 0.011, 0.023, 0.038].forEach((offset, index) =>
      this.noise(time + offset, index === 3 ? 0.16 : 0.028, 1_100, 6_500, index === 3 ? 0.42 : 0.34, this.buses.drum));
    else if (id === "tom") this.tonalHit(time, 260, 88, 0.6, 0.3);
    else if (id === "perc") this.cowbell(time);
  }

  chord(time: number, midis: readonly number[], voice: ChordVoiceId, velocity: number): void {
    midis.forEach((midi, index) => {
      const strum = index * (voice === "brass" ? 0.004 : 0.008);
      this.chordNote(time + strum, midi, voice, velocity / (1.4 + index * 0.28));
    });
  }

  lead(time: number, midi: number, voice: LeadVoiceId, velocity: number): void {
    const gain = this.context.createGain();
    gain.connect(this.buses.music);
    const frequency = midiToFrequency(midi);
    if (voice === "talk") {
      this.formant(time, frequency, gain, velocity);
      return;
    }
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.connect(gain);
    if (voice === "fm") {
      filter.frequency.value = 5_200;
      this.fmPair(time, frequency, filter, 3, 620, 0.34);
      envelope(gain.gain, time, velocity * 0.2, 0.36, 0.004);
      return;
    }
    const shapes: readonly OscillatorType[] = voice === "square"
      ? ["square"]
      : voice === "saw" ? ["sawtooth", "sawtooth"] : ["square", "sawtooth"];
    filter.Q.value = voice === "clavLead" ? 7 : 1.2;
    filter.frequency.setValueAtTime(voice === "clavLead" ? 4_200 : 3_400, time);
    filter.frequency.exponentialRampToValueAtTime(1_500, time + 0.28);
    this.oscillators(
      time,
      shapes.map((type, index) => [type, frequency * (index === 1 ? 1.006 : 1)] as const),
      filter,
      0.4,
    );
    envelope(gain.gain, time, velocity * 0.18, voice === "clavLead" ? 0.2 : 0.3, 0.004);
  }

  bass(time: number, midi: number, voice: BassVoiceId, velocity: number): void {
    const frequency = midiToFrequency(midi);
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.connect(gain).connect(this.buses.bass);
    const layers: readonly (readonly [OscillatorType, number, number])[] =
      voice === "octave"
        ? [["sine", frequency, 0.6], ["sawtooth", frequency * 2, 0.28]]
        : voice === "sub"
          ? [["sine", frequency, 0.85], ["triangle", frequency * 2, 0.12]]
          : voice === "reese"
            ? [["sawtooth", frequency * 0.994, 0.4], ["sawtooth", frequency * 1.006, 0.4], ["sine", frequency / 2, 0.5]]
            : voice === "moog"
              ? [["sawtooth", frequency, 0.62], ["sine", frequency / 2, 0.4]]
              : [["sawtooth", frequency, 0.48], ["square", frequency * 1.005, 0.24], ["sine", frequency / 2, 0.52]];
    const resonance = voice === "moog" ? 13 : voice === "slap" ? 9 : voice === "reese" ? 6 : 2;
    const sweepTop = voice === "sub" ? frequency * 2.4 : frequency * (voice === "slap" ? 11 : 8);
    const decay = voice === "sub" || voice === "reese" ? 0.42 : 0.26;
    filter.Q.value = resonance;
    filter.frequency.setValueAtTime(Math.min(sweepTop, 12_000), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.6, 90), time + 0.2);
    envelope(gain.gain, time, velocity * 0.5, decay, 0.006);
    for (const [type, value, volume] of layers) {
      const oscillator = this.context.createOscillator();
      const oscillatorGain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = value;
      oscillatorGain.gain.value = volume;
      oscillator.connect(oscillatorGain).connect(filter);
      oscillator.start(time);
      oscillator.stop(time + decay + 0.2);
    }
    if (voice === "slap") this.noise(time, 0.03, 2_400, 9_000, velocity * 0.16, this.buses.bass);
  }

  crash(time: number): void {
    this.noise(time, 1.4, 4_200, 16_000, 0.34, this.buses.drum);
  }

  riser(time: number, duration: number): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.Q.value = 5;
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.exponentialRampToValueAtTime(7_800, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.3, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.08);
    source.connect(filter).connect(gain).connect(this.buses.drum);
    source.start(time);
    source.stop(time + duration + 0.12);
  }

  private chordNote(time: number, midi: number, voice: ChordVoiceId, velocity: number): void {
    const frequency = midiToFrequency(midi);
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    gain.connect(this.buses.music);
    filter.connect(gain);
    if (voice === "epiano") {
      filter.type = "lowpass";
      filter.frequency.value = 3_600;
      this.fmPair(time, frequency, filter, 2, 340, 0.5);
      envelope(gain.gain, time, velocity * 0.34, 0.9, 0.004);
      return;
    }
    if (voice === "clav") {
      filter.type = "bandpass";
      filter.frequency.value = Math.min(frequency * 3.4, 4_200);
      filter.Q.value = 5.5;
      this.oscillators(time, [["square", frequency], ["square", frequency * 1.004]], filter, 0.22);
      envelope(gain.gain, time, velocity * 0.3, 0.14, 0.002);
      return;
    }
    if (voice === "brass") {
      filter.type = "lowpass";
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(520, time);
      filter.frequency.exponentialRampToValueAtTime(3_400, time + 0.06);
      filter.frequency.exponentialRampToValueAtTime(1_100, time + 0.3);
      this.oscillators(time, [
        ["sawtooth", frequency], ["sawtooth", frequency * 1.007], ["sawtooth", frequency * 0.993],
      ], filter, 0.42);
      envelope(gain.gain, time, velocity * 0.24, 0.3, 0.02);
      return;
    }
    if (voice === "poly") {
      filter.type = "lowpass";
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(2_600, time);
      filter.frequency.exponentialRampToValueAtTime(900, time + 0.4);
      this.oscillators(time, [["sawtooth", frequency * 0.996], ["sawtooth", frequency * 1.004]], filter, 0.55);
      envelope(gain.gain, time, velocity * 0.24, 0.44, 0.008);
      return;
    }
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(7_000, time);
    filter.frequency.exponentialRampToValueAtTime(900, time + 0.14);
    this.oscillators(time, [["sawtooth", frequency], ["triangle", frequency * 2]], filter, 0.4);
    envelope(gain.gain, time, velocity * 0.26, 0.32, 0.002);
  }

  private oscillators(
    time: number,
    layers: readonly (readonly [OscillatorType, number])[],
    destination: AudioNode,
    duration: number,
  ): void {
    for (const [type, frequency] of layers) {
      const oscillator = this.context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(destination);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.1);
    }
  }

  private fmPair(
    time: number,
    frequency: number,
    destination: AudioNode,
    ratio: number,
    index: number,
    duration: number,
  ): void {
    const carrier = this.context.createOscillator();
    const modulator = this.context.createOscillator();
    const modulationGain = this.context.createGain();
    carrier.type = "sine";
    modulator.type = "sine";
    carrier.frequency.value = frequency;
    modulator.frequency.value = frequency * ratio;
    modulationGain.gain.setValueAtTime(index, time);
    modulationGain.gain.exponentialRampToValueAtTime(1, time + duration * 0.6);
    modulator.connect(modulationGain).connect(carrier.frequency);
    carrier.connect(destination);
    modulator.start(time);
    carrier.start(time);
    modulator.stop(time + duration + 0.2);
    carrier.stop(time + duration + 0.2);
  }

  private formant(time: number, frequency: number, output: GainNode, velocity: number): void {
    const source = this.context.createOscillator();
    source.type = "sawtooth";
    source.frequency.value = frequency;
    for (const [center, level] of [[720, 0.5], [1_240, 0.34], [2_540, 0.18]] as const) {
      const band = this.context.createBiquadFilter();
      const bandGain = this.context.createGain();
      band.type = "bandpass";
      band.frequency.value = center;
      band.Q.value = 7;
      bandGain.gain.value = level;
      source.connect(band).connect(bandGain).connect(output);
    }
    envelope(output.gain, time, velocity * 0.22, 0.3, 0.01);
    source.start(time);
    source.stop(time + 0.42);
  }

  private kick(time: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(165, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    envelope(gain.gain, time, 0.94, 0.42, 0.002);
    oscillator.connect(gain).connect(this.buses.drum);
    oscillator.start(time);
    oscillator.stop(time + 0.5);
    this.noise(time, 0.02, 1_200, 9_000, 0.2, this.buses.drum);
  }

  private snare(time: number): void {
    this.tonalHit(time, 196, 140, 0.35, 0.13);
    this.noise(time, 0.17, 1_500, 9_500, 0.45, this.buses.drum);
  }

  private tonalHit(time: number, start: number, end: number, peak: number, decay: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(start, time);
    oscillator.frequency.exponentialRampToValueAtTime(end, time + decay * 0.75);
    envelope(gain.gain, time, peak, decay, 0.002);
    oscillator.connect(gain).connect(this.buses.drum);
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
    this.oscillators(time, [["square", 540], ["square", 800]], filter, 0.14);
    filter.connect(gain).connect(this.buses.drum);
  }

  private noise(
    time: number,
    duration: number,
    highpass: number,
    lowpass: number,
    volume: number,
    destination: AudioNode,
  ): void {
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
    source.connect(high).connect(low).connect(gain).connect(destination);
    source.start(time);
    source.stop(time + duration + 0.05);
  }
}

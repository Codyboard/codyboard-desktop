import { AudioVoicePrimitives, envelope, midiToFrequency } from "./audio-primitives";
import type { BassVoiceId, ChordVoiceId, LeadVoiceId } from "./rigs";

export class MelodicVoices {
  constructor(
    private readonly context: AudioContext,
    private readonly bassOutput: AudioNode,
    private readonly musicOutput: AudioNode,
    private readonly primitives: AudioVoicePrimitives,
  ) {}

  chord(time: number, midis: readonly number[], voice: ChordVoiceId, velocity: number): void {
    midis.forEach((midi, index) => {
      const strum = index * (voice === "brass" ? 0.004 : 0.008);
      this.chordNote(time + strum, midi, voice, velocity / (1.4 + index * 0.28));
    });
  }

  lead(time: number, midi: number, voice: LeadVoiceId, velocity: number): void {
    const gain = this.context.createGain();
    gain.connect(this.musicOutput);
    const frequency = midiToFrequency(midi);
    if (voice === "talk") { this.formant(time, frequency, gain, velocity); return; }
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.connect(gain);
    if (voice === "fm") {
      filter.frequency.value = 5_200;
      this.primitives.fmPair(time, frequency, filter, 3, 620, 0.34);
      envelope(gain.gain, time, velocity * 0.2, 0.36, 0.004);
      return;
    }
    const shapes: readonly OscillatorType[] = voice === "square"
      ? ["square"]
      : voice === "saw" ? ["sawtooth", "sawtooth"] : ["square", "sawtooth"];
    filter.Q.value = voice === "clavLead" ? 7 : 1.2;
    filter.frequency.setValueAtTime(voice === "clavLead" ? 4_200 : 3_400, time);
    filter.frequency.exponentialRampToValueAtTime(1_500, time + 0.28);
    this.primitives.oscillators(time, shapes.map((type, index) => [type, frequency * (index === 1 ? 1.006 : 1)] as const), filter, 0.4);
    envelope(gain.gain, time, velocity * 0.18, voice === "clavLead" ? 0.2 : 0.3, 0.004);
  }

  bass(time: number, midi: number, voice: BassVoiceId, velocity: number): void {
    const frequency = midiToFrequency(midi);
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = "lowpass";
    filter.connect(gain).connect(this.bassOutput);
    const layers = bassLayers(voice, frequency);
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
    if (voice === "slap")
      this.primitives.noise(time, 0.03, 2_400, 9_000, velocity * 0.16, this.bassOutput);
  }

  private chordNote(time: number, midi: number, voice: ChordVoiceId, velocity: number): void {
    const frequency = midiToFrequency(midi);
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    gain.connect(this.musicOutput);
    filter.connect(gain);
    if (voice === "epiano") {
      filter.type = "lowpass"; filter.frequency.value = 3_600;
      this.primitives.fmPair(time, frequency, filter, 2, 340, 0.5);
      envelope(gain.gain, time, velocity * 0.34, 0.9, 0.004); return;
    }
    if (voice === "clav") {
      filter.type = "bandpass"; filter.frequency.value = Math.min(frequency * 3.4, 4_200); filter.Q.value = 5.5;
      this.primitives.oscillators(time, [["square", frequency], ["square", frequency * 1.004]], filter, 0.22);
      envelope(gain.gain, time, velocity * 0.3, 0.14, 0.002); return;
    }
    if (voice === "brass") {
      filter.type = "lowpass"; filter.Q.value = 3;
      filter.frequency.setValueAtTime(520, time); filter.frequency.exponentialRampToValueAtTime(3_400, time + 0.06); filter.frequency.exponentialRampToValueAtTime(1_100, time + 0.3);
      this.primitives.oscillators(time, [["sawtooth", frequency], ["sawtooth", frequency * 1.007], ["sawtooth", frequency * 0.993]], filter, 0.42);
      envelope(gain.gain, time, velocity * 0.24, 0.3, 0.02); return;
    }
    if (voice === "poly") {
      filter.type = "lowpass"; filter.Q.value = 4;
      filter.frequency.setValueAtTime(2_600, time); filter.frequency.exponentialRampToValueAtTime(900, time + 0.4);
      this.primitives.oscillators(time, [["sawtooth", frequency * 0.996], ["sawtooth", frequency * 1.004]], filter, 0.55);
      envelope(gain.gain, time, velocity * 0.24, 0.44, 0.008); return;
    }
    filter.type = "lowpass"; filter.Q.value = 6;
    filter.frequency.setValueAtTime(7_000, time); filter.frequency.exponentialRampToValueAtTime(900, time + 0.14);
    this.primitives.oscillators(time, [["sawtooth", frequency], ["triangle", frequency * 2]], filter, 0.4);
    envelope(gain.gain, time, velocity * 0.26, 0.32, 0.002);
  }

  private formant(time: number, frequency: number, output: GainNode, velocity: number): void {
    const source = this.context.createOscillator();
    source.type = "sawtooth";
    source.frequency.value = frequency;
    for (const [center, level] of [[720, 0.5], [1_240, 0.34], [2_540, 0.18]] as const) {
      const band = this.context.createBiquadFilter();
      const bandGain = this.context.createGain();
      band.type = "bandpass"; band.frequency.value = center; band.Q.value = 7; bandGain.gain.value = level;
      source.connect(band).connect(bandGain).connect(output);
    }
    envelope(output.gain, time, velocity * 0.22, 0.3, 0.01);
    source.start(time); source.stop(time + 0.42);
  }
}

function bassLayers(voice: BassVoiceId, frequency: number): readonly (readonly [OscillatorType, number, number])[] {
  if (voice === "octave") return [["sine", frequency, 0.6], ["sawtooth", frequency * 2, 0.28]];
  if (voice === "sub") return [["sine", frequency, 0.85], ["triangle", frequency * 2, 0.12]];
  if (voice === "reese") return [["sawtooth", frequency * 0.994, 0.4], ["sawtooth", frequency * 1.006, 0.4], ["sine", frequency / 2, 0.5]];
  if (voice === "moog") return [["sawtooth", frequency, 0.62], ["sine", frequency / 2, 0.4]];
  return [["sawtooth", frequency, 0.48], ["square", frequency * 1.005, 0.24], ["sine", frequency / 2, 0.52]];
}

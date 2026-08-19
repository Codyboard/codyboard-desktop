export function envelope(
  parameter: AudioParam,
  time: number,
  peak: number,
  decay: number,
  attack = 0.001,
): void {
  parameter.setValueAtTime(0.0001, time);
  parameter.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
  parameter.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class AudioVoicePrimitives {
  private readonly noiseBuffer: AudioBuffer;

  constructor(private readonly context: AudioContext) {
    this.noiseBuffer = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const channel = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1)
      channel[index] = Math.random() * 2 - 1;
  }

  noise(
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

  oscillators(
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

  fmPair(
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

  loopingNoiseSource(): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    return source;
  }
}

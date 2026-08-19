import type { MidiAudioEngine } from "./audio-engine";

class FakeParam {
  value = 0;
  cancelScheduledValues() { return this; }
  exponentialRampToValueAtTime(value: number) {
    if (value <= 0) throw new Error("exponential ramp requires a positive target");
    this.value = value; return this;
  }
  linearRampToValueAtTime(value: number) { this.value = value; return this; }
  setTargetAtTime(value: number) { this.value = value; return this; }
  setValueAtTime(value: number) { this.value = value; return this; }
}

function connectable<T extends object>(node: T) {
  return Object.assign(node, {
    connect: (destination: unknown) => destination,
    disconnect: () => undefined,
  });
}

export class FakeAudioContext {
  currentTime = 0;
  destination = connectable({});
  sampleRate = 48_000;
  createAnalyser() { return connectable({
    fftSize: 0, frequencyBinCount: 64, smoothingTimeConstant: 0,
    getByteFrequencyData: () => undefined,
  }); }
  createBiquadFilter() { return connectable({ frequency: new FakeParam(), Q: new FakeParam(), type: "lowpass" }); }
  createBuffer(channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length), length, numberOfChannels: channels };
  }
  createBufferSource() { return connectable({
    buffer: null, loop: false, playbackRate: new FakeParam(),
    start: () => undefined, stop: () => undefined,
  }); }
  createConvolver() { return connectable({ buffer: null }); }
  createDelay() { return connectable({ delayTime: new FakeParam() }); }
  createDynamicsCompressor() { return connectable({
    attack: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(),
    release: new FakeParam(), threshold: new FakeParam(),
  }); }
  createGain() { return connectable({ gain: new FakeParam() }); }
  createOscillator() { return connectable({
    frequency: new FakeParam(), type: "sine", start: () => undefined, stop: () => undefined,
  }); }
  close() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
}

export function advance(engine: MidiAudioEngine, context: FakeAudioContext, seconds: number): void {
  const runner = engine as unknown as { tick: () => void };
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.025) {
    context.currentTime += 0.025;
    runner.tick();
  }
}

export function position(engine: MidiAudioEngine): number {
  return (engine as unknown as { sequenceStep: number }).sequenceStep;
}

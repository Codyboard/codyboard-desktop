import { MidiVoices } from "./audio-voices";

export interface MidiAudioGraph {
  analyser: AnalyserNode;
  context: AudioContext;
  delay: DelayNode;
  delaySend: GainNode;
  djFilter: BiquadFilterNode;
  master: GainNode;
  voices: MidiVoices;
}

export function createMidiAudioGraph(initialDelayMix: number): MidiAudioGraph {
  const context = new AudioContext();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const analyser = context.createAnalyser();
  compressor.threshold.value = -14;
  compressor.knee.value = 22;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  master.gain.value = 0.82;
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.72;
  master.connect(compressor).connect(analyser);
  compressor.connect(context.destination);

  const djFilter = context.createBiquadFilter();
  djFilter.type = "lowpass";
  djFilter.frequency.value = 18_000;
  djFilter.Q.value = 1.4;
  djFilter.connect(master);

  const mix = context.createGain();
  const drum = context.createGain();
  const bass = context.createGain();
  const music = context.createGain();
  mix.connect(djFilter);
  drum.connect(mix);
  bass.connect(mix);
  music.connect(mix);

  const delay = context.createDelay(1.5);
  const delaySend = context.createGain();
  const feedback = context.createGain();
  const delayTone = context.createBiquadFilter();
  delaySend.gain.value = initialDelayMix;
  feedback.gain.value = 0.32;
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2_800;
  music.connect(delaySend).connect(delay);
  delay.connect(delayTone).connect(feedback).connect(delay);
  delay.connect(mix);

  const reverbSend = context.createGain();
  const reverb = context.createConvolver();
  reverbSend.gain.value = 0.16;
  reverb.buffer = impulseResponse(context, 1.7);
  music.connect(reverbSend).connect(reverb).connect(mix);

  return {
    analyser,
    context,
    delay,
    delaySend,
    djFilter,
    master,
    voices: new MidiVoices(context, { bass, drum, music }),
  };
}

function impulseResponse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1)
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3.2;
  }
  return buffer;
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MidiAudioEngine, type MidiPulse } from "./audio-engine";
import { advance, FakeAudioContext, position } from "./audio-engine-test-fixture";
import { FX_ORDER } from "./controls";
import { MIDI_PAD_KEYS, MIDI_PAD_SLOTS } from "./harmony";
import { BASS_PATTERNS, DRUM_FAMILIES, DRUM_KITS, drumKitIndex } from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  Object.assign(globalThis, {
    AudioContext: function AudioContextStub() { return context; },
    window: {
      clearInterval: () => undefined,
      clearTimeout: () => undefined,
      setInterval: () => 1,
      setTimeout: () => 1,
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "AudioContext");
  Reflect.deleteProperty(globalThis, "window");
});

describe("Get Funky audio engine", () => {
  it("starts running with a rig loaded and no chords recorded", () => {
    const engine = new MidiAudioEngine();
    const snapshot = engine.getSnapshot();
    expect(snapshot.playing).toBe(true);
    expect(snapshot.rig).toBe(MIDI_RIGS[0].name);
    expect(snapshot.drumTemplate).toBe(MIDI_RIGS[0].defaultDrum);
    expect(snapshot.progression).toEqual([]);
    engine.dispose();
  });

  it("schedules two bars of every rig and phrase engine without faulting", () => {
    for (const rig of MIDI_RIGS.keys()) {
      for (const key of MIDI_PAD_KEYS) {
        context = new FakeAudioContext();
        const engine = new MidiAudioEngine();
        engine.selectRig(rig);
        engine.addChord(MIDI_PAD_SLOTS[key]);
        advance(engine, context, 8);
        expect(engine.getSnapshot().progression).toHaveLength(1);
        engine.dispose();
      }
    }
  });

  it("removes a chord and closes the gap on the next half bar", () => {
    const engine = new MidiAudioEngine();
    for (const key of ["T", "G", "B"] as const) engine.addChord(MIDI_PAD_SLOTS[key]);
    advance(engine, context, 8);
    expect(engine.getSnapshot().progression.map((slot) => slot.degree)).toEqual(["i", "IV", "VI"]);

    engine.removeChord(1);
    // The HUD reflects it at once, then the audio loop adopts it on the half-bar boundary.
    expect(engine.getSnapshot().progression.map((slot) => slot.degree)).toEqual(["i", "VI"]);
    advance(engine, context, 8);
    expect(engine.getSnapshot().progression.map((slot) => slot.degree)).toEqual(["i", "VI"]);
    engine.dispose();
  });

  it("ignores a removal aimed at an empty slot", () => {
    const engine = new MidiAudioEngine();
    engine.addChord(MIDI_PAD_SLOTS.T);
    advance(engine, context, 8);
    engine.removeChord(3);
    expect(engine.getSnapshot().progression).toHaveLength(1);
    engine.dispose();
  });

  it("commits queued chords on the next half bar and keeps four slots", () => {
    const engine = new MidiAudioEngine();
    const pulses: MidiPulse[] = [];
    engine.onPulse((pulse) => pulses.push(pulse));
    // One column, so these five share a root and differ only in texture; the oldest is evicted.
    for (const key of ["Q", "W", "E", "R", "T"] as const) engine.addChord(MIDI_PAD_SLOTS[key]);
    expect(engine.getSnapshot().progression).toHaveLength(4);
    advance(engine, context, 6);
    expect(engine.getSnapshot().progression.map((slot) => slot.phrase))
      .toEqual(["pedal", "arp", "spread", "stab"]);
    expect(engine.getSnapshot().progression.map((slot) => slot.degree))
      .toEqual(["i", "i", "i", "i"]);
    engine.dispose();
  });

  it("plays every drum kit and every bass pattern", () => {
    const engine = new MidiAudioEngine();
    engine.addChord(MIDI_PAD_SLOTS.Q);
    engine.toggleLayer();
    expect(engine.getSnapshot().activeLayer).toBe("DRUM");
    const kits = new Set<string>();
    DRUM_KITS.forEach(() => {
      engine.turnKnob(1);
      advance(engine, context, 4);
      kits.add(engine.getSnapshot().drumTemplate);
    });
    expect(kits).toHaveLength(DRUM_KITS.length);

    engine.toggleLayer();
    expect(engine.getSnapshot().activeLayer).toBe("BASS");
    const patterns = new Set<string>();
    BASS_PATTERNS.forEach(() => {
      engine.turnKnob(1);
      advance(engine, context, 4);
      patterns.add(engine.getSnapshot().bassTemplate);
    });
    expect(patterns).toHaveLength(BASS_PATTERNS.length);
    engine.dispose();
  });

  it("jumps to a drum family and walks its variants", () => {
    const engine = new MidiAudioEngine();
    for (const family of DRUM_FAMILIES) {
      engine.selectDrumFamily(family);
      advance(engine, context, 4);
      const first = engine.getSnapshot().drumTemplate;
      expect(DRUM_KITS.find((kit) => kit.name === first)?.family).toBe(family);
      engine.selectDrumFamily(family);
      advance(engine, context, 4);
      expect(engine.getSnapshot().drumTemplate).not.toBe(first);
      expect(DRUM_KITS.find((kit) => kit.name === engine.getSnapshot().drumTemplate)?.family)
        .toBe(family);
    }
    engine.dispose();
  });

  it("plays through every performance effect", () => {
    const engine = new MidiAudioEngine();
    engine.addChord(MIDI_PAD_SLOTS.Q);
    for (const fx of FX_ORDER) {
      engine.triggerFx(fx);
      advance(engine, context, 3);
      expect(engine.getSnapshot().activeFx).not.toContain("riser");
    }
    engine.dispose();
  });

  it("switches rig live and restarts the loop at step one", () => {
    const engine = new MidiAudioEngine();
    engine.addChord(MIDI_PAD_SLOTS.Q);
    advance(engine, context, 2);
    expect(position(engine)).toBeGreaterThan(0);

    engine.selectRig(4);
    const snapshot = engine.getSnapshot();
    expect(snapshot.rig).toBe(MIDI_RIGS[4].name);
    expect(snapshot.drumTemplate).toBe(MIDI_RIGS[4].defaultDrum);
    expect(snapshot.bassTemplate).toBe(MIDI_RIGS[4].defaultBass);
    expect(position(engine)).toBe(0);
    advance(engine, context, 2);
    engine.dispose();
  });

  it("switches drum kits and bass patterns live from the knob", () => {
    const engine = new MidiAudioEngine();
    advance(engine, context, 2);
    expect(position(engine)).toBeGreaterThan(0);
    const drum = engine.getSnapshot().drumTemplate;
    const nextDrum = DRUM_KITS[(drumKitIndex(drum) + 1) % DRUM_KITS.length].name;
    engine.toggleLayer();
    engine.turnKnob(1);
    expect(engine.getSnapshot().drumTemplate).toBe(nextDrum);
    expect(position(engine)).toBe(0);

    advance(engine, context, 2);
    expect(position(engine)).toBeGreaterThan(0);
    const bass = engine.getSnapshot().bassTemplate;
    engine.toggleLayer();
    engine.turnKnob(1);
    expect(engine.getSnapshot().bassTemplate).not.toBe(bass);
    expect(position(engine)).toBe(0);
    engine.dispose();
  });

  it("moves tempo without restarting the loop", () => {
    const engine = new MidiAudioEngine();
    engine.toggleLayer();
    engine.toggleLayer();
    engine.toggleLayer();
    expect(engine.getSnapshot().activeLayer).toBe("TEMPO");
    advance(engine, context, 2);
    const step = position(engine);
    expect(step).toBeGreaterThan(0);
    engine.turnKnob(1);
    expect(position(engine)).toBe(step);
    engine.dispose();
  });

  it("returns to the opening state on reset", () => {
    const engine = new MidiAudioEngine();
    engine.selectRig(3);
    engine.addChord(MIDI_PAD_SLOTS.Q);
    engine.addChord(MIDI_PAD_SLOTS.W);
    engine.triggerFx("filter");
    engine.triggerFx("half");
    engine.toggleLayer();
    engine.togglePlayback();
    advance(engine, context, 4);
    expect(engine.getSnapshot().playing).toBe(false);

    engine.reset();
    const snapshot = engine.getSnapshot();
    expect(snapshot.progression).toEqual([]);
    expect(snapshot.rig).toBe(MIDI_RIGS[0].name);
    expect(snapshot.drumTemplate).toBe(MIDI_RIGS[0].defaultDrum);
    expect(snapshot.bassTemplate).toBe(MIDI_RIGS[0].defaultBass);
    expect(snapshot.activeFx).toEqual([]);
    expect(snapshot.activeLayer).toBe("RIG");
    expect(snapshot.playing).toBe(true);
    expect(snapshot.step).toBe(0);
    advance(engine, context, 4);
    engine.dispose();
  });

  it("cycles the knob layers and moves tempo in two BPM steps", () => {
    const engine = new MidiAudioEngine();
    expect(engine.getSnapshot().activeLayer).toBe("RIG");
    engine.toggleLayer();
    expect(engine.getSnapshot().activeLayer).toBe("DRUM");
    engine.toggleLayer();
    engine.toggleLayer();
    expect(engine.getSnapshot().activeLayer).toBe("TEMPO");
    const before = engine.getSnapshot().bpm;
    engine.turnKnob(1);
    expect(engine.getSnapshot().bpm).toBe(before + 2);
    engine.dispose();
  });
});

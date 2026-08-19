import { describe, expect, it } from "vitest";

import {
  BASS_PATTERNS, bassPatternIndex, DRUM_FAMILIES, DRUM_KITS, drumKitIndex, MIDI_STEPS,
  nextKitInFamily,
} from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

describe("Get Funky rigs", () => {
  it("gives every rig a complete sixteenth-note pattern set", () => {
    for (const rig of MIDI_RIGS) {
      expect(rig.comp).toHaveLength(MIDI_STEPS);
      expect(rig.arp).toHaveLength(MIDI_STEPS);
      expect(rig.riff).toHaveLength(MIDI_STEPS);
      expect(/^[xo.]+$/.test(rig.comp)).toBe(true);
      for (const tone of rig.arp) expect(tone).toBeLessThan(8);
    }
  });

  it("points every rig at a real drum kit and bass pattern", () => {
    for (const rig of MIDI_RIGS) {
      expect(DRUM_KITS[drumKitIndex(rig.defaultDrum)].name).toBe(rig.defaultDrum);
      expect(BASS_PATTERNS[bassPatternIndex(rig.defaultBass)].name).toBe(rig.defaultBass);
    }
  });

  it("keeps every drum kit playable and inside the tempo range", () => {
    expect(new Set(DRUM_KITS.map((kit) => kit.name))).toHaveLength(DRUM_KITS.length);
    for (const kit of DRUM_KITS) {
      expect(kit.bpm).toBeGreaterThanOrEqual(60);
      expect(kit.bpm).toBeLessThanOrEqual(180);
      for (const mask of Object.values(kit.tracks)) {
        expect(mask).toHaveLength(MIDI_STEPS);
        expect(/^[x.]+$/.test(mask)).toBe(true);
      }
    }
  });

  it("covers every drum family with more than one kit", () => {
    for (const family of DRUM_FAMILIES) {
      const members = DRUM_KITS.filter((kit) => kit.family === family);
      expect(members.length).toBeGreaterThan(1);
    }
    expect(new Set(DRUM_KITS.map((kit) => kit.family))).toEqual(new Set(DRUM_FAMILIES));
  });

  it("enters a family then walks its variants on repeated presses", () => {
    const funk = DRUM_KITS.map((kit, index) => ({ index, kit }))
      .filter(({ kit }) => kit.family === "FUNK").map(({ index }) => index);
    const first = nextKitInFamily(drumKitIndex("SMOOTH"), "FUNK");
    expect(first).toBe(funk[0]);
    expect(nextKitInFamily(first, "FUNK")).toBe(funk[1]);
    expect(nextKitInFamily(funk[funk.length - 1], "FUNK")).toBe(funk[0]);
  });

  it("ships as many bass patterns as drum kits", () => {
    expect(BASS_PATTERNS).toHaveLength(DRUM_KITS.length);
  });

  it("keeps bass pattern note indices inside the chord-following tone table", () => {
    expect(new Set(BASS_PATTERNS.map((pattern) => pattern.name))).toHaveLength(BASS_PATTERNS.length);
    for (const pattern of BASS_PATTERNS) {
      expect(pattern.mask).toHaveLength(MIDI_STEPS);
      expect(pattern.notes).toHaveLength(MIDI_STEPS);
      expect(/^[x.]+$/.test(pattern.mask)).toBe(true);
      for (const index of pattern.notes) expect(index).toBeLessThan(5);
    }
  });
});

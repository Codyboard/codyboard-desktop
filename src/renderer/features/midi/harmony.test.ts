import { describe, expect, it } from "vitest";

import { arpeggioNote, isMidiPadKey, MIDI_PAD_CHOICES, MIDI_PAD_KEYS } from "./harmony";

describe("Get Funky harmony pads", () => {
  it("maps every physical pad to one of five degrees and three shapes", () => {
    expect(MIDI_PAD_KEYS).toHaveLength(15);
    expect(new Set(MIDI_PAD_KEYS)).toHaveLength(15);
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_CHOICES[key].degree)))
      .toEqual(new Set(["i", "III", "iv", "v", "VI"]));
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_CHOICES[key].shape)))
      .toEqual(new Set(["up", "down", "pulse"]));
  });

  it("recognizes only the fifteen letter pads", () => {
    expect(isMidiPadKey("Q")).toBe(true);
    expect(isMidiPadKey("tab")).toBe(false);
    expect(isMidiPadKey("volumeUp")).toBe(false);
  });

  it("keeps generated notes inside the natural minor scale", () => {
    const naturalMinor = new Set([0, 2, 3, 5, 7, 8, 10]);
    for (const choice of Object.values(MIDI_PAD_CHOICES)) {
      for (let step = 0; step < 4; step += 1)
        expect(naturalMinor.has((arpeggioNote(choice, 36, step) - 36) % 12)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import type { ChordChoice } from "./harmony";
import { adjustedTempo, appendChord, chordAtStep, wrappedIndex } from "./sequencer";

const chord = (degree: ChordChoice["degree"]): ChordChoice => ({ degree, shape: "up" });

describe("Get Funky chord loop", () => {
  it("keeps only the four most recent choices", () => {
    const progression = ["i", "III", "iv", "v", "VI"].reduce<readonly ChordChoice[]>(
      (current, degree) => appendChord(current, chord(degree as ChordChoice["degree"])),
      [],
    );
    expect(progression.map((choice) => choice.degree)).toEqual(["III", "iv", "v", "VI"]);
  });

  it("holds each chord for one beat and loops the recorded choices", () => {
    const progression = [chord("i"), chord("VI")];
    expect(chordAtStep(progression, 0)?.degree).toBe("i");
    expect(chordAtStep(progression, 3)?.degree).toBe("i");
    expect(chordAtStep(progression, 4)?.degree).toBe("VI");
    expect(chordAtStep(progression, 8)?.degree).toBe("i");
  });

  it("wraps template rotation in both directions", () => {
    expect(wrappedIndex(3, 1, 4)).toBe(0);
    expect(wrappedIndex(0, -1, 4)).toBe(3);
  });

  it("adjusts tempo by two BPM and clamps the playable range", () => {
    expect(adjustedTempo(115, 1)).toBe(117);
    expect(adjustedTempo(115, -1)).toBe(113);
    expect(adjustedTempo(180, 1)).toBe(180);
    expect(adjustedTempo(60, -1)).toBe(60);
  });
});

import { describe, expect, it } from "vitest";

import type { ChordSlot } from "./harmony";
import { adjustedTempo, appendSlot, MAX_SLOTS, slotAtStep, SLOT_STEPS, wrappedIndex } from "./sequencer";

const slot = (degree: ChordSlot["degree"]): ChordSlot => ({ degree, phrase: "stab" });

describe("Get Funky chord loop", () => {
  it("keeps only the four most recent choices", () => {
    const progression = ["i", "III", "IV", "v", "VI"].reduce<readonly ChordSlot[]>(
      (current, degree) => appendSlot(current, slot(degree as ChordSlot["degree"])),
      [],
    );
    expect(progression).toHaveLength(MAX_SLOTS);
    expect(progression.map((choice) => choice.degree)).toEqual(["III", "IV", "v", "VI"]);
  });

  it("holds each chord for half a bar and loops the recorded choices", () => {
    const progression = [slot("i"), slot("VI")];
    expect(slotAtStep(progression, 0)?.degree).toBe("i");
    expect(slotAtStep(progression, SLOT_STEPS - 1)?.degree).toBe("i");
    expect(slotAtStep(progression, SLOT_STEPS)?.degree).toBe("VI");
    expect(slotAtStep(progression, SLOT_STEPS * 2)?.degree).toBe("i");
  });

  it("fills the two-bar loop with four chords", () => {
    expect(MAX_SLOTS * SLOT_STEPS).toBe(32);
    expect(slotAtStep([], 0)).toBeUndefined();
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

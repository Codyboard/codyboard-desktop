import { describe, expect, it } from "vitest";

import {
  consumeShift, FX_ORDER, IDLE_SHIFT_LAYER, padAction, shiftActive, shiftDown, shiftUp,
} from "./controls";
import { DRUM_FAMILIES } from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

describe("Get Funky shift layer", () => {
  it("stays armed after a tap so pointer users get a latch", () => {
    const armed = shiftUp(shiftDown(IDLE_SHIFT_LAYER));
    expect(shiftActive(armed)).toBe(true);
    expect(shiftActive(consumeShift(armed))).toBe(false);
  });

  it("stays armed for the whole hold when the key is held down", () => {
    const held = shiftDown(IDLE_SHIFT_LAYER);
    expect(shiftActive(consumeShift(held))).toBe(true);
    expect(shiftActive(shiftUp(consumeShift(held)))).toBe(false);
  });

  it("disarms when an armed layer is tapped again", () => {
    const armed = shiftUp(shiftDown(IDLE_SHIFT_LAYER));
    expect(shiftActive(shiftUp(shiftDown(armed)))).toBe(false);
  });
});

describe("Get Funky pad actions", () => {
  it("plays harmony without the layer", () => {
    expect(padAction("Q", false)).toEqual({ kind: "chord", slot: { degree: "i", phrase: "stab" } });
  });

  it("assigns rigs, drum kits and effects to the three shifted columns", () => {
    expect(padAction("T", true)).toEqual({ index: 0, kind: "rig" });
    expect(padAction("Q", true)).toEqual({ index: 4, kind: "rig" });
    expect(padAction("G", true)).toEqual({ family: DRUM_FAMILIES[0], kind: "drumFamily" });
    expect(padAction("A", true)).toEqual({ family: DRUM_FAMILIES[4], kind: "drumFamily" });
    expect(padAction("B", true)).toEqual({ fx: FX_ORDER[0], kind: "fx" });
    expect(padAction("Z", true)).toEqual({ fx: FX_ORDER[4], kind: "fx" });
  });

  it("keeps one shifted row per rig, drum family and effect", () => {
    expect(MIDI_RIGS).toHaveLength(5);
    expect(DRUM_FAMILIES).toHaveLength(5);
    expect(FX_ORDER).toHaveLength(5);
  });
});

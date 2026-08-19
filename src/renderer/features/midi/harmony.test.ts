import { describe, expect, it } from "vitest";

import {
  chordTones, chordVoicing, HARMONY_COLUMNS, HARMONY_DEGREES, isMidiPadKey, MIDI_PAD_KEYS,
  MIDI_PAD_SLOTS, padPosition, phraseAt, PHRASE_ROWS, scaleSemitone, snapToChordTone,
} from "./harmony";
import { MIDI_RIGS } from "./rigs";

describe("Get Funky harmony grid", () => {
  it("maps the pads to five phrase engines and three degrees", () => {
    expect(MIDI_PAD_KEYS).toHaveLength(15);
    expect(new Set(MIDI_PAD_KEYS)).toHaveLength(15);
    expect(HARMONY_COLUMNS).toHaveLength(3);
    expect(PHRASE_ROWS).toHaveLength(5);
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_SLOTS[key].degree)))
      .toEqual(new Set(HARMONY_COLUMNS));
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_SLOTS[key].phrase)))
      .toEqual(new Set(PHRASE_ROWS));
  });

  it("keeps rows phrase-shaped and columns harmonic", () => {
    expect(padPosition("T")).toEqual({ column: 0, row: 0 });
    expect(padPosition("Z")).toEqual({ column: 2, row: 4 });
    // A row is one texture across three roots; a column is one root through five textures.
    for (const row of [0, 1, 2, 3, 4]) {
      const keys = MIDI_PAD_KEYS.slice(row * 3, row * 3 + 3);
      expect(new Set(keys.map((key) => MIDI_PAD_SLOTS[key].phrase))).toHaveLength(1);
      expect(new Set(keys.map((key) => MIDI_PAD_SLOTS[key].degree))).toHaveLength(3);
    }
    expect(MIDI_PAD_SLOTS.T).toEqual({ degree: "i", phrase: "stab" });
    expect(MIDI_PAD_SLOTS.Q).toEqual({ degree: "i", phrase: "riff" });
    expect(MIDI_PAD_SLOTS.Z).toEqual({ degree: "VI", phrase: "riff" });
  });

  it("recognizes only the fifteen letter pads", () => {
    expect(isMidiPadKey("Q")).toBe(true);
    expect(isMidiPadKey("tab")).toBe(false);
    expect(isMidiPadKey("volumeUp")).toBe(false);
  });

  it("spreads chord tones over two octaves for arpeggios", () => {
    for (const degree of HARMONY_DEGREES) {
      const voicing = chordVoicing(degree);
      expect(voicing).toHaveLength(4);
      expect(chordTones(degree)).toEqual([...voicing, ...voicing.map((tone) => tone + 12)]);
    }
  });

  it("snaps riff downbeats onto a chord tone", () => {
    for (const degree of HARMONY_DEGREES) {
      const tones = new Set(chordVoicing(degree).flatMap((tone) => [tone - 12, tone, tone + 12]));
      for (let index = 0; index < 10; index += 1)
        expect(tones.has(snapToChordTone(scaleSemitone(index), degree))).toBe(true);
    }
  });

  it("produces stabs, single arpeggio notes and lead riffs", () => {
    const rig = MIDI_RIGS.find(({ name }) => name === "CLAV77");
    expect(rig).toBeDefined();
    if (!rig) throw new Error("CLAV77 test rig is missing");
    const stab = phraseAt({ degree: "i", phrase: "stab" }, rig, 0);
    expect(stab?.role).toBe("chord");
    expect(stab?.notes).toHaveLength(4);

    const arp = phraseAt({ degree: "i", phrase: "arp" }, rig, 0);
    expect(arp?.role).toBe("chord");
    expect(arp?.notes).toHaveLength(1);

    const riff = phraseAt({ degree: "i", phrase: "riff" }, rig, 0);
    expect(riff?.role).toBe("lead");
    expect(riff?.notes).toHaveLength(1);
  });

  it("unrolls a stab into one chord tone per step for spread", () => {
    const rig = MIDI_RIGS.find(({ name }) => name === "RHODES");
    if (!rig) throw new Error("RHODES test rig is missing");
    expect(rig.comp[2]).toBe("x");
    const voicing = chordVoicing("i");
    // The comp hit at step 2 fans out over steps 2..5, low tone first.
    for (let offset = 0; offset < voicing.length; offset += 1) {
      const event = phraseAt({ degree: "i", phrase: "spread" }, rig, 2 + offset);
      expect(event?.role).toBe("chord");
      expect(event?.notes).toEqual([voicing[offset] + rig.chordOctave]);
    }
    // Step 6 is the next comp hit, so the fan restarts rather than running dry.
    expect(phraseAt({ degree: "i", phrase: "spread" }, rig, 6)?.notes)
      .toEqual([voicing[0] + rig.chordOctave]);
  });

  it("holds a root pedal under moving upper tones", () => {
    const rig = MIDI_RIGS[0];
    const voicing = chordVoicing("IV");
    for (const step of [0, 4, 8, 12]) {
      expect(phraseAt({ degree: "IV", phrase: "pedal" }, rig, step)?.notes)
        .toEqual([voicing[0] + rig.chordOctave]);
    }
    for (const step of [1, 3, 5, 7]) {
      expect(phraseAt({ degree: "IV", phrase: "pedal" }, rig, step)).toBeUndefined();
    }
    const upper = phraseAt({ degree: "IV", phrase: "pedal" }, rig, 2)?.notes ?? [];
    expect(upper).toHaveLength(1);
    expect(upper[0]).toBeGreaterThan(voicing[0] + rig.chordOctave);
  });

  it("rests where the rig pattern is silent", () => {
    const rig = MIDI_RIGS[0];
    expect(phraseAt({ degree: "i", phrase: "stab" }, rig, 1)).toBeUndefined();
    expect(phraseAt({ degree: "i", phrase: "arp" }, rig, 1)).toBeUndefined();
    expect(phraseAt({ degree: "i", phrase: "riff" }, rig, 1)).toBeUndefined();
  });

  it("stays inside the rig chord and scale for every pad and step", () => {
    for (const rig of MIDI_RIGS) {
      for (const key of MIDI_PAD_KEYS) {
        const slot = MIDI_PAD_SLOTS[key];
        const allowed = slot.phrase === "riff"
          ? new Set([0, 2, 3, 5, 7, 8, 9, 10])
          : new Set(chordVoicing(slot.degree).map((tone) => ((tone % 12) + 12) % 12));
        for (let step = 0; step < 16; step += 1) {
          const event = phraseAt(slot, rig, step);
          for (const note of event?.notes ?? [])
            expect(allowed.has(((note % 12) + 12) % 12)).toBe(true);
        }
      }
    }
  });
});

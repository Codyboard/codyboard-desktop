import { describe, expect, it } from "vitest";

import {
  chordTones, chordVoicing, HARMONY_ROWS, isMidiPadKey, MIDI_PAD_KEYS, MIDI_PAD_SLOTS,
  padPosition, phraseAt, PHRASE_COLUMNS, scaleSemitone, snapToChordTone,
} from "./harmony";
import { MIDI_RIGS } from "./rigs";

describe("Get Funky harmony grid", () => {
  it("maps the pads to five degrees and three phrase engines", () => {
    expect(MIDI_PAD_KEYS).toHaveLength(15);
    expect(new Set(MIDI_PAD_KEYS)).toHaveLength(15);
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_SLOTS[key].degree)))
      .toEqual(new Set(HARMONY_ROWS));
    expect(new Set(MIDI_PAD_KEYS.map((key) => MIDI_PAD_SLOTS[key].phrase)))
      .toEqual(new Set(PHRASE_COLUMNS));
  });

  it("keeps rows harmonic and columns phrase-shaped", () => {
    expect(padPosition("T")).toEqual({ column: 0, row: 0 });
    expect(padPosition("Z")).toEqual({ column: 2, row: 4 });
    expect(MIDI_PAD_SLOTS.Q).toEqual({ degree: "i", phrase: "stab" });
    expect(MIDI_PAD_SLOTS.Z).toEqual({ degree: "i", phrase: "riff" });
  });

  it("recognizes only the fifteen letter pads", () => {
    expect(isMidiPadKey("Q")).toBe(true);
    expect(isMidiPadKey("tab")).toBe(false);
    expect(isMidiPadKey("volumeUp")).toBe(false);
  });

  it("spreads chord tones over two octaves for arpeggios", () => {
    for (const degree of HARMONY_ROWS) {
      const voicing = chordVoicing(degree);
      expect(voicing).toHaveLength(4);
      expect(chordTones(degree)).toEqual([...voicing, ...voicing.map((tone) => tone + 12)]);
    }
  });

  it("snaps riff downbeats onto a chord tone", () => {
    for (const degree of HARMONY_ROWS) {
      const tones = new Set(chordVoicing(degree).flatMap((tone) => [tone - 12, tone, tone + 12]));
      for (let index = 0; index < 10; index += 1)
        expect(tones.has(snapToChordTone(scaleSemitone(index), degree))).toBe(true);
    }
  });

  it("produces stabs, single arpeggio notes and lead riffs", () => {
    const rig = MIDI_RIGS[0];
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

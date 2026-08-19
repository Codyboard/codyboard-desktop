import { Eraser, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  SweepProKey,
  SweepProKeyPressEvent,
  SweepProMappingPreviews,
} from "../../components/devices/SweepPro";

import type { MidiAudioEngine, MidiEngineSnapshot } from "./audio-engine";
import {
  consumeShift,
  FX_LABELS,
  FX_ORDER,
  IDLE_SHIFT_LAYER,
  padAction,
  shiftActive,
  shiftDown,
  shiftUp,
  type ShiftLayerState,
} from "./controls";
import { chordLabel, isMidiPadKey, MIDI_PAD_KEYS, MIDI_PAD_SLOTS } from "./harmony";
import { DRUM_FAMILIES } from "./midi-templates";
import { MIDI_RIGS } from "./rigs";

const RESET_HOLD_SECONDS = 3;
const KEY_HIGHLIGHT_MS = 220;

export function useMidiPerformanceControls(
  engine?: MidiAudioEngine,
  snapshot?: MidiEngineSnapshot,
) {
  const [selectedKey, setSelectedKey] = useState<SweepProKey>();
  const [resetCountdown, setResetCountdown] = useState<number>();
  const [shifted, setShifted] = useState(false);
  const selectedKeyTimeout = useRef<number | undefined>(undefined);
  const shiftLayer = useRef<ShiftLayerState>(IDLE_SHIFT_LAYER);
  const resetHold = useRef<{ consumed: boolean; timer?: number }>({ consumed: false });

  const endResetHold = useCallback(() => {
    if (resetHold.current.timer !== undefined)
      window.clearInterval(resetHold.current.timer);
    resetHold.current.timer = undefined;
    setResetCountdown(undefined);
  }, []);

  const onKeyPress = useCallback((event: SweepProKeyPressEvent) => {
    if (!engine) return;
    const applyShift = (next: ShiftLayerState) => {
      shiftLayer.current = next;
      setShifted(shiftActive(next));
    };
    if (event.key === "tab" && event.phase === "up") {
      const { consumed } = resetHold.current;
      endResetHold();
      if (!consumed) engine.togglePlayback();
      return;
    }
    if (event.key === "leftShift") {
      applyShift(event.phase === "down" ? shiftDown(shiftLayer.current) : shiftUp(shiftLayer.current));
      if (event.phase === "up") return;
    }
    if (event.phase === "up") return;
    highlightKey(event.key, selectedKeyTimeout, setSelectedKey);
    if (event.key === "leftShift") return;

    if (isMidiPadKey(event.key)) {
      const action = padAction(event.key, shiftActive(shiftLayer.current));
      applyShift(consumeShift(shiftLayer.current));
      if (action.kind === "chord") engine.addChord(action.slot);
      else if (action.kind === "rig") engine.selectRig(action.index);
      else if (action.kind === "drumFamily") engine.selectDrumFamily(action.family);
      else engine.triggerFx(action.fx);
    } else if (event.key === "tab") {
      if (shiftActive(shiftLayer.current)) {
        applyShift(consumeShift(shiftLayer.current));
        resetHold.current.consumed = true;
        engine.clearHarmony();
      } else startResetHold(engine, resetHold, setResetCountdown, endResetHold);
    } else if (event.key === "mute") engine.toggleLayer();
    else if (event.key === "volumeDown") engine.turnKnob(-1);
    else if (event.key === "volumeUp") engine.turnKnob(1);
  }, [endResetHold, engine]);

  useEffect(() => {
    window.addEventListener("blur", endResetHold);
    return () => { window.removeEventListener("blur", endResetHold); endResetHold(); };
  }, [endResetHold]);
  useEffect(() => () => {
    if (selectedKeyTimeout.current !== undefined)
      window.clearTimeout(selectedKeyTimeout.current);
  }, []);

  const mappingPreviews = useMemo<SweepProMappingPreviews>(() => {
    const previews: SweepProMappingPreviews = {};
    MIDI_PAD_KEYS.forEach((key, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      const label = !shifted
        ? chordLabel(MIDI_PAD_SLOTS[key])
        : column === 0 ? MIDI_RIGS[row].name
          : column === 1 ? DRUM_FAMILIES[row] : FX_LABELS[FX_ORDER[row]];
      previews[key] = { compact: true, kind: "key", label };
    });
    previews.leftShift = { compact: true, kind: "key", label: shifted ? "SHIFT" : "FN" };
    previews.tab = resetCountdown !== undefined
      ? { compact: true, kind: "key", label: `RESET ${resetCountdown}` }
      : shifted ? { icon: Eraser, kind: "key", label: "Clear" }
        : { icon: snapshot?.playing ? Pause : Play, kind: "key", label: snapshot?.playing ? "Pause" : "Play" };
    previews.mute = { compact: true, kind: "key", label: snapshot?.activeLayer ?? "RIG" };
    return previews;
  }, [resetCountdown, shifted, snapshot?.activeLayer, snapshot?.playing]);

  const stepRig = useCallback((direction: -1 | 1) => {
    if (!engine || !snapshot) return;
    const current = MIDI_RIGS.findIndex(({ name }) => name === snapshot.rig);
    engine.selectRig((current < 0 ? 0 : current) + direction);
  }, [engine, snapshot]);

  return { mappingPreviews, onKeyPress, resetCountdown, selectedKey, shifted, stepRig };
}

function highlightKey(
  key: SweepProKey,
  timeout: { current?: number },
  setSelected: (key?: SweepProKey) => void,
): void {
  setSelected(key);
  if (timeout.current !== undefined) window.clearTimeout(timeout.current);
  timeout.current = window.setTimeout(() => setSelected(undefined), KEY_HIGHLIGHT_MS);
}

function startResetHold(
  engine: MidiAudioEngine,
  hold: { current: { consumed: boolean; timer?: number } },
  setCountdown: (seconds?: number) => void,
  end: () => void,
): void {
  hold.current.consumed = false;
  end();
  let remaining = RESET_HOLD_SECONDS;
  setCountdown(remaining);
  hold.current.timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) { setCountdown(remaining); return; }
    end();
    hold.current.consumed = true;
    engine.reset();
  }, 1_000);
}

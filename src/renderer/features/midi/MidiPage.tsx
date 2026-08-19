import { Eraser, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { findSupportedDevices } from "../../../shared/device-catalog";
import type { CodyboardPermission } from "../../../shared/hid";
import {
  SweepPro,
  type SweepProKey,
  type SweepProKeyPressEvent,
  type SweepProMappingPreviews,
} from "../../components/devices/SweepPro";

import { MidiAudioEngine, type MidiEngineSnapshot } from "./audio-engine";
import {
  consumeShift, FX_LABELS, FX_ORDER, IDLE_SHIFT_LAYER, padAction, shiftActive, shiftDown, shiftUp,
  type ShiftLayerState,
} from "./controls";
import { chordLabel, isMidiPadKey, MIDI_PAD_KEYS, MIDI_PAD_SLOTS } from "./harmony";
import { DRUM_FAMILIES } from "./midi-templates";
import { MidiHud } from "./MidiHud";
import { MidiVisualizer } from "./MidiVisualizer";
import { MIDI_RIGS } from "./rigs";

import "./midi.css";

const RESET_HOLD_SECONDS = 3;

export function MidiPage() {
  const [captureError, setCaptureError] = useState(false);
  const [engine, setEngine] = useState<MidiAudioEngine>();
  const [hardwareDeviceId, setHardwareDeviceId] = useState<string>();
  const [selectedKey, setSelectedKey] = useState<SweepProKey>();
  const [resetCountdown, setResetCountdown] = useState<number>();
  const [shifted, setShifted] = useState(false);
  const [snapshot, setSnapshot] = useState<MidiEngineSnapshot>();
  const selectedKeyTimeout = useRef<number | undefined>(undefined);
  const shiftLayer = useRef<ShiftLayerState>(IDLE_SHIFT_LAYER);
  const resetHold = useRef<{ consumed: boolean; timer?: number }>({ consumed: false });

  useEffect(() => {
    const nextEngine = new MidiAudioEngine();
    setEngine(nextEngine);
    const unsubscribe = nextEngine.onState(setSnapshot);
    // The loop keeps running while minimized or backgrounded; closing the window unmounts this page.
    return () => {
      unsubscribe();
      nextEngine.dispose();
    };
  }, []);

  useEffect(() => {
    const captureOwnerId = crypto.randomUUID();
    let capturedDeviceId: string | undefined;
    let disposed = false;
    let scanning = false;
    const scan = async () => {
      if (scanning || disposed) return;
      scanning = true;
      try {
        const supported = findSupportedDevices(await window.codyboard.listHIDs());
        const sweep = supported.find((device) => device.model === "sweep-pro");
        const nextCaptureDeviceId = sweep?.profileDomain;
        if (nextCaptureDeviceId === capturedDeviceId) return;
        if (capturedDeviceId)
          await window.codyboard.midi.setExclusiveDevice(undefined, captureOwnerId);
        capturedDeviceId = undefined;
        setHardwareDeviceId(undefined);
        if (nextCaptureDeviceId && sweep) {
          try {
            await window.codyboard.midi.setExclusiveDevice(nextCaptureDeviceId, captureOwnerId);
            if (disposed) {
              await window.codyboard.midi.setExclusiveDevice(undefined, captureOwnerId);
              return;
            }
            capturedDeviceId = nextCaptureDeviceId;
            setHardwareDeviceId(sweep.profileDomain);
            setCaptureError(false);
          } catch {
            setCaptureError(true);
          }
        } else {
          setCaptureError(false);
        }
      } catch {
        // Virtual mode remains available when device enumeration fails.
      } finally {
        scanning = false;
      }
    };
    void scan();
    // Only rescans for hotplug; leaving the page is the one thing that releases the keyboard.
    const interval = window.setInterval(() => void scan(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      void window.codyboard.midi.setExclusiveDevice(undefined, captureOwnerId);
    };
  }, []);

  const endResetHold = useCallback(() => {
    if (resetHold.current.timer !== undefined) window.clearInterval(resetHold.current.timer);
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

    setSelectedKey(event.key);
    if (selectedKeyTimeout.current !== undefined) window.clearTimeout(selectedKeyTimeout.current);
    selectedKeyTimeout.current = window.setTimeout(() => setSelectedKey(undefined), 220);
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
      } else {
        // Holding transport is the full reset; a short press falls through to play/pause on key-up.
        resetHold.current.consumed = false;
        endResetHold();
        let remaining = RESET_HOLD_SECONDS;
        setResetCountdown(remaining);
        resetHold.current.timer = window.setInterval(() => {
          remaining -= 1;
          if (remaining > 0) {
            setResetCountdown(remaining);
            return;
          }
          endResetHold();
          resetHold.current.consumed = true;
          engine.reset();
        }, 1_000);
      }
    } else if (event.key === "mute") engine.toggleLayer();
    else if (event.key === "volumeDown") engine.turnKnob(-1);
    else if (event.key === "volumeUp") engine.turnKnob(1);
  }, [endResetHold, engine]);

  useEffect(() => {
    const cancel = () => endResetHold();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [endResetHold]);

  useEffect(() => () => {
    if (selectedKeyTimeout.current !== undefined) window.clearTimeout(selectedKeyTimeout.current);
  }, []);

  const mappingPreviews = useMemo<SweepProMappingPreviews>(() => {
    const previews: SweepProMappingPreviews = {};
    MIDI_PAD_KEYS.forEach((key, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      const label = !shifted
        ? chordLabel(MIDI_PAD_SLOTS[key])
        : column === 0
          ? MIDI_RIGS[row].name
          : column === 1 ? DRUM_FAMILIES[row] : FX_LABELS[FX_ORDER[row]];
      previews[key] = { compact: true, kind: "key", label };
    });
    previews.leftShift = { compact: true, kind: "key", label: shifted ? "SHIFT" : "FN" };
    previews.tab = resetCountdown !== undefined
      ? { compact: true, kind: "key", label: `RESET ${resetCountdown}` }
      : shifted
        ? { icon: Eraser, kind: "key", label: "Clear" }
        : {
          icon: snapshot?.playing ? Pause : Play,
          kind: "key",
          label: snapshot?.playing ? "Pause" : "Play",
        };
    previews.mute = { compact: true, kind: "key", label: snapshot?.activeLayer ?? "RIG" };
    return previews;
  }, [resetCountdown, shifted, snapshot?.activeLayer, snapshot?.playing]);

  const openPermission = (permission: CodyboardPermission) => {
    void window.codyboard.permissions.openSettings(permission);
  };

  const stepRig = useCallback((direction: -1 | 1) => {
    if (!engine || !snapshot) return;
    const current = MIDI_RIGS.findIndex(({ name }) => name === snapshot.rig);
    engine.selectRig((current < 0 ? 0 : current) + direction);
  }, [engine, snapshot]);

  const beat = Math.floor((snapshot?.step ?? 0) / 4);
  const pageStyle = {
    "--midi-quarter": `${60 / (snapshot?.bpm ?? 104)}s`,
  } as CSSProperties;

  return (
    <main className="midi-page" style={pageStyle}>
      <div className="midi-window-drag" />
      {snapshot?.playing && (
        <div
          key={`${beat}-${snapshot.bpm}`}
          aria-hidden="true"
          className={`midi-beat-wash is-beat-${beat % 4}`}
        />
      )}
      <section
        className={`midi-device-column ${shifted ? "is-shifted" : ""}`.trim()}
        aria-label="Sweep Pro instrument"
      >
        <div
          className="midi-device-float"
          style={{
            "--midi-beat": `${60 / (snapshot?.bpm ?? 104)}s`,
            "--midi-transport": snapshot?.playing ? "running" : "paused",
          } as CSSProperties}
        >
          <SweepPro
            ariaLabel="Get Funky Sweep Pro"
            deviceId={hardwareDeviceId ?? "virtual-sweep-pro"}
            listenToHardware={Boolean(hardwareDeviceId)}
            mappingPreviews={mappingPreviews}
            onKeyPress={onKeyPress}
            selectedKey={selectedKey}
          />
        </div>
      </section>

      <section className="midi-loop-column">
        {engine && <MidiVisualizer engine={engine} />}
        {snapshot && (
          <MidiHud
            hardwareMode={Boolean(hardwareDeviceId)}
            onRemoveChord={(index) => engine?.removeChord(index)}
            onStepRig={stepRig}
            resetCountdown={resetCountdown}
            shifted={shifted}
            snapshot={snapshot}
          />
        )}
      </section>

      {captureError && (
        <aside className="midi-permission-notice">
          <span>Sweep Pro found · permissions needed for hardware control</span>
          <button onClick={() => openPermission("accessibility")} type="button">Accessibility</button>
          <button onClick={() => openPermission("inputMonitoring")} type="button">Input Monitoring</button>
        </aside>
      )}
    </main>
  );
}

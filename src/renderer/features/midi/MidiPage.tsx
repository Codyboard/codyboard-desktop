import { Eraser, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { findSupportedDevices } from "../../../shared/device-catalog";
import type { CodyboardPermission } from "../../../shared/hid";
import {
  SweepPro,
  type SweepProKey,
  type SweepProKeyPressEvent,
  type SweepProMappingPreviews,
} from "../../components/devices/SweepPro";

import { MidiAudioEngine, type MidiEngineSnapshot } from "./audio-engine";
import { chordLabel, isMidiPadKey, MIDI_PAD_CHOICES, MIDI_PAD_KEYS } from "./harmony";
import { MidiHud } from "./MidiHud";
import { MidiVisualizer } from "./MidiVisualizer";

import "./midi.css";

export function MidiPage() {
  const [captureError, setCaptureError] = useState(false);
  const [engine, setEngine] = useState<MidiAudioEngine>();
  const [hardwareDeviceId, setHardwareDeviceId] = useState<string>();
  const [selectedKey, setSelectedKey] = useState<SweepProKey>();
  const [snapshot, setSnapshot] = useState<MidiEngineSnapshot>();
  const selectedKeyTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    const nextEngine = new MidiAudioEngine();
    setEngine(nextEngine);
    const unsubscribe = nextEngine.onState(setSnapshot);
    const onVisibilityChange = () => nextEngine.setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribe();
      nextEngine.dispose();
    };
  }, []);

  useEffect(() => {
    let capturedDeviceId: string | undefined;
    let disposed = false;
    let scanning = false;
    const scan = async () => {
      if (scanning || disposed) return;
      scanning = true;
      try {
        if (document.hidden) {
          if (capturedDeviceId) await window.codyboard.midi.setExclusiveDevice();
          capturedDeviceId = undefined;
          setHardwareDeviceId(undefined);
          return;
        }
        const supported = findSupportedDevices(await window.codyboard.listHIDs());
        const sweep = supported.find((device) => device.model === "sweep-pro");
        const nextDeviceId = sweep?.profileDomain;
        if (nextDeviceId === capturedDeviceId) return;
        if (capturedDeviceId) await window.codyboard.midi.setExclusiveDevice();
        capturedDeviceId = undefined;
        setHardwareDeviceId(undefined);
        if (nextDeviceId) {
          try {
            const permissions = await window.codyboard.permissions.status();
            if (!permissions.accessibility || !permissions.inputMonitoring)
              throw new Error("Hardware permissions are required");
            await window.codyboard.midi.setExclusiveDevice(nextDeviceId);
            if (disposed) {
              await window.codyboard.midi.setExclusiveDevice();
              return;
            }
            capturedDeviceId = nextDeviceId;
            setHardwareDeviceId(nextDeviceId);
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
    const interval = window.setInterval(() => void scan(), 2_000);
    const onVisibilityChange = () => void scan();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void window.codyboard.midi.setExclusiveDevice();
    };
  }, []);

  const onKeyPress = useCallback((event: SweepProKeyPressEvent) => {
    if (!engine) return;
    if (event.phase === "up") return;
    setSelectedKey(event.key);
    if (selectedKeyTimeout.current !== undefined) window.clearTimeout(selectedKeyTimeout.current);
    selectedKeyTimeout.current = window.setTimeout(() => setSelectedKey(undefined), 220);
    if (isMidiPadKey(event.key)) engine.addChord(MIDI_PAD_CHOICES[event.key]);
    else if (event.key === "tab") engine.togglePlayback();
    else if (event.key === "leftShift") engine.clearHarmony();
    else if (event.key === "mute") engine.toggleLayer();
    else if (event.key === "volumeDown") engine.turnKnob(-1);
    else if (event.key === "volumeUp") engine.turnKnob(1);
  }, [engine]);

  useEffect(() => () => {
    if (selectedKeyTimeout.current !== undefined) window.clearTimeout(selectedKeyTimeout.current);
  }, []);

  const mappingPreviews = useMemo<SweepProMappingPreviews>(() => {
    const previews: SweepProMappingPreviews = {};
    for (const key of MIDI_PAD_KEYS)
      previews[key] = { compact: true, kind: "key", label: chordLabel(MIDI_PAD_CHOICES[key]) };
    previews.leftShift = { icon: Eraser, kind: "key", label: "Clear" };
    previews.tab = { icon: snapshot?.playing ? Pause : Play, kind: "key", label: snapshot?.playing ? "Pause" : "Play" };
    previews.mute = { compact: true, kind: "key", label: snapshot?.activeLayer ?? "DRUM" };
    return previews;
  }, [snapshot?.activeLayer, snapshot?.playing]);

  const openPermission = (permission: CodyboardPermission) => {
    void window.codyboard.permissions.openSettings(permission);
  };

  return (
    <main className="midi-page">
      <div className="midi-window-drag" />
      <section className="midi-device-column" aria-label="Sweep Pro instrument">
        <div className="midi-device-float">
          <SweepPro
            ariaLabel="Get Funky Sweep Pro"
            deviceId={hardwareDeviceId ?? "virtual-sweep-pro"}
            listenToHardware={Boolean(hardwareDeviceId)}
            mappingPreviews={mappingPreviews}
            onKeyPress={onKeyPress}
            selectedKey={selectedKey}
          />
        </div>
        <p className="midi-device-mode">{hardwareDeviceId ? "HARDWARE LINKED" : "VIRTUAL INSTRUMENT"}</p>
      </section>

      <section className="midi-loop-column">
        {engine && <MidiVisualizer engine={engine} />}
        {snapshot && <MidiHud hardwareMode={Boolean(hardwareDeviceId)} snapshot={snapshot} />}
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

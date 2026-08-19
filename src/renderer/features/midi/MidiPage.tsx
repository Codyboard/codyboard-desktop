import type { CSSProperties } from "react";

import type { CodyboardPermission } from "../../../shared/hid";
import { SweepPro } from "../../components/devices/SweepPro";

import { MidiHud } from "./MidiHud";
import { MidiVisualizer } from "./MidiVisualizer";
import { useMidiEngine } from "./use-midi-engine";
import { useMidiHardware } from "./use-midi-hardware";
import { useMidiPerformanceControls } from "./use-midi-performance-controls";

import "./midi.css";

export function MidiPage() {
  const { engine, snapshot } = useMidiEngine();
  const { captureError, hardwareDeviceId } = useMidiHardware();
  const controls = useMidiPerformanceControls(engine, snapshot);
  const beat = Math.floor((snapshot?.step ?? 0) / 4);
  const quarter = `${60 / (snapshot?.bpm ?? 104)}s`;

  return (
    <main className="midi-page" style={{ "--midi-quarter": quarter } as CSSProperties}>
      <div className="midi-window-drag" />
      {snapshot?.playing && (
        <div aria-hidden="true" className={`midi-beat-wash is-beat-${beat % 4}`} key={`${beat}-${snapshot.bpm}`} />
      )}
      <section aria-label="Sweep Pro instrument"
        className={`midi-device-column ${controls.shifted ? "is-shifted" : ""}`.trim()}>
        <div className="midi-device-float" style={{
          "--midi-beat": quarter,
          "--midi-transport": snapshot?.playing ? "running" : "paused",
        } as CSSProperties}>
          <SweepPro ariaLabel="Get Funky Sweep Pro"
            deviceId={hardwareDeviceId ?? "virtual-sweep-pro"}
            listenToHardware={Boolean(hardwareDeviceId)}
            mappingPreviews={controls.mappingPreviews}
            onKeyPress={controls.onKeyPress}
            selectedKey={controls.selectedKey} />
        </div>
      </section>
      <section className="midi-loop-column">
        {engine && <MidiVisualizer engine={engine} />}
        {snapshot && <MidiHud hardwareMode={Boolean(hardwareDeviceId)}
          onRemoveChord={(index) => engine?.removeChord(index)}
          onStepRig={controls.stepRig} resetCountdown={controls.resetCountdown}
          shifted={controls.shifted} snapshot={snapshot} />}
      </section>
      {captureError && <PermissionNotice />}
    </main>
  );
}

function PermissionNotice() {
  const open = (permission: CodyboardPermission) => {
    void window.codyboard.permissions.openSettings(permission);
  };
  return <aside className="midi-permission-notice">
    <span>Sweep Pro found · permissions needed for hardware control</span>
    <button onClick={() => open("accessibility")} type="button">Accessibility</button>
    <button onClick={() => open("inputMonitoring")} type="button">Input Monitoring</button>
  </aside>;
}

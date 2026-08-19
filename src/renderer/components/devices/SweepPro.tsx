import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";

import {
  acceptKnobPulse,
  changedSweepProKeys,
  IDLE_KNOB_PULSE_GUARD,
  sweepProKeyForDiagnostic,
  sweepProKnobDelta,
  SWEEP_PRO_LETTER_KEYS,
  type DeviceMappingPreview,
  type KnobPulseGuard,
  type SweepProKey,
  type SweepProKeyPressEvent,
  type SweepProMappingPreviews,
} from "./sweep-pro-input";

export {
  acceptKnobPulse,
  IDLE_KNOB_PULSE_GUARD,
  KNOB_REVERSAL_MS,
  sweepProKeyForDiagnostic,
  sweepProKnobDelta,
} from "./sweep-pro-input";
export type {
  DeviceMappingPreview,
  KnobPulseGuard,
  SweepProKey,
  SweepProKeyPressEvent,
  SweepProMappingPreviews,
} from "./sweep-pro-input";

export interface SweepProProps {
  ariaLabel?: string;
  deviceId: string;
  listenToHardware?: boolean;
  mappingPreviews?: SweepProMappingPreviews;
  onKeyPress?: (event: SweepProKeyPressEvent) => void;
  selectedKey?: SweepProKey;
}

export function SweepPro({
  ariaLabel = "Sweep Pro macropad",
  deviceId,
  listenToHardware = true,
  mappingPreviews,
  onKeyPress,
  selectedKey,
}: SweepProProps) {
  const [hardwarePressed, setHardwarePressed] = useState<ReadonlySet<SweepProKey>>(new Set());
  const hardwarePressedRef = useRef<ReadonlySet<SweepProKey>>(new Set());
  const [knobRotation, setKnobRotation] = useState(0);
  const knobGuard = useRef<KnobPulseGuard>(IDLE_KNOB_PULSE_GUARD);
  const bouncedKnobKeys = useRef<Set<SweepProKey>>(new Set());
  const [pointerPressed, setPointerPressed] = useState<ReadonlySet<SweepProKey>>(new Set());

  useEffect(() => {
    if (!listenToHardware) return;

    const update = (key: SweepProKey | undefined, phase: "down" | "up", source: "hardware") => {
      if (!key) return;
      const rotation = sweepProKnobDelta(key);
      if (rotation !== 0) {
        if (phase === "up") {
          if (bouncedKnobKeys.current.delete(key)) return;
        } else {
          const pulse = acceptKnobPulse(knobGuard.current, Math.sign(rotation), performance.now());
          if (!pulse.accepted) {
            bouncedKnobKeys.current.add(key);
            return;
          }
          knobGuard.current = pulse.guard;
        }
      }
      const isPressed = phase === "down";
      if (hardwarePressedRef.current.has(key) === isPressed) return;
      const next = changedSweepProKeys(hardwarePressedRef.current, key, isPressed);
      hardwarePressedRef.current = next;
      setHardwarePressed(next);
      if (phase === "down") setKnobRotation((current) => current + sweepProKnobDelta(key));
      onKeyPress?.({ key, phase, source });
    };
    const clearPressed = () => {
      hardwarePressedRef.current = new Set();
      bouncedKnobKeys.current = new Set();
      knobGuard.current = IDLE_KNOB_PULSE_GUARD;
      setHardwarePressed(new Set());
    };
    const unsubscribeDiagnostics = window.codyboard?.diagnostics?.onKey((event) => {
      const key = sweepProKeyForDiagnostic(event, deviceId);
      const phase = event.eventType === "keyup" ? "up" : "down";
      update(key, phase, "hardware");
    });

    // No blur reset: exclusive capture keeps delivering key-ups while another app is frontmost,
    // and clearing here would swallow the release of anything held across the focus change.
    return () => {
      clearPressed();
      unsubscribeDiagnostics?.();
    };
  }, [deviceId, listenToHardware, onKeyPress]);

  const pressed = useMemo(
    () => new Set<SweepProKey>([...hardwarePressed, ...pointerPressed]),
    [hardwarePressed, pointerPressed]
  );

  const pointer = (key: SweepProKey, phase: "down" | "up") => {
    setPointerPressed((current) => changedSweepProKeys(current, key, phase === "down"));
    onKeyPress?.({ key, phase, source: "pointer" });
  };
  const knobSelected = selectedKey === "mute" || selectedKey === "volumeDown" || selectedKey === "volumeUp";
  const knobPressed = pressed.has("mute") || pressed.has("volumeDown") || pressed.has("volumeUp");
  const turnKnob = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const key = event.deltaY < 0 ? "volumeUp" : "volumeDown";
    pointer(key, "down");
    pointer(key, "up");
  };

  return (
    <>
      <div className="sweep-pro-shadow" aria-hidden="true" />
      <section className="sweep-pro" aria-label={ariaLabel}>
        <div className="sweep-pro-chassis" aria-hidden="true" />
        <div className="sweep-pro-display" aria-label="Display" />

        <div className="sweep-pro-keybed" aria-label="Macro keys">
          {SWEEP_PRO_LETTER_KEYS.map((key) => (
            <button
              type="button"
              aria-label={`${key} key`}
              className={`${pressed.has(key) ? "is-pressed" : ""} ${selectedKey === key ? "is-selected" : ""}`.trim()}
              key={key}
              onPointerCancel={() => pointer(key, "up")}
              onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pointer(key, "down");
              }}
              onPointerUp={() => pointer(key, "up")}
            >
              <MappingPreview preview={mappingPreviews?.[key]} />
            </button>
          ))}
        </div>

        <div className="sweep-pro-side-controls">
          <button
            type="button"
            aria-label="Left Shift key"
            className={`sweep-pro-corner-key ${pressed.has("leftShift") ? "is-pressed" : ""} ${selectedKey === "leftShift" ? "is-selected" : ""}`.trim()}
            onPointerCancel={() => pointer("leftShift", "up")}
            onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer("leftShift", "down");
            }}
            onPointerUp={() => pointer("leftShift", "up")}
          >
            <MappingPreview className="sweep-pro-side-key-legend" preview={mappingPreviews?.leftShift} />
          </button>
          <button
            type="button"
            aria-label="Tab key"
            className={`sweep-pro-side-key ${pressed.has("tab") ? "is-pressed" : ""} ${selectedKey === "tab" ? "is-selected" : ""}`.trim()}
            onPointerCancel={() => pointer("tab", "up")}
            onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer("tab", "down");
            }}
            onPointerUp={() => pointer("tab", "up")}
          >
            <MappingPreview className="sweep-pro-side-key-legend" preview={mappingPreviews?.tab} />
          </button>
          <button
            type="button"
            aria-label="Volume control: press to mute, scroll to adjust volume"
            className={`sweep-pro-knob ${knobPressed ? "is-pressed" : ""} ${knobSelected ? "is-selected" : ""}`.trim()}
            onPointerCancel={() => pointer("mute", "up")}
            onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer("mute", "down");
            }}
            onPointerUp={() => pointer("mute", "up")}
            onWheel={turnKnob}
          >
            <span
              className="sweep-pro-knob-mark"
              aria-hidden="true"
              style={{ "--sweep-pro-knob-rotation": `${knobRotation}deg` } as CSSProperties}
            />
            <MappingPreview className="sweep-pro-knob-legend" preview={mappingPreviews?.mute} />
          </button>
        </div>
      </section>
    </>
  );
}

function MappingPreview({
  className = "sweep-pro-key-legend",
  preview,
}: {
  className?: string;
  preview?: DeviceMappingPreview;
}) {
  if (!preview) return null;
  const Icon = preview.kind === "key" ? preview.icon : undefined;
  return (
    <span
      aria-hidden="true"
      className={`${className} ${preview.kind === "application" ? "is-application" : ""} ${preview.kind === "key" && preview.compact ? "is-compact" : ""}`.trim()}
      title={preview.label}
    >
      {preview.kind === "application" && preview.iconDataUrl
        ? <img alt="" src={preview.iconDataUrl} />
        : Icon
          ? <Icon />
        : <span>{preview.label}</span>}
    </span>
  );
}

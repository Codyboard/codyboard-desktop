import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

const letterKeys = [
  "T", "G", "B",
  "R", "F", "V",
  "E", "D", "C",
  "W", "S", "X",
  "Q", "A", "Z",
] as const;

export type SweepProKey = typeof letterKeys[number]
  | "leftShift" | "mute" | "tab" | "volumeDown" | "volumeUp";

export type DeviceMappingPreview =
  | { bundleId: string; iconDataUrl?: string; kind: "application"; label: string }
  | { compact?: boolean; icon?: LucideIcon; kind: "key"; label: string };

export type SweepProMappingPreviews = Partial<Record<SweepProKey, DeviceMappingPreview>>;

export interface KnobPulseGuard {
  direction: number;
  time: number;
}

export const IDLE_KNOB_PULSE_GUARD: KnobPulseGuard = {
  direction: 0,
  time: Number.NEGATIVE_INFINITY,
};

/**
 * Releasing a turn makes the encoder emit one stray pulse the other way, landing well after the
 * last real detent, so this window has to outlast the release rather than a single contact bounce.
 * A reversal sooner than this after an accepted pulse is that stray, never a deliberate turn.
 */
export const KNOB_REVERSAL_MS = 250;

export interface SweepProKeyPressEvent {
  key: SweepProKey;
  phase: "down" | "up";
  source: "hardware" | "pointer";
}

export interface SweepProProps {
  ariaLabel?: string;
  deviceId: string;
  listenToHardware?: boolean;
  mappingPreviews?: SweepProMappingPreviews;
  onKeyPress?: (event: SweepProKeyPressEvent) => void;
  selectedKey?: SweepProKey;
}

const keyCodeToKey: Readonly<Record<number, SweepProKey>> = {
  0: "A", 1: "S", 2: "D", 3: "F", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
  11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 17: "T", 48: "tab", 56: "leftShift",
};
const consumerUsageToKey: Readonly<Record<number, SweepProKey>> = {
  0xe2: "mute",
  0xe9: "volumeUp",
  0xea: "volumeDown",
};

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
      const next = changedSet(hardwarePressedRef.current, key, isPressed);
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
    setPointerPressed((current) => changedSet(current, key, phase === "down"));
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
          {letterKeys.map((key) => (
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

export function sweepProKeyForDiagnostic(
  event: HIDDiagnosticEvent,
  deviceId: string,
): SweepProKey | undefined {
  if (event.deviceId !== deviceId) return undefined;
  return event.source === "keyCode" ? keyCodeToKey[event.code] : consumerUsageToKey[event.code];
}

export function acceptKnobPulse(
  guard: KnobPulseGuard,
  direction: number,
  now: number,
): { accepted: boolean; guard: KnobPulseGuard } {
  const reversed = guard.direction !== 0 && guard.direction !== direction;
  if (reversed && now - guard.time < KNOB_REVERSAL_MS) return { accepted: false, guard };
  return { accepted: true, guard: { direction, time: now } };
}

export function sweepProKnobDelta(key: SweepProKey): number {
  if (key === "volumeUp") return 12;
  if (key === "volumeDown") return -12;
  return 0;
}

function changedSet(current: ReadonlySet<SweepProKey>, key: SweepProKey, isPressed: boolean) {
  const next = new Set(current);
  if (isPressed) next.add(key);
  else next.delete(key);
  return next;
}

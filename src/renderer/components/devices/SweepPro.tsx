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
  const [pointerPressed, setPointerPressed] = useState<ReadonlySet<SweepProKey>>(new Set());

  useEffect(() => {
    if (!listenToHardware) return;

    const update = (key: SweepProKey | undefined, phase: "down" | "up", source: "hardware") => {
      if (!key) return;
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
      setHardwarePressed(new Set());
    };
    const unsubscribeDiagnostics = window.codyboard?.diagnostics?.onKey((event) => {
      const key = sweepProKeyForDiagnostic(event, deviceId);
      const phase = event.eventType === "keyup" ? "up" : "down";
      update(key, phase, "hardware");
    });

    window.addEventListener("blur", clearPressed);
    return () => {
      clearPressed();
      window.removeEventListener("blur", clearPressed);
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

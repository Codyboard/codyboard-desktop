import { useEffect, useMemo, useState, type PointerEvent } from "react";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

const letterKeys = [
  "T", "G", "B",
  "R", "F", "V",
  "E", "D", "C",
  "W", "S", "X",
  "Q", "A", "Z",
] as const;

export type SweepProKey = typeof letterKeys[number] | "leftShift" | "tab";

export interface SweepProKeyPressEvent {
  key: SweepProKey;
  phase: "down" | "up";
  source: "hardware" | "pointer";
}

export interface SweepProProps {
  ariaLabel?: string;
  listenToHardware?: boolean;
  onKeyPress?: (event: SweepProKeyPressEvent) => void;
  selectedKey?: SweepProKey;
}

const keySet = new Set<string>(letterKeys);
const keyCodeToKey: Readonly<Record<number, SweepProKey>> = {
  0: "A", 1: "S", 2: "D", 3: "F", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
  11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 17: "T", 48: "tab", 56: "leftShift",
};

export function SweepPro({
  ariaLabel = "Sweep Pro macropad",
  listenToHardware = true,
  onKeyPress,
  selectedKey,
}: SweepProProps) {
  const [hardwarePressed, setHardwarePressed] = useState<ReadonlySet<SweepProKey>>(new Set());
  const [pointerPressed, setPointerPressed] = useState<ReadonlySet<SweepProKey>>(new Set());

  useEffect(() => {
    if (!listenToHardware) return;

    const update = (key: SweepProKey | undefined, phase: "down" | "up", source: "hardware") => {
      if (!key) return;
      setHardwarePressed((current) => changedSet(current, key, phase === "down"));
      onKeyPress?.({ key, phase, source });
    };
    const onKeyDown = (event: KeyboardEvent) => update(sweepProKeyFor(event), "down", "hardware");
    const onKeyUp = (event: KeyboardEvent) => update(sweepProKeyFor(event), "up", "hardware");
    const clearPressed = () => setHardwarePressed(new Set());
    const unsubscribeDiagnostics = window.codyboard?.diagnostics?.onKey((event) => {
      const key = sweepProKeyForDiagnostic(event);
      const phase = event.eventType === "keyup" ? "up" : "down";
      update(key, phase, "hardware");
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPressed);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPressed);
      unsubscribeDiagnostics?.();
    };
  }, [listenToHardware, onKeyPress]);

  const pressed = useMemo(
    () => new Set<SweepProKey>([...hardwarePressed, ...pointerPressed]),
    [hardwarePressed, pointerPressed]
  );

  const pointer = (key: SweepProKey, phase: "down" | "up") => {
    setPointerPressed((current) => changedSet(current, key, phase === "down"));
    onKeyPress?.({ key, phase, source: "pointer" });
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
              <span className="sweep-pro-key-legend" aria-hidden="true">{key}</span>
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
            <span className="sweep-pro-side-key-legend" aria-hidden="true">⇧</span>
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
            <span className="sweep-pro-side-key-legend" aria-hidden="true">⇥</span>
          </button>
          <button type="button" className="sweep-pro-knob" aria-label="Rotary knob" />
        </div>
      </section>
    </>
  );
}

function sweepProKeyFor(event: KeyboardEvent): SweepProKey | undefined {
  if (event.code === "ShiftLeft") return "leftShift";
  if (event.key === "Tab") return "tab";
  const key = event.key.toUpperCase();
  return keySet.has(key) ? key as SweepProKey : undefined;
}

function sweepProKeyForDiagnostic(event: HIDDiagnosticEvent): SweepProKey | undefined {
  return event.deviceId !== undefined && event.source === "keyCode"
    ? keyCodeToKey[event.code]
    : undefined;
}

function changedSet(current: ReadonlySet<SweepProKey>, key: SweepProKey, isPressed: boolean) {
  const next = new Set(current);
  if (isPressed) next.add(key);
  else next.delete(key);
  return next;
}

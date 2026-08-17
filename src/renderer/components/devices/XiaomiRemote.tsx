import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Home, Menu, Mic, Minus, Plus, Power } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent } from "react";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

export type XiaomiRemoteKey =
  | "power" | "voice" | "up" | "down" | "left" | "right" | "enter"
  | "back" | "volumeUp" | "volumeDown" | "home" | "menu" | "tv";

export interface XiaomiRemoteKeyPressEvent {
  key: XiaomiRemoteKey;
  phase: "down" | "up";
  source: "hardware" | "pointer";
  code?: number;
  codeType?: "keyCode" | "hidUsage";
}

export interface XiaomiRemoteProps {
  ariaLabel?: string;
  listenToHardware?: boolean;
  onKeyPress?: (event: XiaomiRemoteKeyPressEvent) => void;
  selectedKey?: XiaomiRemoteKey;
}

const usageToKey: Readonly<Record<number, XiaomiRemoteKey>> = {
  0x66: "power",
  0x52: "up",
  0x50: "left",
  0x28: "enter",
  0x4f: "right",
  0x51: "down",
  0xf1: "back",
  0x80: "volumeUp",
  0x4a: "home",
  0x81: "volumeDown",
  0x65: "menu",
  0x35: "tv",
  0x3e: "voice"
};

const keyCodeToKey: Readonly<Record<number, XiaomiRemoteKey>> = {
  90: "power", 96: "voice", 126: "up", 123: "left", 36: "enter",
  124: "right", 125: "down", 115: "home", 110: "menu", 50: "tv"
};

export function XiaomiRemote({
  ariaLabel = "Xiaomi remote, keyboard type 40",
  listenToHardware = true,
  onKeyPress,
  selectedKey,
}: XiaomiRemoteProps) {
  const [hardwarePressed, setHardwarePressed] = useState<ReadonlySet<XiaomiRemoteKey>>(new Set());
  const [pointerPressed, setPointerPressed] = useState<ReadonlySet<XiaomiRemoteKey>>(new Set());

  useEffect(() => {
    if (!listenToHardware || !window.codyboard?.diagnostics) return;
    return window.codyboard.diagnostics.onKey((event) => {
      const key = keyForDiagnostic(event);
      if (!key) return;
      const phase = event.eventType === "keyup" ? "up" : "down";
      setHardwarePressed((current) => changedSet(current, key, phase === "down"));
      onKeyPress?.({ key, phase, source: "hardware", code: event.code, codeType: event.source });
    });
  }, [listenToHardware, onKeyPress]);

  const pressed = useMemo(
    () => new Set<XiaomiRemoteKey>([...hardwarePressed, ...pointerPressed]),
    [hardwarePressed, pointerPressed]
  );

  const pointer = (key: XiaomiRemoteKey, phase: "down" | "up") => {
    setPointerPressed((current) => changedSet(current, key, phase === "down"));
    onKeyPress?.({ key, phase, source: "pointer" });
  };

  const interaction = (key: XiaomiRemoteKey, className = "") => ({
    className: `${className} ${pressed.has(key) ? "is-pressed" : ""} ${selectedKey === key ? "is-selected" : ""}`.trim(),
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer(key, "down");
    },
    onPointerUp: () => pointer(key, "up"),
    onPointerCancel: () => pointer(key, "up")
  });

  return (
    <>
      <div className="remote-shadow" aria-hidden="true" />
      <section className="mi-remote" aria-label={ariaLabel}>
        <div className="remote-top-actions">
          <button type="button" {...interaction("power")} aria-label="Power"><Power /></button>
          <button type="button" {...interaction("voice")} aria-label="Voice input"><Mic /></button>
        </div>

        <div className="direction-pad" aria-label="Directional controls">
          <button type="button" {...interaction("up", "direction up")} aria-label="Up"><ChevronUp /></button>
          <button type="button" {...interaction("right", "direction right")} aria-label="Right"><ChevronRight /></button>
          <button type="button" {...interaction("down", "direction down")} aria-label="Down"><ChevronDown /></button>
          <button type="button" {...interaction("left", "direction left")} aria-label="Left"><ChevronLeft /></button>
          <button type="button" {...interaction("enter", "enter-button")} aria-label="Enter"><span className="sr-only">Enter</span></button>
        </div>

        <div className="lower-controls">
          <button type="button" {...interaction("back", "round-button back-button")} aria-label="Back"><ChevronLeft /></button>
          <div className="volume-rocker" aria-label="Volume">
            <button type="button" {...interaction("volumeUp")} aria-label="Volume up"><Plus /></button>
            <button type="button" {...interaction("volumeDown")} aria-label="Volume down"><Minus /></button>
          </div>
          <button type="button" {...interaction("home", "round-button home-button")} aria-label="Home"><Home /></button>
          <button type="button" {...interaction("menu", "round-button menu-button")} aria-label="Menu"><Menu /></button>
          <button type="button" {...interaction("tv", "round-button tv-button")} aria-label="TV">
            <span className="tv-glyph"><i /><i /></span>
          </button>
        </div>
      </section>
    </>
  );
}

function keyForDiagnostic(event: HIDDiagnosticEvent): XiaomiRemoteKey | undefined {
  return event.source === "hidUsage" ? usageToKey[event.code] : keyCodeToKey[event.code];
}

function changedSet(current: ReadonlySet<XiaomiRemoteKey>, key: XiaomiRemoteKey, isPressed: boolean) {
  const next = new Set(current);
  if (isPressed) next.add(key);
  else next.delete(key);
  return next;
}

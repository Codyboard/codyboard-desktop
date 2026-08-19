import type { LucideIcon } from "lucide-react";

import type { HIDDiagnosticEvent } from "../../../shared/hid";

export const SWEEP_PRO_LETTER_KEYS = [
  "T", "G", "B", "R", "F", "V", "E", "D", "C", "W", "S", "X", "Q", "A", "Z",
] as const;

export type SweepProKey = typeof SWEEP_PRO_LETTER_KEYS[number]
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
export interface KnobPulseGuard { direction: number; time: number; }

export const IDLE_KNOB_PULSE_GUARD: KnobPulseGuard = {
  direction: 0,
  time: Number.NEGATIVE_INFINITY,
};
export const KNOB_REVERSAL_MS = 250;

const keyCodeToKey: Readonly<Record<number, SweepProKey>> = {
  0: "A", 1: "S", 2: "D", 3: "F", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
  11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 17: "T", 48: "tab", 56: "leftShift",
};
const consumerUsageToKey: Readonly<Record<number, SweepProKey>> = {
  0xe2: "mute", 0xe9: "volumeUp", 0xea: "volumeDown",
};

export function sweepProKeyForDiagnostic(
  event: HIDDiagnosticEvent,
  deviceId: string,
): SweepProKey | undefined {
  if (event.deviceId !== deviceId) return undefined;
  return event.source === "keyCode"
    ? keyCodeToKey[event.code]
    : consumerUsageToKey[event.code];
}

export function acceptKnobPulse(
  guard: KnobPulseGuard,
  direction: number,
  now: number,
): { accepted: boolean; guard: KnobPulseGuard } {
  const reversed = guard.direction !== 0 && guard.direction !== direction;
  if (reversed && now - guard.time < KNOB_REVERSAL_MS)
    return { accepted: false, guard };
  return { accepted: true, guard: { direction, time: now } };
}

export function sweepProKnobDelta(key: SweepProKey): number {
  if (key === "volumeUp") return 12;
  if (key === "volumeDown") return -12;
  return 0;
}

export function changedSweepProKeys(
  current: ReadonlySet<SweepProKey>,
  key: SweepProKey,
  isPressed: boolean,
): ReadonlySet<SweepProKey> {
  const next = new Set(current);
  if (isPressed) next.add(key);
  else next.delete(key);
  return next;
}

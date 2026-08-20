import { useEffect, useRef, useState } from "react";

import type { VoiceAudioLevel } from "../../../shared/hid";

const barShape = [
  0.42, 0.7, 0.5, 0.86, 0.36, 0.62, 0.94, 0.46,
  0.72, 0.54, 0.82, 0.38, 0.66, 0.9, 0.48, 0.76,
  0.44, 0.84, 0.58, 0.96, 0.4, 0.68, 0.52, 0.88,
  0.34, 0.74, 0.56, 0.92, 0.46, 0.78, 0.6,
];
const matrixRows = 11;
const centerRow = Math.floor(matrixRows / 2);

interface MicrophoneWaveformProps {
  active: boolean;
  level?: VoiceAudioLevel;
  streaming: boolean;
}

export function MicrophoneWaveform({ active, level, streaming }: MicrophoneWaveformProps) {
  const instantLevel = useFilteredLevel(active, level, streaming);

  return (
    <section className={`remote-mic-monitor${streaming ? " is-live" : ""}`}>
      <div className="remote-mic-monitor-heading">
        <span><i aria-hidden="true" />{streaming ? "Live signal" : "Waiting for remote"}</span>
      </div>
      <div className="remote-mic-waveform" aria-hidden="true">
        <div className="remote-mic-dot-matrix">
          {barShape.map((shape, column) => {
            const layers = instantLevel === 0
              ? 0
              : Math.min(centerRow, Math.max(0, Math.ceil(instantLevel * shape * 6 - 0.45)));
            return (
              <span className="remote-mic-dot-column" key={column}>
                {Array.from({ length: matrixRows }, (_, row) => {
                  const baseline = row === centerRow;
                  const distance = Math.abs(row - centerRow);
                  const lit = distance <= layers;
                  return (
                    <i
                      className={`${baseline ? "is-baseline" : ""}${lit ? " is-lit" : ""}`}
                      key={row}
                      style={{ backgroundColor: dotColor(distance, column) }}
                    />
                  );
                })}
              </span>
            );
          })}
        </div>
      </div>
      <p>
        {active
          ? "Hold the remote microphone button and speak. The meter shows the current signal."
          : "Select Xiaomi remote to test its live audio signal."}
      </p>
    </section>
  );
}

function useFilteredLevel(
  active: boolean,
  level: VoiceAudioLevel | undefined,
  streaming: boolean,
): number {
  const gateOpen = useRef(false);
  const quietFrames = useRef(0);
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!active || !streaming || !level) {
      gateOpen.current = false;
      quietFrames.current = 0;
      setDisplayed(0);
      return;
    }
    const raw = Math.max(level.peak, level.rms * 1.8);
    if (!gateOpen.current && raw < 0.025) {
      return;
    }
    if (gateOpen.current && raw < 0.015) {
      quietFrames.current += 1;
      if (quietFrames.current >= 4) {
        gateOpen.current = false;
        quietFrames.current = 0;
        setDisplayed(0);
      }
      return;
    }
    quietFrames.current = 0;
    gateOpen.current = true;
    const target = normalizeLevel(raw);
    setDisplayed((current) => {
      const response = target > current ? 0.48 : 0.2;
      return Math.round((current + (target - current) * response) * 12) / 12;
    });
  }, [active, level, streaming]);

  return displayed;
}

function normalizeLevel(level: number): number {
  const noiseFloorDB = -36;
  const levelDB = 20 * Math.log10(Math.max(level, 0.0001));
  if (levelDB <= noiseFloorDB) return 0;
  return Math.min(1, (levelDB - noiseFloorDB) / -noiseFloorDB);
}

function dotColor(distance: number, column: number): string {
  if (distance <= 1) return "#4fc6b1";
  if (distance === 2) return "#64d2ad";
  if (distance === 3) return "#8bd58f";
  if (distance === 4) return "#bdce79";
  return column % 5 === 0 ? "#efbe72" : "#d8bd6d";
}

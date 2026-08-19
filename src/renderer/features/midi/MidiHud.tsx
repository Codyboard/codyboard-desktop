import { Infinity as InfinityMark } from "lucide-react";
import type { CSSProperties } from "react";

import type { MidiEngineSnapshot } from "./audio-engine";
import { directionFromModifiers, FX_LABELS, FX_ORDER } from "./controls";
import { chordLabel } from "./harmony";
import { LOOP_STEPS } from "./midi-templates";
import { MAX_SLOTS } from "./sequencer";

export function MidiHud({
  hardwareMode,
  onRemoveChord,
  onStepRig,
  resetCountdown,
  shifted,
  snapshot,
}: {
  hardwareMode: boolean;
  onRemoveChord: (index: number) => void;
  onStepRig: (direction: -1 | 1) => void;
  resetCountdown?: number;
  shifted: boolean;
  snapshot: MidiEngineSnapshot;
}) {
  return (
    <div className="midi-hud">
      <section className="midi-oled" aria-label="Tape display">
        <div className="midi-oled-screen">
          <header className="midi-oled-status">
            <button
              aria-label={`Current rig ${snapshot.rig}. Click for next rig; hold Control, Command, or Option for previous rig.`}
              className="midi-oled-rig"
              onClick={(event) => {
                if (event.detail === 0) onStepRig(directionFromModifiers(event));
              }}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                onStepRig(directionFromModifiers(event));
              }}
              title="Next rig · hold ⌃, ⌘, or ⌥ for previous"
              type="button"
            >
              {snapshot.rig}
            </button>
            <span>{hardwareMode ? "SWEEP PRO" : "VIRTUAL"}</span>
            <Pill label="SWG" segments={segments(snapshot.swing * 100, 30)} value={Math.round(snapshot.swing * 100)} />
            <Pill label="BPM" segments={segments(snapshot.bpm - 60, 120)} value={snapshot.bpm} />
          </header>

          <div className="midi-oled-deck">
            <TapeReel bpm={snapshot.bpm} loaded={snapshot.progression.length > 0} playing={snapshot.playing} />
            <div className="midi-oled-transport">
              <b className="midi-oled-clock">{timecode(snapshot.step)}</b>
              <div>
                <i className={transportClass(snapshot, resetCountdown)}>
                  {transportLabel(snapshot, resetCountdown)}
                </i>
                <span>TAPE {String((snapshot.step % LOOP_STEPS) + 1).padStart(2, "0")}/{LOOP_STEPS}</span>
              </div>
            </div>
            <TapeReel bpm={snapshot.bpm} loaded playing={snapshot.playing} />
          </div>

          <div className="midi-tape-path">
            <svg aria-hidden="true" className="midi-tape-line" preserveAspectRatio="none" viewBox="0 0 100 20">
              <polyline points="4,1 16,15 84,15 96,1" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="midi-progression" aria-label="Current chord progression">
              {Array.from({ length: MAX_SLOTS }, (_, index) => {
                const slot = snapshot.progression[index];
                if (!slot) return <b className="" key={index}>·</b>;
                const label = chordLabel(slot);
                return (
                  <button
                    aria-label={`Remove ${label} from the loop`}
                    className={slotClass(snapshot, index)}
                    key={index}
                    onClick={() => onRemoveChord(index)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="midi-oled-title">
            <button
              aria-label={`Current rig ${snapshot.rig}. Click for next rig; hold Control, Command, or Option for previous rig.`}
              className="midi-oled-track"
              onClick={(event) => {
                if (event.detail === 0) onStepRig(directionFromModifiers(event));
              }}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                onStepRig(directionFromModifiers(event));
              }}
              title="Next rig · hold ⌃, ⌘, or ⌥ for previous"
              type="button"
            >
              <i />{snapshot.drumTemplate} · {snapshot.bassTemplate}
            </button>
            <span>{snapshot.rigTagline} · {snapshot.root}</span>
          </div>

          <footer className="midi-oled-plate">
            <b>
              Cody
              <InfinityMark aria-hidden="true" className="midi-brand-mark" strokeWidth={2.6} />
              Loop
            </b>
            <span>TYPE II · K-01</span>
          </footer>
        </div>
      </section>

      <footer className="midi-console" aria-label="Controls">
        <div className="midi-console-cell">
          <span>KNOB</span><b>{snapshot.activeLayer}</b>
        </div>
        <div className={`midi-console-cell ${shifted ? "is-armed" : ""}`.trim()}>
          <span>LAYER</span><b>{shifted ? "SHIFT" : "PLAY"}</b>
        </div>
        <i className="midi-console-rule" />
        <div className="midi-console-fx" aria-label="Performance effects">
          {FX_ORDER.map((fx) => (
            <b className={snapshot.activeFx.includes(fx) ? "is-active" : ""} key={fx}>{FX_LABELS[fx]}</b>
          ))}
        </div>
      </footer>
    </div>
  );
}

function Pill({ label, segments: filled, value }: { label: string; segments: number; value: number }) {
  return (
    <i className="midi-oled-pill">
      <em>
        {[0, 1, 2].map((index) => <s className={index < filled ? "is-lit" : ""} key={index} />)}
      </em>
      {label} {value}
    </i>
  );
}

function segments(value: number, range: number): number {
  return Math.max(0, Math.min(3, Math.round((value / range) * 3)));
}

/** Bar : beat : sixteenth, the counter a tape deck would show. */
function timecode(step: number): string {
  const bar = Math.floor((step % LOOP_STEPS) / 16) + 1;
  const beat = Math.floor((step % 16) / 4) + 1;
  const tick = (step % 4) + 1;
  return [bar, beat, tick].map((part) => String(part).padStart(2, "0")).join(":");
}

function transportLabel(snapshot: MidiEngineSnapshot, resetCountdown?: number): string {
  if (resetCountdown !== undefined) return `RESET ${resetCountdown}`;
  return snapshot.playing ? "PLAYING" : "PAUSED";
}

function transportClass(snapshot: MidiEngineSnapshot, resetCountdown?: number): string {
  if (resetCountdown !== undefined) return "is-resetting";
  return snapshot.playing ? "is-running" : "";
}

/** Reel speed tracks tempo the way tape speed does, and stops dead with the transport. */
function TapeReel({ bpm, loaded, playing }: { bpm: number; loaded: boolean; playing: boolean }) {
  const style = {
    animationDuration: `${240 / bpm}s`,
    animationPlayState: playing ? "running" : "paused",
  } as CSSProperties;
  return (
    <svg
      aria-hidden="true"
      className={`midi-reel ${loaded ? "is-loaded" : ""}`.trim()}
      style={style}
      viewBox="0 0 48 48"
    >
      <circle className="midi-reel-rim" cx="24" cy="24" r="21.5" />
      <circle className="midi-reel-pack" cx="24" cy="24" r="15" />
      {[0, 120, 240].map((angle) => (
        <line
          className="midi-reel-spoke"
          key={angle}
          transform={`rotate(${angle} 24 24)`}
          x1="24"
          x2="24"
          y1="17"
          y2="9.5"
        />
      ))}
      <circle className="midi-reel-hub" cx="24" cy="24" r="5.2" />
      <circle className="midi-reel-pin" cx="24" cy="24" r="1.7" />
    </svg>
  );
}

function slotClass(snapshot: MidiEngineSnapshot, index: number): string {
  const slot = snapshot.progression[index];
  if (!slot) return "";
  const playing = snapshot.progression.length > 0
    && Math.floor(snapshot.step / 8) % snapshot.progression.length === index;
  return playing ? "is-filled is-playing" : "is-filled";
}

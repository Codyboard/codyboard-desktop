import type { MidiEngineSnapshot } from "./audio-engine";
import { chordLabel } from "./harmony";

export function MidiHud({ hardwareMode, snapshot }: { hardwareMode: boolean; snapshot: MidiEngineSnapshot }) {
  return (
    <div className="midi-hud">
      <header className="midi-brand">
        <strong>Cody <span aria-hidden="true">∞</span> Loop</strong>
        <p>GET FUNKY · LOOP SYNTHESIZER</p>
      </header>

      <section className="midi-screen" aria-label="Loop status">
        <Readout label="DRUM" value={snapshot.drumTemplate} />
        <Readout label="BASS" value={snapshot.bassTemplate} />
        <Readout label="TEMPO" value={String(snapshot.bpm)} />
        <Readout label="KEY" value={snapshot.root} />
        <Readout label="STEP" value={String(snapshot.step + 1).padStart(2, "0")} />
        <Readout active={snapshot.playing} label="STATE" value={snapshot.playing ? "RUN" : "STOP"} />
      </section>

      <aside className="midi-status-stack">
        <div><span>INPUT</span><strong>{hardwareMode ? "SWEEP PRO" : "VIRTUAL"}</strong></div>
        <div><span>KNOB</span><strong>{snapshot.activeLayer}</strong></div>
        <div><span>SWING</span><strong>{Math.round(snapshot.swing * 100)}</strong></div>
      </aside>

      <footer className="midi-progression" aria-label="Current chord progression">
        <span>LOOP</span>
        {[0, 1, 2, 3].map((index) => (
          <b className={snapshot.progression[index] ? "is-filled" : ""} key={index}>
            {snapshot.progression[index] ? chordLabel(snapshot.progression[index]) : "·"}
          </b>
        ))}
      </footer>
    </div>
  );
}

function Readout({ active = false, label, value }: { active?: boolean; label: string; value: string }) {
  return (
    <div className={`midi-readout ${active ? "is-active" : ""}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

import { Radio, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  VoiceAudioSource,
  VoiceSettings,
  VoiceSnapshot,
} from "../../../shared/hid";
import { Switch } from "../ui/switch";

interface RemoteMicrophoneSettingsProps {
  applicationScope: boolean;
  inherited: boolean;
  onSourceChange: (source: VoiceAudioSource | "inherit") => Promise<void>;
  savingScope: boolean;
  source: VoiceAudioSource;
  sourceDisabled: boolean;
}

export function RemoteMicrophoneSettings({
  applicationScope,
  inherited,
  onSourceChange,
  savingScope,
  source,
  sourceDisabled,
}: RemoteMicrophoneSettingsProps) {
  const [error, setError] = useState<string>();
  const [gain, setGain] = useState(0);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>();
  const [toneFeedback, setToneFeedback] = useState<"idle" | "playing" | "sent">("idle");
  const toneWasActive = useRef(false);

  useEffect(() => {
    let mounted = true;
    void window.codyboard.voice.snapshot().then((value) => {
      if (mounted) {
        setSnapshot(value);
        setGain(value.settings.gainDB);
      }
    }).catch((cause: unknown) => mounted && setError(errorMessage(cause)));
    const unsubscribe = window.codyboard.voice.onEvent((event) => {
      if (!mounted) return;
      if (event.type === "error") setError(event.message);
      else {
        setSnapshot(event.snapshot);
        setGain(event.snapshot.settings.gainDB);
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    const active = snapshot?.audio.testToneActive ?? false;
    if (active) {
      toneWasActive.current = true;
      setToneFeedback("playing");
      return;
    }
    if (!toneWasActive.current) return;
    toneWasActive.current = false;
    setToneFeedback("sent");
    const timeout = window.setTimeout(() => setToneFeedback("idle"), 1_800);
    return () => window.clearTimeout(timeout);
  }, [snapshot?.audio.testToneActive]);

  const update = async (settings: VoiceSettings) => {
    setError(undefined);
    setSaving(true);
    try { setSnapshot(await window.codyboard.voice.update(settings)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  };
  const commitGain = () => {
    if (snapshot && gain !== snapshot.settings.gainDB)
      void update({ ...snapshot.settings, gainDB: gain });
  };
  const testTone = async () => {
    setError(undefined);
    setToneFeedback("playing");
    setSaving(true);
    try { setSnapshot(await window.codyboard.voice.testTone()); }
    catch (cause) {
      setToneFeedback("idle");
      setError(errorMessage(cause));
    }
    finally { setSaving(false); }
  };

  if (!snapshot) {
    return <section className="remote-mic-settings is-loading">Loading remote microphone…</section>;
  }
  const stateLabel = snapshot.settings.enabled
    ? snapshot.voice.streaming ? "Listening" : snapshot.voice.state
    : "Off";

  return (
    <section className="remote-mic-settings" aria-label="Remote microphone">
      <div className="remote-mic-heading">
        <span><Radio />Remote microphone</span>
        <div className="remote-mic-state">
          <span>{stateLabel}</span>
          <Switch
            aria-label="Enable remote microphone"
            checked={snapshot.settings.enabled}
            disabled={saving}
            onCheckedChange={(enabled) => void update({
              ...snapshot.settings,
              enabled,
            })}
          />
        </div>
      </div>
      <div className="remote-mic-controls">
        <label className="remote-mic-source">
          <span>Input source</span>
          <select
            disabled={savingScope || sourceDisabled}
            onChange={(event) => void onSourceChange(
              event.currentTarget.value as VoiceAudioSource | "inherit",
            )}
            value={applicationScope && inherited ? "inherit" : source}
          >
            {applicationScope && (
              <option value="inherit">Same as Global</option>
            )}
            <option value="remote">Xiaomi remote</option>
            <option value="system">Current app microphone</option>
          </select>
        </label>
        <label className="remote-mic-gain">
          <span>Gain <b>{gain > 0 ? "+" : ""}{gain} dB</b></span>
          <input
            disabled={saving || source === "system"}
            max="24"
            min="-24"
            onBlur={commitGain}
            onChange={(event) => setGain(Number(event.currentTarget.value))}
            onKeyUp={commitGain}
            onPointerUp={commitGain}
            step="1"
            type="range"
            value={gain}
          />
        </label>
        <button
          className="remote-mic-test"
          disabled={saving || source === "system"
            || !snapshot.settings.audioDeviceUID || snapshot.audio.active}
          onClick={() => void testTone()}
          type="button"
        >
          <Volume2 /> {toneFeedback === "playing" ? "Playing…" : toneFeedback === "sent" ? "Sent" : "Test"}
        </button>
      </div>
      <p className="remote-mic-test-hint">
        {source === "remote"
          ? "Remote speech and test tone are sent to Codyboard Virtual Microphone."
          : "Codyboard sends no audio; the active app keeps using its own microphone."}
      </p>
      {error && <p className="remote-mic-error">{error}</p>}
    </section>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

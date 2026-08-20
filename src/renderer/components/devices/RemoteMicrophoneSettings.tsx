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
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>();
  const [toneFeedback, setToneFeedback] = useState<"idle" | "playing" | "sent">("idle");
  const toneWasActive = useRef(false);

  useEffect(() => {
    let mounted = true;
    void window.codyboard.voice.snapshot().then((value) => {
      if (mounted) setSnapshot(value);
    }).catch((cause: unknown) => mounted && setError(errorMessage(cause)));
    const unsubscribe = window.codyboard.voice.onEvent((event) => {
      if (!mounted) return;
      if (event.type === "error") setError(event.message);
      else setSnapshot(event.snapshot);
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
      <div className="remote-mic-layout">
        <div className="remote-mic-identity">
          <span className="remote-mic-icon"><Radio aria-hidden="true" /></span>
          <span className="remote-mic-title">
            <strong>Remote microphone</strong>
            <span className="remote-mic-state">
              <i aria-hidden="true" />
              {stateLabel}
            </span>
          </span>
        </div>
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
        <div className="remote-mic-test-control">
          <span>Output check</span>
          <button
            className="remote-mic-test"
            disabled={saving || source === "system"
              || !snapshot.settings.audioDeviceUID || snapshot.audio.active}
            onClick={() => void testTone()}
            type="button"
          >
            <Volume2 aria-hidden="true" />
            {toneFeedback === "playing" ? "Playing…" : toneFeedback === "sent" ? "Sent" : "Test"}
          </button>
        </div>
        <div className="remote-mic-power">
          <span>Enabled</span>
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
        <p className="remote-mic-test-hint">
          {source === "remote"
            ? "Remote speech and test tone are sent to Codyboard Virtual Microphone."
            : "Codyboard sends no audio; the active app keeps using its own microphone."}
        </p>
      </div>
      {error && <p className="remote-mic-error">{error}</p>}
    </section>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

import { Radio, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  VoiceAudioLevel,
  VoiceAudioSource,
  VoiceSettings,
  VoiceSnapshot,
} from "../../../shared/hid";
import { voiceAudioDeviceUID } from "../../../shared/hid";

import { RemoteMicrophoneDialog } from "./RemoteMicrophoneDialog";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [level, setLevel] = useState<VoiceAudioLevel>();
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>();

  useEffect(() => {
    let mounted = true;
    void window.codyboard.voice.snapshot().then((value) => {
      if (mounted) setSnapshot(value);
    }).catch((cause: unknown) => mounted && setError(errorMessage(cause)));
    const unsubscribe = window.codyboard.voice.onEvent((event) => {
      if (!mounted) return;
      if (event.type === "error") setError(event.message);
      else if (event.type === "level") setLevel(event.level);
      else setSnapshot(event.snapshot);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const update = async (settings: VoiceSettings) => {
    setError(undefined);
    setSaving(true);
    try { setSnapshot(await window.codyboard.voice.update(settings)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  };

  if (!snapshot) {
    return <section className="remote-mic-settings is-loading">Loading audio input…</section>;
  }

  const stateLabel = snapshot.settings.enabled
    ? snapshot.voice.streaming ? "Listening" : snapshot.voice.state
    : "Off";
  const sourceLabel = audioSourceLabel(source, snapshot);
  const routeLabel = source === "remote"
    ? `${sourceLabel} → Codyboard Virtual Microphone`
    : applicationScope && inherited
      ? `Same as Global · ${sourceLabel}`
      : source === "system"
        ? `${sourceLabel} · unchanged`
        : `${sourceLabel} · while held`;

  return (
    <section className="remote-mic-settings" aria-label="Audio input">
      <div className="remote-mic-summary">
        <span className="remote-mic-icon"><Radio aria-hidden="true" /></span>
        <span className="remote-mic-summary-title">
          <strong>Audio input</strong>
          <span className="remote-mic-state"><i aria-hidden="true" />{stateLabel}</span>
        </span>
        <span className="remote-mic-route">{routeLabel}</span>
        <button
          className="remote-mic-settings-button"
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" />
          Settings…
        </button>
      </div>
      {error && !dialogOpen && <p className="remote-mic-error">{error}</p>}
      <RemoteMicrophoneDialog
        applicationScope={applicationScope}
        error={error}
        inherited={inherited}
        level={level}
        onClose={() => setDialogOpen(false)}
        onSourceChange={onSourceChange}
        onUpdate={update}
        open={dialogOpen}
        saving={saving}
        savingScope={savingScope}
        snapshot={snapshot}
        source={source}
        sourceDisabled={sourceDisabled}
      />
    </section>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function audioSourceLabel(source: VoiceAudioSource, snapshot: VoiceSnapshot): string {
  if (source === "remote") return "Xiaomi Remote";
  if (source === "system") return "Use Default Microphone";
  const deviceUID = voiceAudioDeviceUID(source);
  return snapshot.inputDevices.find(({ uid }) => uid === deviceUID)?.name
    ?? "Selected microphone unavailable";
}

import { Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  AudioDeviceInfo,
  VoiceAudioLevel,
  VoiceAudioSource,
  VoiceSettings,
  VoiceSnapshot,
} from "../../../shared/hid";
import { voiceAudioDeviceSource, voiceAudioDeviceUID } from "../../../shared/hid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";

import { MicrophoneWaveform } from "./MicrophoneWaveform";

interface RemoteMicrophoneDialogProps {
  applicationScope: boolean;
  error?: string;
  inherited: boolean;
  level?: VoiceAudioLevel;
  onClose: () => void;
  onSourceChange: (source: VoiceAudioSource | "inherit") => Promise<void>;
  onUpdate: (settings: VoiceSettings) => Promise<void>;
  open: boolean;
  saving: boolean;
  savingScope: boolean;
  snapshot: VoiceSnapshot;
  source: VoiceAudioSource;
  sourceDisabled: boolean;
}

export function RemoteMicrophoneDialog({
  applicationScope,
  error,
  inherited,
  level,
  onClose,
  onSourceChange,
  onUpdate,
  open,
  saving,
  savingScope,
  snapshot,
  source,
  sourceDisabled,
}: RemoteMicrophoneDialogProps) {
  const [dialogElement, setDialogElement] = useState<HTMLDialogElement | null>(null);
  const committedGain = useRef(snapshot.settings.gainDB);
  const [gainDraft, setGainDraft] = useState(snapshot.settings.gainDB);
  const inputDevices = selectableInputDevices(snapshot.inputDevices);
  const selectedDeviceUID = voiceAudioDeviceUID(source);
  const selectedDeviceAvailable = selectedDeviceUID === undefined
    || inputDevices.some(({ uid }) => uid === selectedDeviceUID);

  useEffect(() => {
    const dialog = dialogElement;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [dialogElement, open]);
  useEffect(() => {
    committedGain.current = snapshot.settings.gainDB;
    setGainDraft(snapshot.settings.gainDB);
  }, [snapshot.settings.gainDB]);

  const commitGain = () => {
    if (gainDraft === committedGain.current) return;
    committedGain.current = gainDraft;
    void onUpdate({ ...snapshot.settings, gainDB: gainDraft });
  };

  return (
    <dialog
      aria-labelledby="remote-mic-dialog-title"
      className="remote-mic-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      onClose={onClose}
      ref={setDialogElement}
    >
      <div className="remote-mic-dialog-panel">
        <header className="remote-mic-dialog-header">
          <span className="remote-mic-dialog-mark"><Radio aria-hidden="true" /></span>
          <span>
            <small>Microphone routing</small>
            <h2 id="remote-mic-dialog-title">Audio input</h2>
          </span>
          <button aria-label="Close microphone settings" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        <MicrophoneWaveform
          active={open && source === "remote"}
          level={level}
          streaming={snapshot.voice.streaming}
        />

        <div className="remote-mic-dialog-settings">
          <div className="remote-mic-dialog-row">
            <span>
              <strong>Xiaomi remote</strong>
              <small>Connect to the Xiaomi remote and accept voice sessions.</small>
            </span>
            <Switch
              aria-label="Enable Xiaomi remote audio"
              checked={snapshot.settings.enabled}
              disabled={saving}
              onCheckedChange={(enabled) => void onUpdate({
                ...snapshot.settings,
                enabled,
              })}
            />
          </div>
          <div className="remote-mic-dialog-field">
            <span>
              <strong>Input source</strong>
              <small>Choose what apps hear while the remote button is held.</small>
            </span>
            <Select
              disabled={savingScope || sourceDisabled}
              onValueChange={(value) => void onSourceChange(value as VoiceAudioSource | "inherit")}
              value={applicationScope && inherited ? "inherit" : source}
            >
              <SelectTrigger aria-label="Input Source" className="remote-mic-source-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="end"
                className="remote-mic-source-menu"
                portalContainer={dialogElement}
              >
                {applicationScope && <SelectItem value="inherit">Same as Global</SelectItem>}
                <SelectItem value="remote">Xiaomi Remote</SelectItem>
                <SelectItem value="system">Use Default Microphone</SelectItem>
                <SelectSeparator className="remote-mic-source-separator" />
                {!selectedDeviceAvailable && (
                  <SelectItem value={source}>Selected Microphone (Unavailable)</SelectItem>
                )}
                {inputDevices.map((device) => (
                  <SelectItem key={device.uid} value={voiceAudioDeviceSource(device.uid)}>
                    {device.name}
                  </SelectItem>
                ))}
                {inputDevices.length === 0 && selectedDeviceAvailable && (
                  <SelectItem disabled value="__no_microphones__">No Microphones Found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="remote-mic-dialog-row is-static">
            <span>
              <strong>Virtual output</strong>
              <small>Fixed system input device for remote speech.</small>
            </span>
            <output>Codyboard Virtual Microphone</output>
          </div>
          <label className="remote-mic-gain">
            <span>
              <strong>Gain</strong>
              <small>Adjust the Xiaomi remote microphone level.</small>
            </span>
            <span className="remote-mic-gain-control">
              <input
                aria-label="Microphone gain"
                disabled={saving}
                max="24"
                min="-24"
                onBlur={commitGain}
                onChange={(event) => setGainDraft(Number(event.currentTarget.value))}
                onKeyUp={commitGain}
                onPointerUp={commitGain}
                step="1"
                type="range"
                value={gainDraft}
              />
              <output>{formatGain(gainDraft)}</output>
            </span>
          </label>
        </div>

        {error && <p className="remote-mic-error">{error}</p>}
        <footer className="remote-mic-dialog-footer">
          <span>Apps with a fixed microphone may ignore input changes.</span>
          <button onClick={onClose} type="button">Done</button>
        </footer>
      </div>
    </dialog>
  );
}

const VIRTUAL_MICROPHONE_UID = "CodyboardVirtualMicrophone2ch_UID";

function selectableInputDevices(devices: AudioDeviceInfo[]): AudioDeviceInfo[] {
  return devices.filter(({ uid }) => uid !== VIRTUAL_MICROPHONE_UID);
}

function formatGain(gainDB: number): string {
  return `${gainDB > 0 ? "+" : ""}${gainDB} dB`;
}

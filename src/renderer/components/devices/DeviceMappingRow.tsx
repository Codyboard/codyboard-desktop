import { AppWindow, Link2 } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import type {
  CodyboardApplicationInfo,
  MappingOutput,
  ProfileDraft,
} from "../../../shared/hid";
import type { ResolvedProfileMapping } from "../../../shared/profile-mappings";
import { mappingOutputSignature } from "../../../shared/profile-mappings";

import type { DeviceControl } from "./device-controls";
import {
  describeOutput,
  recordedKeyboardOutput,
} from "./mapping-output";
import { KEY_OUTPUT_OPTIONS_BY_SIGNATURE } from "./mapping-output-presets";
import { ActionSelect, ClearMappingButton, PresetSelect } from "./MappingValueControls";
import { TypeTextEditor } from "./TypeTextEditor";

export interface DeviceMappingRowProps<Key extends string> {
  activeProfile?: ProfileDraft;
  applicationInfo: Readonly<Record<string, CodyboardApplicationInfo>>;
  changeAction: (control: DeviceControl<Key>, action: string) => Promise<void>;
  chooseApplication: (control: DeviceControl<Key>) => Promise<void>;
  control: DeviceControl<Key>;
  editingTextKey?: Key;
  editingURLKey?: Key;
  isApplicationScope: boolean;
  isRecording: boolean;
  isSaving: boolean;
  isSelected: boolean;
  onSelect?: () => void;
  resolution: ResolvedProfileMapping;
  saveOutput: (control: DeviceControl<Key>, output: MappingOutput) => Promise<boolean>;
  setEditingTextKey: (key?: Key) => void;
  setEditingURLKey: (key?: Key) => void;
  setError: (message?: string) => void;
  setRecordingKey: (key?: Key) => void;
  setURLDraft: (value: string) => void;
  urlDraft: string;
}

export function DeviceMappingRow<Key extends string>(props: DeviceMappingRowProps<Key>) {
  const {
    activeProfile, applicationInfo, changeAction, chooseApplication, control, editingTextKey,
    editingURLKey, isApplicationScope, isRecording, isSaving, isSelected,
    onSelect, resolution, saveOutput, setEditingTextKey, setEditingURLKey,
    setError, setRecordingKey, setURLDraft, urlDraft,
  } = props;
  const rowRef = useRef<HTMLElement>(null);
  const defaultMapping = control.defaultOutput && !resolution.effective
    ? { from: control.input, id: `default-${control.key.toLowerCase()}`, to: control.defaultOutput }
    : undefined;
  const mapping = resolution.effective ?? defaultMapping;
  const override = resolution.override;
  const isInherited = Boolean(isApplicationScope && !override);
  const launchOutput = !isRecording && mapping?.to.kind === "launchApplication" ? mapping.to : undefined;
  const openURLOutput = !isRecording && mapping?.to.kind === "openURL" ? mapping.to : undefined;
  const typeTextOutput = !isRecording && mapping?.to.kind === "typeText" ? mapping.to : undefined;
  const isEditingText = editingTextKey === control.key;
  const isEditingURL = editingURLKey === control.key;
  const outputOption = mapping
    ? KEY_OUTPUT_OPTIONS_BY_SIGNATURE.get(mappingOutputSignature(mapping.to))
    : undefined;

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (isRecording) rowRef.current?.querySelector<HTMLInputElement>(".keystroke-recorder input")?.focus();
    if (isEditingURL) rowRef.current?.querySelector<HTMLInputElement>(".open-url-value")?.focus();
  }, [isEditingURL, isRecording, isSelected]);

  const commitURL = async () => {
    if (!isEditingURL) return;
    const url = urlDraft.trim();
    if (!url) return;
    try {
      if (!new URL(url).protocol) throw new Error();
    } catch {
      setError("Enter an absolute URL including its scheme, such as https:// or file://.");
      return;
    }
    setEditingURLKey();
    await saveOutput(control, { kind: "openURL", url });
  };

  return (
    <article
      className={`mapping-row ${isSelected ? "is-selected" : ""} ${isRecording ? "is-recording" : ""} ${isInherited ? "is-inherited" : ""}`.trim()}
      data-mapping-key={control.key}
      onPointerDown={onSelect}
      ref={rowRef}
    >
      <span className="mapping-button-icon">
        {control.legend
          ? <strong aria-hidden="true">{control.legend}</strong>
          : control.icon && <control.icon aria-hidden="true" />}
      </span>
      <span className="mapping-button-name">
        <strong>{control.label}</strong>
        <small>{mappingStatus(isApplicationScope, Boolean(override), Boolean(defaultMapping), Boolean(mapping))}</small>
      </span>
      <ActionSelect
        control={control}
        disabled={!activeProfile || isSaving}
        isApplicationScope={isApplicationScope}
        onChange={(action) => void changeAction(control, action)}
        value={actionValue({ isEditingText, isEditingURL, isInherited, isRecording, launchOutput, openURLOutput, typeTextOutput })}
      />
      {launchOutput && !isEditingURL && !isEditingText
        ? (
            <div className="launch-application-picker">
              <button
                aria-label={`Choose application for ${control.label}`}
                className="launch-application-value"
                disabled={!activeProfile || isSaving}
                onClick={() => void chooseApplication(control)}
                type="button"
              >
                {applicationInfo[launchOutput.bundleId]?.iconDataUrl
                  ? <img alt="" src={applicationInfo[launchOutput.bundleId]?.iconDataUrl} />
                  : <AppWindow aria-hidden="true" />}
                <strong>{isSaving ? "Saving…" : applicationInfo[launchOutput.bundleId]?.name ?? launchOutput.bundleId}</strong>
              </button>
              <ClearMappingButton control={control} disabled={!activeProfile || isSaving} saveOutput={saveOutput} />
            </div>
          )
        : isEditingText || (typeTextOutput && !isEditingURL)
          ? (
              <TypeTextEditor
                controlLabel={control.label}
                disabled={!activeProfile || isSaving}
                onCancel={() => setEditingTextKey()}
                onClear={() => { setEditingTextKey(); void saveOutput(control, { kind: "suppress" }); }}
                onSave={async (output) => { await saveOutput(control, output); }}
                output={typeTextOutput}
              />
            )
          : openURLOutput || isEditingURL
            ? (
                <div className="open-url-picker">
                  <Link2 aria-hidden="true" className="open-url-icon" />
                  <input
                    aria-label={`${control.label} URL`}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="open-url-value"
                    disabled={!activeProfile || isSaving}
                    onBlur={() => void commitURL()}
                    onChange={(event) => setURLDraft(event.target.value)}
                    onFocus={() => { if (!isEditingURL) { setURLDraft(openURLOutput?.url ?? ""); setEditingURLKey(control.key); } }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") { event.preventDefault(); setEditingURLKey(); setURLDraft(""); }
                    }}
                    placeholder="https://, file://, or another URL"
                    spellCheck={false}
                    value={isEditingURL ? urlDraft : openURLOutput?.url ?? ""}
                  />
                  {(openURLOutput || urlDraft) && <ClearMappingButton control={control}
                    disabled={!activeProfile || isSaving}
                    onClear={() => { setEditingURLKey(); setURLDraft(""); }}
                    saveOutput={saveOutput} />}
                </div>
              )
            : (
                <label className="keystroke-recorder">
                  <span className="key-press-combobox">
                    {outputOption && <span className="key-output-current-icon"><outputOption.icon aria-hidden="true" /></span>}
                    <input
                      aria-label={`${control.label} key press`}
                      className={mapping?.to.kind === "suppress" ? "is-suppressed" : ""}
                      disabled={!activeProfile || isSaving}
                      onBlur={() => setRecordingKey()}
                      onFocus={() => setRecordingKey(control.key)}
                      onKeyDown={(event) => void captureKeystroke(event, (output) => saveOutput(control, output))}
                      placeholder="Press keys"
                      readOnly
                      value={isSaving ? "Saving…" : describeOutput(mapping?.to)}
                    />
                    {mapping?.to.kind !== "suppress" && <ClearMappingButton control={control} disabled={!activeProfile || isSaving} saveOutput={saveOutput} />}
                    <PresetSelect control={control} disabled={!activeProfile || isSaving} saveOutput={saveOutput} />
                  </span>
                </label>
              )}
    </article>
  );
}

async function captureKeystroke(event: KeyboardEvent<HTMLInputElement>, save: (output: MappingOutput) => Promise<unknown>) {
  event.preventDefault(); event.stopPropagation();
  const output = recordedKeyboardOutput(event);
  if (output) await save(output);
}

function mappingStatus(application: boolean, override: boolean, defaultMapping: boolean, mapping: boolean): string {
  return application ? override ? "Overridden" : "Unchanged" : defaultMapping ? "Default" : mapping ? "Configured" : "Unassigned";
}

function actionValue(state: Record<string, unknown> & { isEditingText: boolean; isEditingURL: boolean; isInherited: boolean; isRecording: boolean; launchOutput?: unknown; openURLOutput?: unknown; typeTextOutput?: unknown }): string {
  if (state.isRecording) return "keystroke";
  if (state.isEditingText) return "type-text";
  if (state.isEditingURL) return "open-url";
  if (state.isInherited) return "unchanged";
  if (state.launchOutput) return "launch";
  if (state.openURLOutput) return "open-url";
  if (state.typeTextOutput) return "type-text";
  return "keystroke";
}

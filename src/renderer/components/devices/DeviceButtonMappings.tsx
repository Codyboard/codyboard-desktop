import type { ProfileDomain } from "../../../shared/hid";

import type { DeviceControl } from "./device-controls";
import { DeviceMappingRow } from "./DeviceMappingRow";
import { MappingScopeHeader } from "./MappingScopeHeader";
import { RemoteMicrophoneSettings } from "./RemoteMicrophoneSettings";
import type { DeviceMappingPreview } from "./SweepPro";
import { useDeviceMappings } from "./use-device-mappings";

export {
  SWEEP_PRO_CONTROLS,
  SWEEP_PRO_DEFAULT_PROFILE,
  XIAOMI_REMOTE_CONTROLS,
  XIAOMI_REMOTE_DEFAULT_PROFILE,
} from "./device-controls";
export type { DeviceControl } from "./device-controls";
export {
  mappingPreviewForControl,
  performActionTypeChange,
  recordedKeyboardOutput,
} from "./mapping-output";

interface DeviceButtonMappingsProps<Key extends string> {
  controls: readonly DeviceControl<Key>[];
  remoteMicrophoneSettings?: boolean;
  profileDomain?: ProfileDomain;
  onPreviewChange?: (previews: Partial<Record<Key, DeviceMappingPreview>>) => void;
  onSelectKey?: (key: Key) => void;
  selectedKey?: Key;
}

export function DeviceButtonMappings<Key extends string>({
  controls,
  profileDomain,
  onPreviewChange,
  onSelectKey,
  remoteMicrophoneSettings,
  selectedKey,
}: DeviceButtonMappingsProps<Key>) {
  const state = useDeviceMappings(controls, profileDomain, onPreviewChange);
  const isApplicationScope = state.selectedGroup?.scope.kind === "application";

  return (
    <section aria-label="Button mappings" className="mapping-console">
      <MappingScopeHeader
        applicationGroups={state.applicationGroups}
        applicationInfo={state.applicationInfo}
        changeScope={state.changeScope}
        menuOpen={state.scopeMenuOpen}
        pendingRemoval={state.scopePendingRemoval}
        removeScope={state.removeScope}
        saving={state.savingScope}
        selectedGroup={state.selectedGroup}
        selectedScopeId={state.selectedScopeId}
        setMenuOpen={state.setScopeMenuOpen}
        setPendingRemovalId={state.setScopePendingRemovalId}
      />
      {profileDomain === undefined && (
        <PanelNotice>Profile identity is unavailable for this device.</PanelNotice>
      )}
      {profileDomain !== undefined && state.snapshot && !state.activeProfile && (
        <PanelNotice>Activate a profile to edit its buttons.</PanelNotice>
      )}
      {state.error && <PanelNotice tone="error">{state.error}</PanelNotice>}
      {remoteMicrophoneSettings && (
        <RemoteMicrophoneSettings
          applicationScope={isApplicationScope}
          inherited={state.voiceAudioSourceInherited}
          onSourceChange={state.changeVoiceAudioSource}
          savingScope={state.savingScope}
          source={state.voiceAudioSource}
          sourceDisabled={!state.activeProfile || !state.selectedGroup}
        />
      )}
      <div className="mapping-list">
        {state.mappings.map(({ control, resolution }) => (
          <DeviceMappingRow
            activeProfile={state.activeProfile}
            applicationInfo={state.applicationInfo}
            changeAction={state.changeAction}
            chooseApplication={state.chooseApplication}
            control={control}
            editingTextKey={state.editingTextKey}
            editingURLKey={state.editingURLKey}
            isApplicationScope={isApplicationScope}
            isRecording={state.recordingKey === control.key}
            isSaving={state.savingKey === control.key}
            isSelected={selectedKey === control.key}
            key={control.key}
            onSelect={() => onSelectKey?.(control.key)}
            resolution={resolution}
            saveOutput={state.saveOutput}
            setEditingTextKey={state.setEditingTextKey}
            setEditingURLKey={state.setEditingURLKey}
            setError={state.setError}
            setRecordingKey={state.setRecordingKey}
            setURLDraft={state.setURLDraft}
            urlDraft={state.urlDraft}
          />
        ))}
      </div>
    </section>
  );
}

function PanelNotice({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "error" | "neutral";
}) {
  return <p className={`mapping-notice is-${tone}`}>{children}</p>;
}

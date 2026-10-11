import { useEffect, useMemo, useState } from "react";

import type {
  CodyboardApplicationInfo,
  MappingOutput,
  ProfileDomain,
  ProfilesSnapshot,
  VoiceAudioSource,
} from "../../../shared/hid";
import { profileDomainKey } from "../../../shared/hid";
import {
  removeApplicationMappingGroup,
  removeProfileMappingOverride,
  resolveProfileMapping,
  setProfileMapping,
} from "../../../shared/profile-mappings";

import type { DeviceControl } from "./device-controls";
import {
  applicationGroupId,
  mappingIdFor,
  mappingPreviewForControl,
  performActionTypeChange,
} from "./mapping-output";
import type { DeviceMappingPreview } from "./SweepPro";

export function useDeviceMappings<Key extends string>(
  controls: readonly DeviceControl<Key>[],
  profileDomain: ProfileDomain | undefined,
  onPreviewChange?: (previews: Partial<Record<Key, DeviceMappingPreview>>) => void,
) {
  const [applicationInfo, setApplicationInfo] = useState<Record<string, CodyboardApplicationInfo>>({});
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [recordingKey, setRecordingKey] = useState<Key>();
  const [editingTextKey, setEditingTextKey] = useState<Key>();
  const [editingURLKey, setEditingURLKey] = useState<Key>();
  const [urlDraft, setURLDraft] = useState("");
  const [savingKey, setSavingKey] = useState<Key>();
  const [savingScope, setSavingScope] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [scopePendingRemovalId, setScopePendingRemovalId] = useState<string>();
  const [selectedScopeId, setSelectedScopeId] = useState("global");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    const acceptSnapshot = (next: ProfilesSnapshot) => {
      if (mounted) setSnapshot((current) =>
        current && current.generation > next.generation ? current : next,
      );
    };
    void window.codyboard.profiles.snapshot().then(acceptSnapshot);
    const unsubscribe = window.codyboard.profiles.onEvent((event) => {
      if (event.type === "changed") acceptSnapshot(event.snapshot);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const activeProfile = profileDomain === undefined
    ? undefined
    : snapshot?.keyboards[profileDomainKey(profileDomain)]?.activeProfile;
  const applicationGroups = useMemo(
    () => activeProfile?.groups.filter(({ scope }) => scope.kind === "application") ?? [],
    [activeProfile],
  );
  const selectedGroup = activeProfile?.groups.find(({ id }) => id === selectedScopeId)
    ?? activeProfile?.groups.find(({ scope }) => scope.kind === "global");
  const globalVoiceAudioSource = activeProfile?.groups.find(
    ({ scope }) => scope.kind === "global",
  )?.voiceAudioSource ?? "remote";
  const voiceAudioSource = selectedGroup?.voiceAudioSource ?? globalVoiceAudioSource;
  const voiceAudioSourceInherited = selectedGroup?.scope.kind === "application"
    && selectedGroup.voiceAudioSource === undefined;
  const scopePendingRemoval = activeProfile?.groups.find(({ id }) => id === scopePendingRemovalId);
  const mappings = useMemo(() => {
    if (!activeProfile || !selectedGroup) return [];
    return controls.map((control) => ({
      control,
      resolution: resolveProfileMapping(activeProfile, selectedGroup, control.input),
    }));
  }, [activeProfile, controls, selectedGroup]);

  useEffect(() => {
    setSelectedScopeId("global");
    setScopePendingRemovalId(undefined);
  }, [activeProfile?.id, profileDomain]);
  useEffect(() => {
    setEditingTextKey(undefined);
    setEditingURLKey(undefined);
    setRecordingKey(undefined);
    setURLDraft("");
  }, [activeProfile?.id, selectedScopeId]);
  useEffect(() => {
    if (!scopePendingRemovalId) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !savingScope) setScopePendingRemovalId(undefined);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [savingScope, scopePendingRemovalId]);
  useEffect(() => {
    let mounted = true;
    const bundleIds = referencedBundleIds(activeProfile?.groups ?? []);
    for (const bundleId of bundleIds) {
      void window.codyboard.applications.resolve(bundleId).then((info) => {
        if (mounted && info)
          setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      }).catch(() => undefined);
    }
    return () => { mounted = false; };
  }, [activeProfile]);
  useEffect(() => {
    const previews = Object.fromEntries(mappings.flatMap(({ control, resolution }) => {
      const preview = mappingPreviewForControl(control, resolution.effective?.to, applicationInfo);
      return preview ? [[control.key, preview]] : [];
    })) as Partial<Record<Key, DeviceMappingPreview>>;
    onPreviewChange?.(previews);
  }, [applicationInfo, mappings, onPreviewChange]);

  const updateProfile = async (draft: NonNullable<typeof activeProfile>) => {
    if (profileDomain === undefined || !activeProfile) return;
    setSnapshot(await window.codyboard.profiles.update(profileDomain, activeProfile.id, draft));
  };
  const saveOutput = async (control: DeviceControl<Key>, output: MappingOutput): Promise<boolean> => {
    if (!activeProfile || !selectedGroup) return false;
    setError(undefined);
    setSavingKey(control.key);
    try {
      const resolution = resolveProfileMapping(activeProfile, selectedGroup, control.input);
      await updateProfile(setProfileMapping(activeProfile, selectedGroup.id, {
        from: control.input,
        id: resolution.override?.id ?? mappingIdFor(selectedGroup.id, control.key, activeProfile),
        to: output,
      }));
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      setSavingKey(undefined);
      setRecordingKey(undefined);
    }
  };
  const resetOutput = async (control: DeviceControl<Key>) => {
    if (selectedGroup?.scope.kind !== "application" || !activeProfile) return;
    setError(undefined);
    setSavingKey(control.key);
    try {
      await updateProfile(removeProfileMappingOverride(activeProfile, selectedGroup.id, control.input));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingKey(undefined);
      setRecordingKey(undefined);
    }
  };
  const chooseApplication = async (control: DeviceControl<Key>) => {
    setError(undefined);
    try {
      const info = await window.codyboard.applications.pick();
      if (!info) return;
      setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      await saveOutput(control, { bundleId: info.bundleId, kind: "launchApplication" });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const changeScope = async (scopeId: string) => {
    if (scopeId !== "__add_application__") { setSelectedScopeId(scopeId); return; }
    if (!activeProfile) return;
    setError(undefined);
    setSavingScope(true);
    try {
      const info = await window.codyboard.applications.pick();
      if (!info) return;
      setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      const existing = activeProfile.groups.find(
        ({ scope }) => scope.kind === "application" && scope.bundleId === info.bundleId,
      );
      if (existing) { setSelectedScopeId(existing.id); return; }
      const draft = structuredClone(activeProfile);
      const groupId = applicationGroupId(info.bundleId, draft);
      draft.groups.push({ id: groupId, mappings: [], scope: { bundleId: info.bundleId, kind: "application" } });
      await updateProfile(draft);
      setSelectedScopeId(groupId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingScope(false);
    }
  };
  const removeScope = async () => {
    if (!activeProfile || scopePendingRemoval?.scope.kind !== "application") return;
    setError(undefined);
    setSavingScope(true);
    try {
      await updateProfile(removeApplicationMappingGroup(activeProfile, scopePendingRemoval.id));
      if (selectedScopeId === scopePendingRemoval.id) setSelectedScopeId("global");
      setScopePendingRemovalId(undefined);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingScope(false);
    }
  };
  const changeAction = async (control: DeviceControl<Key>, action: string) => {
    setEditingTextKey(undefined); setEditingURLKey(undefined); setURLDraft(""); setRecordingKey(undefined);
    await performActionTypeChange(action, () => saveOutput(control, { kind: "suppress" }), () => resetOutput(control), async () => {
      if (action === "launch") await chooseApplication(control);
      else if (action === "open-url") setEditingURLKey(control.key);
      else if (action === "type-text") setEditingTextKey(control.key);
      else setRecordingKey(control.key);
    });
  };
  const changeVoiceAudioSource = async (source: VoiceAudioSource | "inherit") => {
    if (!activeProfile || !selectedGroup) return;
    setError(undefined);
    setSavingScope(true);
    try {
      const draft = structuredClone(activeProfile);
      const group = draft.groups.find(({ id }) => id === selectedGroup.id)!;
      if (source === "inherit") delete group.voiceAudioSource;
      else group.voiceAudioSource = source;
      await updateProfile(draft);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSavingScope(false);
    }
  };

  return {
    activeProfile, applicationGroups, applicationInfo, changeAction, changeScope,
    changeVoiceAudioSource,
    chooseApplication,
    editingTextKey, editingURLKey, error, mappings, recordingKey, removeScope,
    saveOutput, savingKey, savingScope, scopeMenuOpen, scopePendingRemoval,
    selectedGroup, selectedScopeId, setEditingTextKey, setEditingURLKey, setError,
    setRecordingKey, setScopeMenuOpen, setScopePendingRemovalId, setURLDraft,
    snapshot, urlDraft, voiceAudioSource, voiceAudioSourceInherited,
  };
}

function referencedBundleIds(groups: Readonly<NonNullable<ProfilesSnapshot["keyboards"][string]["activeProfile"]>["groups"]>): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    if (group.scope.kind === "application") ids.add(group.scope.bundleId);
    for (const mapping of group.mappings)
      if (mapping.to.kind === "launchApplication") ids.add(mapping.to.bundleId);
  }
  return [...ids];
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

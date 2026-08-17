import {
  AppWindow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerDownLeft,
  Home,
  Menu,
  Minus,
  Plus,
  Tv,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import type {
  CodyboardApplicationInfo,
  HIDModifier,
  KeyMapping,
  MappingInput,
  MappingOutput,
  ProfileDraft,
  ProfilesSnapshot,
} from "../../../shared/hid";

import type { XiaomiRemoteKey } from "./XiaomiRemote";

interface DeviceControl {
  icon: LucideIcon;
  input: MappingInput;
  key: XiaomiRemoteKey;
  label: string;
}

interface KeyOutputOption {
  id: string;
  label: string;
  output: MappingOutput;
}

interface KeyOutputGroup {
  label: string;
  options: readonly KeyOutputOption[];
}

const KEY_OUTPUT_GROUPS: readonly KeyOutputGroup[] = [
  {
    label: "Media & Volume",
    options: [
      { id: "volume-up", label: "Volume Up", output: { kind: "system", key: "volumeUp" } },
      { id: "volume-down", label: "Volume Down", output: { kind: "system", key: "volumeDown" } },
      { id: "mute", label: "Mute", output: { kind: "system", key: "mute" } },
      { id: "play-pause", label: "Play / Pause", output: { kind: "system", key: "playPause" } },
      { id: "next-track", label: "Next Track", output: { kind: "system", key: "nextTrack" } },
      { id: "previous-track", label: "Previous Track", output: { kind: "system", key: "previousTrack" } },
      { id: "fast-forward", label: "Fast Forward", output: { kind: "system", key: "fastForward" } },
      { id: "rewind", label: "Rewind", output: { kind: "system", key: "rewind" } },
      { id: "brightness-up", label: "Display Brightness Up", output: { kind: "system", key: "brightnessUp" } },
      { id: "brightness-down", label: "Display Brightness Down", output: { kind: "system", key: "brightnessDown" } },
      { id: "keyboard-brightness-up", label: "Keyboard Brightness Up", output: { kind: "system", key: "keyboardBrightnessUp" } },
      { id: "keyboard-brightness-down", label: "Keyboard Brightness Down", output: { kind: "system", key: "keyboardBrightnessDown" } },
      { id: "keyboard-brightness-toggle", label: "Keyboard Backlight Toggle", output: { kind: "system", key: "keyboardBrightnessToggle" } },
      { id: "video-mirroring", label: "Video Mirroring", output: { kind: "system", key: "videoMirror" } },
      { id: "eject", label: "Eject", output: { kind: "system", key: "eject" } },
    ],
  },
  {
    label: "System",
    options: [
      { id: "lock-screen", label: "Lock Screen", output: { kind: "keyboard", key: "q", modifiers: ["command", "control"] } },
      { id: "mission-control", label: "Mission Control", output: { kind: "keyboard", key: "arrowUp", modifiers: ["control"] } },
      { id: "application-windows", label: "Application Windows", output: { kind: "keyboard", key: "arrowDown", modifiers: ["control"] } },
      { id: "space-left", label: "Move Left a Space", output: { kind: "keyboard", key: "arrowLeft", modifiers: ["control"] } },
      { id: "space-right", label: "Move Right a Space", output: { kind: "keyboard", key: "arrowRight", modifiers: ["control"] } },
      { id: "show-desktop", label: "Show Desktop", output: { kind: "keyboard", key: "h", modifiers: ["fn"] } },
      { id: "launchpad", label: "Launchpad", output: { kind: "keyboard", key: "f4", modifiers: ["fn"] } },
      { id: "spotlight", label: "Spotlight", output: { kind: "keyboard", key: "space", modifiers: ["command"] } },
      { id: "notification-center", label: "Notification Center", output: { kind: "keyboard", key: "n", modifiers: ["fn"] } },
      { id: "control-center", label: "Control Center", output: { kind: "keyboard", key: "c", modifiers: ["fn"] } },
      { id: "focus-dock", label: "Focus Dock", output: { kind: "keyboard", key: "a", modifiers: ["fn"] } },
      { id: "focus-menu-bar", label: "Focus Menu Bar", output: { kind: "keyboard", key: "m", modifiers: ["fn"] } },
      { id: "quick-note", label: "Quick Note", output: { kind: "keyboard", key: "q", modifiers: ["fn"] } },
      { id: "emoji-symbols", label: "Emoji & Symbols", output: { kind: "keyboard", key: "e", modifiers: ["fn"] } },
      { id: "app-switcher", label: "Application Switcher", output: { kind: "keyboard", key: "tab", modifiers: ["command"] } },
      { id: "next-window", label: "Next Window", output: { kind: "keyboard", key: "`", modifiers: ["command"] } },
    ],
  },
  {
    label: "Special Keys",
    options: [
      { id: "command", label: "Command", output: { kind: "modifier", key: "command", modifiers: [] } },
      { id: "option", label: "Option", output: { kind: "modifier", key: "option", modifiers: [] } },
      { id: "control", label: "Control", output: { kind: "modifier", key: "control", modifiers: [] } },
      { id: "shift", label: "Shift", output: { kind: "modifier", key: "shift", modifiers: [] } },
      { id: "fn", label: "Fn", output: { kind: "modifier", key: "fn", modifiers: [] } },
      { id: "caps-lock", label: "Caps Lock", output: { kind: "modifier", key: "capsLock", modifiers: [] } },
      { id: "escape", label: "Escape", output: { kind: "keyboard", key: "escape", modifiers: [] } },
      { id: "delete-forward", label: "Forward Delete", output: { kind: "keyboard", key: "deleteForward", modifiers: [] } },
      { id: "home", label: "Home", output: { kind: "keyboard", key: "home", modifiers: [] } },
      { id: "end", label: "End", output: { kind: "keyboard", key: "end", modifiers: [] } },
      { id: "page-up", label: "Page Up", output: { kind: "keyboard", key: "pageUp", modifiers: [] } },
      { id: "page-down", label: "Page Down", output: { kind: "keyboard", key: "pageDown", modifiers: [] } },
    ],
  },
  {
    label: "Function Keys",
    options: Array.from({ length: 20 }, (_, index): KeyOutputOption => ({
      id: `f${index + 1}`,
      label: `F${index + 1}`,
      output: { kind: "keyboard", key: `f${index + 1}`, modifiers: [] },
    })),
  },
];

const KEY_OUTPUT_OPTIONS = new Map(KEY_OUTPUT_GROUPS.flatMap(({ options }) => options.map((option) => [option.id, option])));
const KEY_OUTPUT_LABELS = new Map(
  KEY_OUTPUT_GROUPS.flatMap(({ options }) => options.map((option) => [outputSignature(option.output), option.label])),
);

const CONTROLS: readonly DeviceControl[] = [
  { icon: ChevronUp, input: { kind: "keyboard", key: "arrowUp", modifiers: ["fn"] }, key: "up", label: "Up" },
  { icon: ChevronDown, input: { kind: "keyboard", key: "arrowDown", modifiers: ["fn"] }, key: "down", label: "Down" },
  { icon: ChevronLeft, input: { kind: "keyboard", key: "arrowLeft", modifiers: ["fn"] }, key: "left", label: "Left" },
  { icon: ChevronRight, input: { kind: "keyboard", key: "arrowRight", modifiers: ["fn"] }, key: "right", label: "Right" },
  { icon: CornerDownLeft, input: { kind: "keyboard", key: "enter", modifiers: [] }, key: "enter", label: "Enter" },
  { icon: Undo2, input: { kind: "hidUsage", usage: 0xf1 }, key: "back", label: "Back" },
  { icon: Plus, input: { kind: "system", key: "volumeUp" }, key: "volumeUp", label: "Volume Up" },
  { icon: Minus, input: { kind: "system", key: "volumeDown" }, key: "volumeDown", label: "Volume Down" },
  { icon: Home, input: { kind: "keyboard", keyCode: 115, modifiers: ["fn"] }, key: "home", label: "Home" },
  { icon: Menu, input: { kind: "keyboard", keyCode: 110, modifiers: [] }, key: "menu", label: "Menu" },
  { icon: Tv, input: { kind: "keyboard", key: "`", modifiers: [] }, key: "tv", label: "TV" },
];

interface DeviceButtonMappingsProps {
  keyboardType?: number;
  onSelectKey?: (key: XiaomiRemoteKey) => void;
  selectedKey?: XiaomiRemoteKey;
}

export function DeviceButtonMappings({ keyboardType, onSelectKey, selectedKey }: DeviceButtonMappingsProps) {
  const [applicationInfo, setApplicationInfo] = useState<Record<string, CodyboardApplicationInfo>>({});
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [recordingKey, setRecordingKey] = useState<XiaomiRemoteKey>();
  const [savingKey, setSavingKey] = useState<XiaomiRemoteKey>();
  const [savingScope, setSavingScope] = useState(false);
  const [selectedScopeId, setSelectedScopeId] = useState("global");
  const [error, setError] = useState<string>();
  const rowReferences = useRef<Partial<Record<XiaomiRemoteKey, HTMLElement | null>>>({});

  useEffect(() => {
    let mounted = true;
    void window.codyboard.profiles.snapshot().then((nextSnapshot) => {
      if (mounted) setSnapshot(nextSnapshot);
    });
    const unsubscribe = window.codyboard.profiles.onEvent((event) => {
      if (event.type === "changed") setSnapshot(event.snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    rowReferences.current[selectedKey]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  const activeProfile = keyboardType === undefined
    ? undefined
    : snapshot?.keyboards[String(keyboardType)]?.activeProfile;
  const applicationGroups = useMemo(
    () => activeProfile?.groups.filter(({ scope }) => scope.kind === "application") ?? [],
    [activeProfile],
  );
  const referencedApplicationBundleIds = useMemo(() => {
    const bundleIds = new Set<string>();
    for (const group of activeProfile?.groups ?? []) {
      if (group.scope.kind === "application") bundleIds.add(group.scope.bundleId);
      for (const mapping of group.mappings) {
        if (mapping.to.kind === "launchApplication") bundleIds.add(mapping.to.bundleId);
      }
    }
    return [...bundleIds];
  }, [activeProfile]);
  const selectedGroup = activeProfile?.groups.find(({ id }) => id === selectedScopeId)
    ?? activeProfile?.groups.find(({ scope }) => scope.kind === "global");

  useEffect(() => {
    setSelectedScopeId("global");
  }, [activeProfile?.id, keyboardType]);

  useEffect(() => {
    let mounted = true;
    for (const bundleId of referencedApplicationBundleIds) {
      void window.codyboard.applications.resolve(bundleId).then((info) => {
        if (!mounted || !info) return;
        setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      }).catch(() => undefined);
    }
    return () => { mounted = false; };
  }, [referencedApplicationBundleIds]);

  const mappings = useMemo(
    () => CONTROLS.map((control) => ({ control, mapping: findMapping(selectedGroup, control.input) })),
    [selectedGroup],
  );

  const saveOutput = async (control: DeviceControl, output: MappingOutput) => {
    if (keyboardType === undefined || !activeProfile || !selectedGroup) return;
    setError(undefined);
    setSavingKey(control.key);
    try {
      const draft = updateMapping(activeProfile, selectedGroup.id, control, output);
      setSnapshot(await window.codyboard.profiles.update(keyboardType, activeProfile.id, draft));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingKey(undefined);
      setRecordingKey(undefined);
    }
  };

  const changeScope = async (event: ChangeEvent<HTMLSelectElement>) => {
    const scopeId = event.target.value;
    if (scopeId !== "__add_application__") {
      setSelectedScopeId(scopeId);
      return;
    }
    if (keyboardType === undefined || !activeProfile) return;
    setError(undefined);
    setSavingScope(true);
    try {
      const info = await window.codyboard.applications.pick();
      if (!info) return;
      setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      const existing = activeProfile.groups.find(
        ({ scope }) => scope.kind === "application" && scope.bundleId === info.bundleId,
      );
      if (existing) {
        setSelectedScopeId(existing.id);
        return;
      }
      const draft = structuredClone(activeProfile);
      const groupId = applicationGroupId(info.bundleId, draft);
      draft.groups.push({ id: groupId, mappings: [], scope: { bundleId: info.bundleId, kind: "application" } });
      setSnapshot(await window.codyboard.profiles.update(keyboardType, activeProfile.id, draft));
      setSelectedScopeId(groupId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingScope(false);
    }
  };

  const chooseApplicationForControl = async (control: DeviceControl) => {
    setError(undefined);
    try {
      const info = await window.codyboard.applications.pick();
      if (!info) return;
      setApplicationInfo((current) => ({ ...current, [info.bundleId]: info }));
      await saveOutput(control, { bundleId: info.bundleId, kind: "launchApplication" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const changeAction = async (control: DeviceControl, mapping: KeyMapping | undefined, action: string) => {
    if (action === "launch") {
      await chooseApplicationForControl(control);
    } else if (mapping?.to.kind === "launchApplication") {
      await saveOutput(control, { kind: "suppress" });
    }
  };

  return (
    <section className="mapping-console" aria-label="Button mappings">
      <header className="mapping-console-header">
        <div className="mapping-console-title">
          <p>Button map</p>
          <h2>Controls</h2>
        </div>
        <label className="mapping-scope-select">
          <span>Configure for</span>
          <span className="mapping-select-shell">
            <select
              aria-label="Mapping scope"
              disabled={!activeProfile || savingScope}
              onChange={(event) => void changeScope(event)}
              value={selectedScopeId}
            >
              <option value="global">Global</option>
              {applicationGroups.map((group) => {
                const bundleId = group.scope.kind === "application" ? group.scope.bundleId : "";
                return <option key={group.id} value={group.id}>{applicationInfo[bundleId]?.name ?? bundleId}</option>;
              })}
              <option value="__add_application__">Add Specific Application…</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </span>
        </label>
      </header>

      <div className="mapping-console-guide">
        <span className="mapping-guide-index">01</span>
        <p>Choose an action, then record a shortcut or select an application. Press <strong>Backspace</strong> to block the button safely.</p>
      </div>

      {keyboardType === undefined && <PanelNotice>Keyboard Type is unavailable for this device.</PanelNotice>}
      {keyboardType !== undefined && snapshot && !activeProfile && <PanelNotice>Activate a profile to edit its buttons.</PanelNotice>}
      {error && <PanelNotice tone="error">{error}</PanelNotice>}

      <div className="mapping-list">
        {mappings.map(({ control, mapping }, index) => {
          const Icon = control.icon;
          const isSelected = selectedKey === control.key;
          const isRecording = recordingKey === control.key;
          const isSaving = savingKey === control.key;
          const launchOutput = mapping?.to.kind === "launchApplication" ? mapping.to : undefined;
          const launchApplication = launchOutput ? applicationInfo[launchOutput.bundleId] : undefined;
          return (
            <article
              className={`mapping-row ${isSelected ? "is-selected" : ""} ${isRecording ? "is-recording" : ""}`.trim()}
              key={control.key}
              onPointerDown={() => onSelectKey?.(control.key)}
              ref={(element) => { rowReferences.current[control.key] = element; }}
            >
              <span className="mapping-row-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="mapping-button-icon"><Icon aria-hidden="true" /></span>
              <span className="mapping-button-name">
                <strong>{control.label}</strong>
                <small>{mapping ? "Configured" : "Unassigned"}</small>
              </span>
              <label className="mapping-action-select">
                <span>Action</span>
                <span className="mapping-select-shell">
                  <select
                    aria-label={`${control.label} action`}
                    disabled={!activeProfile || isSaving}
                    onChange={(event) => void changeAction(control, mapping, event.target.value)}
                    value={launchOutput ? "launch" : "keystroke"}
                  >
                    <option value="keystroke">Key Press</option>
                    <option value="launch">Launch Application</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </label>
              {launchOutput
                ? (
                    <div className="launch-application-picker">
                      <span>Application</span>
                      <button
                        aria-label={`Choose application for ${control.label}`}
                        disabled={!activeProfile || isSaving}
                        onClick={() => void chooseApplicationForControl(control)}
                        type="button"
                      >
                        {launchApplication?.iconDataUrl
                          ? <img alt="" src={launchApplication.iconDataUrl} />
                          : <AppWindow aria-hidden="true" />}
                        <strong>{isSaving ? "Saving…" : launchApplication?.name ?? launchOutput.bundleId}</strong>
                      </button>
                    </div>
                  )
                : (
                    <label className="keystroke-recorder">
                      <span>Key Press</span>
                      <span className="key-press-combobox">
                        <input
                          aria-label={`${control.label} key press`}
                          className={mapping?.to.kind === "suppress" ? "is-suppressed" : ""}
                          disabled={!activeProfile || isSaving}
                          onBlur={() => setRecordingKey(undefined)}
                          onFocus={() => setRecordingKey(control.key)}
                          onKeyDown={(event) => void captureKeystroke(event, (output) => saveOutput(control, output))}
                          placeholder="Press keys"
                          readOnly
                          value={isSaving ? "Saving…" : describeOutput(mapping?.to)}
                        />
                        <span className="key-output-select">
                          <select
                            aria-label={`Choose a special key for ${control.label}`}
                            disabled={!activeProfile || isSaving}
                            onChange={(event) => {
                              const option = KEY_OUTPUT_OPTIONS.get(event.target.value);
                              if (option) void saveOutput(control, structuredClone(option.output));
                            }}
                            value=""
                          >
                            <option disabled value="">Choose a special key</option>
                            {KEY_OUTPUT_GROUPS.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <ChevronDown aria-hidden="true" />
                        </span>
                      </span>
                    </label>
                  )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PanelNotice({ children, tone = "neutral" }: { children: string; tone?: "error" | "neutral" }) {
  return <p className={`mapping-notice is-${tone}`}>{children}</p>;
}

function findMapping(group: ProfileDraft["groups"][number] | undefined, input: MappingInput): KeyMapping | undefined {
  if (!group) return undefined;
  const signature = inputSignature(input);
  return group.mappings.find(({ from }) => inputSignature(from) === signature);
}

function updateMapping(profile: ProfileDraft, groupId: string, control: DeviceControl, output: MappingOutput): ProfileDraft {
  const draft = structuredClone(profile);
  const group = draft.groups.find(({ id }) => id === groupId);
  if (!group) throw new Error("The selected mapping scope no longer exists.");
  const mapping = findMapping(group, control.input);
  if (mapping) mapping.to = output;
  else group.mappings.push({ id: mappingIdFor(group.id, control.key, draft), from: control.input, to: output });
  return draft;
}

function mappingIdFor(groupId: string, key: XiaomiRemoteKey, profile: ProfileDraft): string {
  const base = `${groupId}-${key.toLowerCase()}`;
  const ids = new Set(profile.groups.flatMap(({ mappings }) => mappings.map(({ id }) => id)));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function applicationGroupId(bundleId: string, profile: ProfileDraft): string {
  const base = `app-${bundleId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "application"}`;
  let candidate = base;
  let suffix = 2;
  while (profile.groups.some(({ id }) => id === candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function inputSignature(input: MappingInput): string {
  if (input.kind === "system") return `system:${input.key ?? input.systemCode}`;
  if (input.kind === "hidUsage") return `hidUsage:${input.usage}`;
  const modifiers = [...(input.modifiers ?? [])].sort().join("+");
  if (input.kind === "modifier") return `modifier:${input.key}:${modifiers}`;
  return `keyboard:${input.key ?? input.keyCode}:${modifiers}`;
}

function describeOutput(output: MappingOutput | undefined): string {
  if (!output) return "";
  const presetLabel = KEY_OUTPUT_LABELS.get(outputSignature(output));
  if (presetLabel) return presetLabel;
  if (output.kind === "suppress") return "No action";
  if (output.kind === "passthrough") return "Pass through";
  if (output.kind === "launchApplication") return output.bundleId;
  if (output.kind === "modifier") return output.key === "capsLock" ? "Caps Lock" : MODIFIER_GLYPHS[output.key];
  if (output.kind === "system") return output.key ?? `System ${output.systemCode}`;
  const modifiers = (output.modifiers ?? []).map((modifier) => MODIFIER_GLYPHS[modifier]);
  return [...modifiers, displayKey(output.key ?? `Key ${output.keyCode}`)].join("  ");
}

function outputSignature(output: MappingOutput): string {
  if (output.kind === "keyboard") {
    return `keyboard:${output.key ?? output.keyCode}:${[...(output.modifiers ?? [])].sort().join("+")}`;
  }
  if (output.kind === "modifier") {
    return `modifier:${output.key}:${[...(output.modifiers ?? [])].sort().join("+")}`;
  }
  if (output.kind === "system") return `system:${output.key ?? output.systemCode}`;
  if (output.kind === "launchApplication") return `launchApplication:${output.bundleId}`;
  return output.kind;
}

const MODIFIER_GLYPHS: Readonly<Record<HIDModifier, string>> = {
  command: "⌘",
  control: "⌃",
  fn: "fn",
  option: "⌥",
  shift: "⇧",
};

const NAMED_KEYS: Readonly<Record<string, string>> = {
  arrowDown: "↓",
  arrowLeft: "←",
  arrowRight: "→",
  arrowUp: "↑",
  backspace: "Backspace",
  deleteForward: "Delete",
  enter: "Enter",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
};

function displayKey(key: string): string {
  return NAMED_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

async function captureKeystroke(event: KeyboardEvent<HTMLInputElement>, save: (output: MappingOutput) => Promise<void>) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Backspace") {
    await save({ kind: "suppress" });
    return;
  }
  if (["Alt", "Control", "Fn", "Meta", "Shift"].includes(event.key)) return;
  const key = browserKey(event.key);
  if (!key) return;
  const modifiers: HIDModifier[] = [];
  if (event.metaKey) modifiers.push("command");
  if (event.ctrlKey) modifiers.push("control");
  if (event.altKey) modifiers.push("option");
  if (event.shiftKey) modifiers.push("shift");
  if (event.getModifierState("Fn")) modifiers.push("fn");
  await save({ kind: "keyboard", key, modifiers });
}

function browserKey(key: string): string | undefined {
  const named: Readonly<Record<string, string>> = {
    ArrowDown: "arrowDown",
    ArrowLeft: "arrowLeft",
    ArrowRight: "arrowRight",
    ArrowUp: "arrowUp",
    Delete: "deleteForward",
    Enter: "enter",
    Escape: "escape",
    Tab: "tab",
    " ": "space",
  };
  if (named[key]) return named[key];
  if (/^F(?:[1-9]|1\d|20)$/.test(key)) return key.toLowerCase();
  return key.length === 1 ? key.toLowerCase() : undefined;
}

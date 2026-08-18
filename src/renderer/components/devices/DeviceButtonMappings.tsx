import {
  AppWindow,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpFromLine,
  Bell,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  CaseUpper,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CirclePlay,
  Command,
  CornerDownLeft,
  Delete,
  Dock,
  FastForward,
  GalleryVerticalEnd,
  Globe2,
  Home,
  Keyboard,
  KeyboardOff,
  LockKeyhole,
  Menu,
  Minus,
  Monitor,
  Option,
  PanelTop,
  PictureInPicture,
  Plus,
  Redo2,
  RefreshCw,
  Rewind,
  Rocket,
  ScreenShare,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  SquareFunction,
  StickyNote,
  SunDim,
  SunMedium,
  Tv,
  Undo2,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type {
  CodyboardApplicationInfo,
  HIDModifier,
  KeyMapping,
  MappingInput,
  MappingOutput,
  ProfileDraft,
  ProfilesSnapshot,
} from "../../../shared/hid";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import { inheritGlobalMappings } from "./profile-draft";
import type { XiaomiRemoteKey } from "./XiaomiRemote";

interface DeviceControl {
  icon: LucideIcon;
  input: MappingInput;
  key: XiaomiRemoteKey;
  label: string;
}

interface KeyOutputOption {
  id: string;
  icon: LucideIcon;
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
      { icon: Volume2, id: "volume-up", label: "Volume Up", output: { kind: "system", key: "volumeUp" } },
      { icon: Volume1, id: "volume-down", label: "Volume Down", output: { kind: "system", key: "volumeDown" } },
      { icon: VolumeX, id: "mute", label: "Mute", output: { kind: "system", key: "mute" } },
      { icon: CirclePlay, id: "play-pause", label: "Play / Pause", output: { kind: "system", key: "playPause" } },
      { icon: SkipForward, id: "next-track", label: "Next Track", output: { kind: "system", key: "nextTrack" } },
      { icon: SkipBack, id: "previous-track", label: "Previous Track", output: { kind: "system", key: "previousTrack" } },
      { icon: FastForward, id: "fast-forward", label: "Fast Forward", output: { kind: "system", key: "fastForward" } },
      { icon: Rewind, id: "rewind", label: "Rewind", output: { kind: "system", key: "rewind" } },
      { icon: SunMedium, id: "brightness-up", label: "Display Brightness Up", output: { kind: "system", key: "brightnessUp" } },
      { icon: SunDim, id: "brightness-down", label: "Display Brightness Down", output: { kind: "system", key: "brightnessDown" } },
      { icon: Keyboard, id: "keyboard-brightness-up", label: "Keyboard Brightness Up", output: { kind: "system", key: "keyboardBrightnessUp" } },
      { icon: Keyboard, id: "keyboard-brightness-down", label: "Keyboard Brightness Down", output: { kind: "system", key: "keyboardBrightnessDown" } },
      { icon: KeyboardOff, id: "keyboard-brightness-toggle", label: "Keyboard Backlight Toggle", output: { kind: "system", key: "keyboardBrightnessToggle" } },
      { icon: ScreenShare, id: "video-mirroring", label: "Video Mirroring", output: { kind: "system", key: "videoMirror" } },
      { icon: ArrowUpFromLine, id: "eject", label: "Eject", output: { kind: "system", key: "eject" } },
    ],
  },
  {
    label: "System",
    options: [
      { icon: LockKeyhole, id: "lock-screen", label: "Lock Screen", output: { kind: "keyboard", key: "q", modifiers: ["command", "control"] } },
      { icon: GalleryVerticalEnd, id: "mission-control", label: "Mission Control", output: { kind: "keyboard", key: "arrowUp", modifiers: ["control"] } },
      { icon: AppWindow, id: "application-windows", label: "Application Windows", output: { kind: "keyboard", key: "arrowDown", modifiers: ["control"] } },
      { icon: ArrowLeft, id: "space-left", label: "Move Left a Space", output: { kind: "keyboard", key: "arrowLeft", modifiers: ["control"] } },
      { icon: ArrowRight, id: "space-right", label: "Move Right a Space", output: { kind: "keyboard", key: "arrowRight", modifiers: ["control"] } },
      { icon: Monitor, id: "show-desktop", label: "Show Desktop", output: { kind: "keyboard", key: "h", modifiers: ["fn"] } },
      { icon: Rocket, id: "launchpad", label: "Launchpad", output: { kind: "keyboard", key: "f4", modifiers: ["fn"] } },
      { icon: Search, id: "spotlight", label: "Spotlight", output: { kind: "keyboard", key: "space", modifiers: ["command"] } },
      { icon: Bell, id: "notification-center", label: "Notification Center", output: { kind: "keyboard", key: "n", modifiers: ["fn"] } },
      { icon: SlidersHorizontal, id: "control-center", label: "Control Center", output: { kind: "keyboard", key: "c", modifiers: ["fn"] } },
      { icon: Dock, id: "focus-dock", label: "Focus Dock", output: { kind: "keyboard", key: "a", modifiers: ["fn"] } },
      { icon: PanelTop, id: "focus-menu-bar", label: "Focus Menu Bar", output: { kind: "keyboard", key: "m", modifiers: ["fn"] } },
      { icon: StickyNote, id: "quick-note", label: "Quick Note", output: { kind: "keyboard", key: "q", modifiers: ["fn"] } },
      { icon: Smile, id: "emoji-symbols", label: "Emoji & Symbols", output: { kind: "keyboard", key: "e", modifiers: ["fn"] } },
      { icon: RefreshCw, id: "app-switcher", label: "Application Switcher", output: { kind: "keyboard", key: "tab", modifiers: ["command"] } },
      { icon: PictureInPicture, id: "next-window", label: "Next Window", output: { kind: "keyboard", key: "`", modifiers: ["command"] } },
    ],
  },
  {
    label: "Navigation",
    options: [
      {
        icon: Undo2,
        id: "browser-back",
        label: "Browser Back",
        output: { kind: "keyboard", key: "[", modifiers: ["command"] },
      },
      {
        icon: Redo2,
        id: "browser-forward",
        label: "Browser Forward",
        output: { kind: "keyboard", key: "]", modifiers: ["command"] },
      },
    ],
  },
  {
    label: "Special Keys",
    options: [
      { icon: Command, id: "command", label: "Command", output: { kind: "modifier", key: "command", modifiers: [] } },
      { icon: Option, id: "option", label: "Option", output: { kind: "modifier", key: "option", modifiers: [] } },
      { icon: ArrowUp, id: "control", label: "Control", output: { kind: "modifier", key: "control", modifiers: [] } },
      { icon: ChevronUp, id: "shift", label: "Shift", output: { kind: "modifier", key: "shift", modifiers: [] } },
      { icon: SquareFunction, id: "fn", label: "Fn", output: { kind: "modifier", key: "fn", modifiers: [] } },
      { icon: CaseUpper, id: "caps-lock", label: "Caps Lock", output: { kind: "modifier", key: "capsLock", modifiers: [] } },
      { icon: Delete, id: "escape", label: "Escape", output: { kind: "keyboard", key: "escape", modifiers: [] } },
      { icon: Delete, id: "delete-forward", label: "Forward Delete", output: { kind: "keyboard", key: "deleteForward", modifiers: [] } },
      { icon: BetweenHorizontalStart, id: "home", label: "Home", output: { kind: "keyboard", key: "home", modifiers: [] } },
      { icon: BetweenHorizontalEnd, id: "end", label: "End", output: { kind: "keyboard", key: "end", modifiers: [] } },
      { icon: ArrowUp, id: "page-up", label: "Page Up", output: { kind: "keyboard", key: "pageUp", modifiers: [] } },
      { icon: ArrowDown, id: "page-down", label: "Page Down", output: { kind: "keyboard", key: "pageDown", modifiers: [] } },
    ],
  },
  {
    label: "Function Keys",
    options: Array.from({ length: 20 }, (_, index): KeyOutputOption => ({
      id: `f${index + 1}`,
      icon: SquareFunction,
      label: `F${index + 1}`,
      output: { kind: "keyboard", key: `f${index + 1}`, modifiers: [] },
    })),
  },
];

const KEY_OUTPUT_OPTIONS = new Map(KEY_OUTPUT_GROUPS.flatMap(({ options }) => options.map((option) => [option.id, option])));
const KEY_OUTPUT_OPTIONS_BY_SIGNATURE = new Map(
  KEY_OUTPUT_GROUPS.flatMap(({ options }) => options.map((option) => [outputSignature(option.output), option])),
);
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

  const changeScope = async (scopeId: string) => {
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
      const mappings = inheritGlobalMappings(draft, groupId);
      draft.groups.push({ id: groupId, mappings, scope: { bundleId: info.bundleId, kind: "application" } });
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
        <div className="mapping-scope-select">
          <span>Configure for</span>
          <Select
            disabled={!activeProfile || savingScope}
            onValueChange={(value) => void changeScope(value)}
            value={selectedScopeId}
          >
            <SelectTrigger
              aria-label="Mapping scope"
              className="mapping-scope-trigger"
            >
              {selectedGroup?.scope.kind === "application"
                ? (
                    <ApplicationIdentity
                      bundleId={selectedGroup.scope.bundleId}
                      info={applicationInfo[selectedGroup.scope.bundleId]}
                    />
                  )
                : <span className="application-select-identity"><Globe2 aria-hidden="true" /><span>Global</span></span>}
            </SelectTrigger>
            <SelectContent align="end" className="mapping-scope-menu">
              <SelectItem value="global">
                <span className="application-select-identity"><Globe2 aria-hidden="true" /><span>Global</span></span>
              </SelectItem>
              {applicationGroups.map((group) => {
                const bundleId = group.scope.kind === "application" ? group.scope.bundleId : "";
                return (
                  <SelectItem key={group.id} value={group.id}>
                    <ApplicationIdentity bundleId={bundleId} info={applicationInfo[bundleId]} />
                  </SelectItem>
                );
              })}
              <SelectSeparator />
              <SelectItem className="is-add-application" value="__add_application__">
                <span className="application-select-identity"><Plus aria-hidden="true" /><span>Add Specific Application…</span></span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="mapping-console-guide">
        <span className="mapping-guide-index"><CircleHelp aria-hidden="true" /></span>
        <p>Choose an action, then record a shortcut or select an application. Press <strong>Backspace</strong> to block the button safely.</p>
      </div>

      {keyboardType === undefined && <PanelNotice>Keyboard Type is unavailable for this device.</PanelNotice>}
      {keyboardType !== undefined && snapshot && !activeProfile && <PanelNotice>Activate a profile to edit its buttons.</PanelNotice>}
      {error && <PanelNotice tone="error">{error}</PanelNotice>}

      <div className="mapping-list">
        {mappings.map(({ control, mapping }) => {
          const Icon = control.icon;
          const isSelected = selectedKey === control.key;
          const isRecording = recordingKey === control.key;
          const isSaving = savingKey === control.key;
          const launchOutput = mapping?.to.kind === "launchApplication" ? mapping.to : undefined;
          const launchApplication = launchOutput ? applicationInfo[launchOutput.bundleId] : undefined;
          const selectedOutputOption = mapping ? KEY_OUTPUT_OPTIONS_BY_SIGNATURE.get(outputSignature(mapping.to)) : undefined;
          const SelectedOutputIcon = selectedOutputOption?.icon;
          return (
            <article
              className={`mapping-row ${isSelected ? "is-selected" : ""} ${isRecording ? "is-recording" : ""}`.trim()}
              key={control.key}
              onPointerDown={() => onSelectKey?.(control.key)}
              ref={(element) => { rowReferences.current[control.key] = element; }}
            >
              <span className="mapping-button-icon"><Icon aria-hidden="true" /></span>
              <span className="mapping-button-name">
                <strong>{control.label}</strong>
                <small>{mapping ? "Configured" : "Unassigned"}</small>
              </span>
              <div className="mapping-action-select">
                <span>Action</span>
                <Select
                  disabled={!activeProfile || isSaving}
                  onValueChange={(value) => void changeAction(control, mapping, value)}
                  value={launchOutput ? "launch" : "keystroke"}
                >
                  <SelectTrigger
                    aria-label={`${control.label} action`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keystroke">Key Press</SelectItem>
                    <SelectItem value="launch">Launch Application</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                        {SelectedOutputIcon && (
                          <span className="key-output-current-icon"><SelectedOutputIcon aria-hidden="true" /></span>
                        )}
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
                          <Select
                            disabled={!activeProfile || isSaving}
                            onValueChange={(value) => {
                              const option = KEY_OUTPUT_OPTIONS.get(value);
                              if (option) void saveOutput(control, structuredClone(option.output));
                            }}
                            value=""
                          >
                            <SelectTrigger
                              aria-label={`Choose a special key for ${control.label}`}
                              className="key-output-trigger"
                            >
                              <span className="sr-only">Choose a special key</span>
                            </SelectTrigger>
                            <SelectContent align="end" className="key-output-menu">
                            {KEY_OUTPUT_GROUPS.map((group) => (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {group.options.map((option) => {
                                  const Icon = option.icon;
                                  return (
                                    <SelectItem key={option.id} value={option.id}>
                                      <span className="key-output-option"><Icon aria-hidden="true" /><span>{option.label}</span></span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectGroup>
                            ))}
                            </SelectContent>
                          </Select>
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

function ApplicationIdentity({ bundleId, info }: { bundleId: string; info?: CodyboardApplicationInfo }) {
  return (
    <span className="application-select-identity">
      {info?.iconDataUrl ? <img alt="" src={info.iconDataUrl} /> : <AppWindow aria-hidden="true" />}
      <span>{info?.name ?? bundleId}</span>
    </span>
  );
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

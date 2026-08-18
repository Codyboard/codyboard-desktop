import type {
  KeyMapping,
  KeyMappingGroup,
  MappingInput,
  MappingOutput,
  ProfileDraft,
} from "./hid";

export interface ResolvedProfileMapping {
  effective?: KeyMapping;
  inherited?: KeyMapping;
  override?: KeyMapping;
}

export function mappingInputSignature(input: MappingInput): string {
  if (input.kind === "system") return `system:${input.key ?? input.systemCode}`;
  if (input.kind === "hidUsage") return `hidUsage:${input.usage}`;
  const modifiers = [...(input.modifiers ?? [])].sort().join("+");
  if (input.kind === "modifier") return `modifier:${input.key}:${modifiers}`;
  return `keyboard:${input.key ?? input.keyCode}:${modifiers}`;
}

export function mappingOutputSignature(output: MappingOutput): string {
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

export function findProfileMapping(
  group: KeyMappingGroup | undefined,
  input: MappingInput,
): KeyMapping | undefined {
  const signature = mappingInputSignature(input);
  return group?.mappings.find(({ from }) => mappingInputSignature(from) === signature);
}

export function resolveProfileMapping(
  profile: ProfileDraft,
  group: KeyMappingGroup,
  input: MappingInput,
): ResolvedProfileMapping {
  const mapping = findProfileMapping(group, input);
  if (group.scope.kind === "global") return { effective: mapping, override: mapping };
  const inherited = findProfileMapping(globalGroup(profile), input);
  return {
    effective: mapping ?? inherited,
    inherited,
    override: mapping,
  };
}

export function setProfileMapping(
  profile: ProfileDraft,
  groupId: string,
  mapping: KeyMapping,
): ProfileDraft {
  const draft = structuredClone(profile);
  const group = draft.groups.find(({ id }) => id === groupId);
  if (!group) throw new Error("The selected mapping scope no longer exists.");

  const signature = mappingInputSignature(mapping.from);
  const existingIndex = group.mappings.findIndex(
    ({ from }) => mappingInputSignature(from) === signature,
  );
  if (group.scope.kind === "application") {
    const inherited = findProfileMapping(globalGroup(draft), mapping.from);
    if (inherited && mappingOutputSignature(inherited.to) === mappingOutputSignature(mapping.to)) {
      if (existingIndex >= 0) group.mappings.splice(existingIndex, 1);
      return normalizeApplicationMappings(draft);
    }
  }

  if (existingIndex >= 0) group.mappings[existingIndex] = mapping;
  else group.mappings.push(mapping);
  return normalizeApplicationMappings(draft);
}

export function removeProfileMappingOverride(
  profile: ProfileDraft,
  groupId: string,
  input: MappingInput,
): ProfileDraft {
  const draft = structuredClone(profile);
  const group = draft.groups.find(({ id }) => id === groupId);
  if (group?.scope.kind !== "application") {
    throw new Error("Only application mappings can be reset to Unchanged.");
  }
  const signature = mappingInputSignature(input);
  group.mappings = group.mappings.filter(
    ({ from }) => mappingInputSignature(from) !== signature,
  );
  return draft;
}

export function normalizeApplicationMappings(profile: ProfileDraft): ProfileDraft {
  const draft = structuredClone(profile);
  const global = globalGroup(draft);
  if (!global) return draft;
  const globalMappings = new Map(
    global.mappings.map((mapping) => [mappingInputSignature(mapping.from), mapping]),
  );

  for (const group of draft.groups) {
    if (group.scope.kind !== "application") continue;
    group.mappings = group.mappings.filter((mapping) => {
      const inherited = globalMappings.get(mappingInputSignature(mapping.from));
      return !inherited
        || mappingOutputSignature(inherited.to) !== mappingOutputSignature(mapping.to);
    });
  }
  return draft;
}

function globalGroup(profile: ProfileDraft): KeyMappingGroup | undefined {
  return profile.groups.find(({ scope }) => scope.kind === "global");
}

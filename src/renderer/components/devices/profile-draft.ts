import type { KeyMapping, ProfileDraft } from "../../../shared/hid";

export function inheritGlobalMappings(profile: ProfileDraft, groupId: string): KeyMapping[] {
  const globalGroup = profile.groups.find(({ scope }) => scope.kind === "global");
  if (!globalGroup) return [];

  const usedIds = new Set(profile.groups.flatMap(({ mappings }) => mappings.map(({ id }) => id)));
  return globalGroup.mappings.map((mapping) => {
    const inherited = structuredClone(mapping);
    inherited.id = uniqueMappingId(`${groupId}-${mapping.id}`, usedIds);
    return inherited;
  });
}

function uniqueMappingId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

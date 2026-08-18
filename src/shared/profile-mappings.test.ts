import { describe, expect, it } from "vitest";

import type { MappingInput, ProfileDraft } from "./hid";
import {
  removeApplicationMappingGroup,
  removeProfileMappingOverride,
  resolveProfileMapping,
  setProfileMapping,
} from "./profile-mappings";

const profile: ProfileDraft = {
  groups: [
    {
      id: "global",
      mappings: [
        {
          from: { key: "arrowLeft", kind: "keyboard", modifiers: ["fn"] },
          id: "global-left",
          to: { key: "arrowLeft", kind: "keyboard", modifiers: ["control"] },
        },
      ],
      scope: { kind: "global" },
    },
    {
      id: "codex",
      mappings: [],
      scope: { bundleId: "com.openai.codex", kind: "application" },
    },
  ],
  id: "default",
  name: "Default",
};

const input: MappingInput = { key: "arrowLeft", kind: "keyboard", modifiers: ["fn"] };

describe("sparse application mappings", () => {
  it("resolves an absent application mapping from global", () => {
    const resolution = resolveProfileMapping(profile, profile.groups[1], input);
    expect(resolution.override).toBeUndefined();
    expect(resolution.effective?.id).toBe("global-left");
  });

  it("stores a different override", () => {
    const updated = setProfileMapping(profile, "codex", {
      from: input,
      id: "codex-left",
      to: { key: "b", kind: "keyboard", modifiers: ["command"] },
    });
    expect(updated.groups[1].mappings).toHaveLength(1);
    expect(resolveProfileMapping(updated, updated.groups[1], input).effective?.id).toBe("codex-left");
  });

  it("does not store an output equivalent to global", () => {
    const updated = setProfileMapping(profile, "codex", {
      from: input,
      id: "codex-left",
      to: { key: "arrowLeft", kind: "keyboard", modifiers: ["control"] },
    });
    expect(updated.groups[1].mappings).toEqual([]);
  });

  it("removes an override when reset to Unchanged", () => {
    const overridden = setProfileMapping(profile, "codex", {
      from: input,
      id: "codex-left",
      to: { key: "b", kind: "keyboard", modifiers: ["command"] },
    });
    expect(removeProfileMappingOverride(overridden, "codex", input).groups[1].mappings).toEqual([]);
  });

  it("removes an application specification without changing global mappings", () => {
    const updated = removeApplicationMappingGroup(profile, "codex");
    expect(updated.groups).toEqual([profile.groups[0]]);
    expect(profile.groups).toHaveLength(2);
  });

  it("does not remove the global mapping group", () => {
    expect(() => removeApplicationMappingGroup(profile, "global"))
      .toThrow("Only application specifications can be removed.");
  });

  it("prunes overrides made redundant by a global change", () => {
    const overridden = setProfileMapping(profile, "codex", {
      from: input,
      id: "codex-left",
      to: { key: "b", kind: "keyboard", modifiers: ["command"] },
    });
    const updated = setProfileMapping(overridden, "global", {
      from: input,
      id: "global-left",
      to: { key: "b", kind: "keyboard", modifiers: ["command"] },
    });
    expect(updated.groups[1].mappings).toEqual([]);
  });
});

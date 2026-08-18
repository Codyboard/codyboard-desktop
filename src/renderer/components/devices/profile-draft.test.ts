import { describe, expect, it } from "vitest";

import type { ProfileDraft } from "../../../shared/hid";

import { inheritGlobalMappings } from "./profile-draft";

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
      id: "existing-app",
      mappings: [
        {
          from: { key: "arrowRight", kind: "keyboard", modifiers: ["fn"] },
          id: "app-new-global-left",
          to: { key: "arrowRight", kind: "keyboard", modifiers: ["control"] },
        },
      ],
      scope: { bundleId: "com.example.existing", kind: "application" },
    },
  ],
  id: "default",
  name: "Default",
};

describe("inheritGlobalMappings", () => {
  it("copies global mappings with unique IDs and independent values", () => {
    const inherited = inheritGlobalMappings(profile, "app-new");

    expect(inherited).toEqual([
      {
        from: { key: "arrowLeft", kind: "keyboard", modifiers: ["fn"] },
        id: "app-new-global-left-2",
        to: { key: "arrowLeft", kind: "keyboard", modifiers: ["control"] },
      },
    ]);

    inherited[0].to = { kind: "suppress" };
    expect(profile.groups[0].mappings[0].to).toEqual({
      key: "arrowLeft",
      kind: "keyboard",
      modifiers: ["control"],
    });
  });
});

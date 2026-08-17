import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CompiledProfileSet, ProfileDraft } from "../shared/hid.js";

import { ProfileCoordinator } from "./profile-coordinator.js";

class FakeDaemon {
  snapshots: CompiledProfileSet[] = [];
  async replaceProfiles(snapshot: CompiledProfileSet) {
    this.snapshots.push(snapshot);
    return { generation: snapshot.generation, listening: snapshot.profiles.length > 0 };
  }
}

const draft: ProfileDraft = {
  id: "presenter",
  name: "Presenter",
  groups: [{ id: "global", scope: { kind: "global" }, mappings: [] }]
};

describe("ProfileCoordinator", () => {
  it("stores one file per profile and one shared active setting", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "codyboard-profile-test-"));
    const root = path.join(temporary, ".codyboard", "profiles");
    const daemon = new FakeDaemon();
    const service = new ProfileCoordinator(daemon, root);
    await service.load();
    const created = await service.create(40, draft);
    expect(created.keyboards["40"].activeProfile?.id).toBe("presenter");
    expect(await readFile(path.join(root, "hid-40", "presenter.yaml"), "utf8")).toContain("id: presenter");
    expect(await readFile(path.join(temporary, ".codyboard", "settings.yaml"), "utf8")).toContain("activeProfile: presenter");

    await service.create(40, { ...draft, id: "second", name: "Second" });
    expect(service.snapshot().keyboards["40"].activeProfile?.id).toBe("presenter");
    await service.activate(40, "second");
    expect(service.snapshot().keyboards["40"].activeProfile?.id).toBe("second");
    await service.remove(40, "second");
    expect(service.snapshot().keyboards["40"].activeProfile).toBeUndefined();
    expect(daemon.snapshots.at(-1)?.profiles).toHaveLength(0);
  });
});

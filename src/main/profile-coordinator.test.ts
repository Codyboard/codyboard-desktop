import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

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
  it("preserves capitalization and spaces in physical device names", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "codyboard-device-name-test-"));
    const root = path.join(temporary, ".codyboard", "profiles");
    const daemon = new FakeDaemon();
    const service = new ProfileCoordinator(daemon, root);
    await service.load();

    const created = await service.create("Sweep Pro", { ...draft, id: "default" });

    expect(created.keyboards["device:Sweep Pro"].activeProfile?.id).toBe("default");
    expect(await readFile(path.join(root, "device-Sweep Pro", "default.yaml"), "utf8"))
      .toContain("id: default");
    expect(daemon.snapshots.at(-1)?.profiles[0]?.deviceId).toBe("Sweep Pro");

    const reloaded = await new ProfileCoordinator(new FakeDaemon(), root).load();
    expect(reloaded.keyboards["device:Sweep Pro"].activeProfile?.id).toBe("default");
  });

  it("stores a physical device profile under its device id", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "codyboard-device-profile-test-"));
    const root = path.join(temporary, ".codyboard", "profiles");
    const daemon = new FakeDaemon();
    const service = new ProfileCoordinator(daemon, root);
    await service.load();

    const created = await service.create("vid-1d50-pid-615e", { ...draft, id: "default" });

    expect(created.keyboards["device:vid-1d50-pid-615e"].activeProfile?.id).toBe("default");
    expect(await readFile(path.join(root, "device-vid-1d50-pid-615e", "default.yaml"), "utf8"))
      .toContain("id: default");
    expect(daemon.snapshots.at(-1)?.profiles[0]).toMatchObject({
      deviceId: "vid-1d50-pid-615e",
      profileId: "default",
    });
  });

  it("stores one file per profile and one shared active setting", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "codyboard-profile-test-"));
    const root = path.join(temporary, ".codyboard", "profiles");
    const daemon = new FakeDaemon();
    const service = new ProfileCoordinator(daemon, root);
    await service.load();
    const created = await service.create("0x100004baa", draft);
    expect(created.keyboards["device:0x100004baa"].activeProfile?.id).toBe("presenter");
    expect(await readFile(path.join(root, "device-0x100004baa", "presenter.yaml"), "utf8")).toContain("id: presenter");
    expect(await readFile(path.join(temporary, ".codyboard", "settings.yaml"), "utf8")).toContain("activeProfile: presenter");

    await service.create("0x100004baa", { ...draft, id: "second", name: "Second" });
    expect(service.snapshot().keyboards["device:0x100004baa"].activeProfile?.id).toBe("presenter");
    await service.activate("0x100004baa", "second");
    expect(service.snapshot().keyboards["device:0x100004baa"].activeProfile?.id).toBe("second");
    await service.remove("0x100004baa", "second");
    expect(service.snapshot().keyboards["device:0x100004baa"].activeProfile).toBeUndefined();
    expect(daemon.snapshots.at(-1)?.profiles).toHaveLength(0);
  });

  it("migrates redundant application mappings while loading", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "codyboard-profile-migration-test-"));
    const root = path.join(temporary, ".codyboard", "profiles");
    const profilePath = path.join(root, "device-0x100004baa", "presenter.yaml");
    const redundant: ProfileDraft = {
      ...draft,
      groups: [
        {
          id: "global",
          mappings: [{
            from: { key: "arrowLeft", kind: "keyboard", modifiers: ["fn"] },
            id: "global-left",
            to: { key: "b", kind: "keyboard", modifiers: ["command"] },
          }],
          scope: { kind: "global" },
        },
        {
          id: "codex",
          mappings: [
            {
              from: { key: "arrowLeft", kind: "keyboard", modifiers: ["fn"] },
              id: "codex-left-copy",
              to: { key: "b", kind: "keyboard", modifiers: ["command"] },
            },
            {
              from: { key: "arrowRight", kind: "keyboard", modifiers: ["fn"] },
              id: "codex-right",
              to: { key: "l", kind: "keyboard", modifiers: ["command"] },
            },
          ],
          scope: { bundleId: "com.openai.codex", kind: "application" },
        },
      ],
    };
    await mkdir(path.dirname(profilePath), { recursive: true });
    await writeFile(profilePath, stringify(redundant));

    const service = new ProfileCoordinator(new FakeDaemon(), root);
    const snapshot = await service.load();
    const application = snapshot.keyboards["device:0x100004baa"].profiles[0].groups[1];
    expect(application.mappings.map(({ id }) => id)).toEqual(["codex-right"]);

    const persisted = parse(await readFile(profilePath, "utf8")) as ProfileDraft;
    expect(persisted.groups[1].mappings.map(({ id }) => id)).toEqual(["codex-right"]);
  });
});

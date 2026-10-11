import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { packager } from "@electron/packager";

const projectDirectory = process.cwd();
const releaseDirectory = path.join(projectDirectory, "release");
const applicationPath = path.join(releaseDirectory, "Codyboard.app");
const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "codyboard-package-"));
const stagedApplicationDirectory = path.join(stagingDirectory, "app");

try {
  await mkdir(stagedApplicationDirectory, { recursive: true });
  await Promise.all([
    cp(path.join(projectDirectory, "dist"), path.join(stagedApplicationDirectory, "dist"), { recursive: true }),
    cp(path.join(projectDirectory, "dist-electron"), path.join(stagedApplicationDirectory, "dist-electron"), { recursive: true }),
    cp(path.join(projectDirectory, "package.json"), path.join(stagedApplicationDirectory, "package.json")),
    cp(path.join(projectDirectory, "pnpm-lock.yaml"), path.join(stagedApplicationDirectory, "pnpm-lock.yaml")),
    cp(path.join(projectDirectory, "pnpm-workspace.yaml"), path.join(stagedApplicationDirectory, "pnpm-workspace.yaml")),
  ]);
  await run("pnpm", ["install", "--prod", "--offline", "--ignore-scripts", "--frozen-lockfile"], stagedApplicationDirectory);

  await rm(releaseDirectory, { force: true, recursive: true });
  await mkdir(releaseDirectory, { recursive: true });
  const outputDirectories = await packager({
    arch: "arm64",
    appBundleId: "com.codyboard.desktop",
    appCategoryType: "public.app-category.utilities",
    asar: true,
    dir: stagedApplicationDirectory,
    electronVersion: "43.4.0",
    executableName: "Codyboard",
    extendInfo: {
      NSBluetoothAlwaysUsageDescription: "Codyboard connects to the Xiaomi voice remote to receive microphone audio.",
      NSInputMonitoringUsageDescription: "Codyboard monitors supported hardware controls for device mappings.",
    },
    extraResource: [
      path.join(projectDirectory, "resources", "bin"),
      path.join(projectDirectory, "resources", "default-config"),
      path.join(projectDirectory, "resources", "tray-iconTemplate.png"),
    ],
    ignore: [/pnpm-lock\.yaml$/, /pnpm-workspace\.yaml$/],
    icon: path.join(projectDirectory, "resources", "app-icon.icns"),
    name: "Codyboard",
    out: releaseDirectory,
    overwrite: true,
    platform: "darwin",
    prune: false,
  });

  if (outputDirectories.length !== 1) {
    throw new Error(`Expected one packaged application, received ${outputDirectories.length}`);
  }

  const packagedDirectory = outputDirectories[0];
  await rename(path.join(packagedDirectory, "Codyboard.app"), applicationPath);
  await rm(packagedDirectory, { force: true, recursive: true });
  await run("codesign", ["--force", "--deep", "--sign", "-", applicationPath]);

  console.info(applicationPath);
} finally {
  await rm(stagingDirectory, { force: true, recursive: true });
}

function run(command, args, cwd = projectDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

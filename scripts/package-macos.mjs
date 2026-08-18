import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { packager } from "@electron/packager";

const projectDirectory = process.cwd();
const releaseDirectory = path.join(projectDirectory, "release");
const applicationPath = path.join(releaseDirectory, "Codyboard.app");
const escapedProjectDirectory = projectDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });

const outputDirectories = await packager({
  arch: "arm64",
  appBundleId: "com.codyboard.desktop",
  appCategoryType: "public.app-category.utilities",
  asar: true,
  dir: projectDirectory,
  executableName: "Codyboard",
  extraResource: [
    path.join(projectDirectory, "resources", "bin"),
    path.join(projectDirectory, "resources", "default-config"),
    path.join(projectDirectory, "resources", "tray-iconTemplate.png"),
  ],
  ignore: [
    new RegExp(`${escapedProjectDirectory}/(?:native|release|resources|scripts|src)(?:/|$)`),
    new RegExp(`${escapedProjectDirectory}/(?:AGENTS\\.md|eslint\\.config\\.mjs|pnpm-lock\\.yaml|postcss\\.config\\.js|tailwind\\.config\\.js|tsconfig\\.json|vite\\.config\\.ts)$`),
  ],
  name: "Codyboard",
  osxSign: { identity: null },
  out: releaseDirectory,
  overwrite: true,
  platform: "darwin",
  prune: true,
});

if (outputDirectories.length !== 1) {
  throw new Error(`Expected one packaged application, received ${outputDirectories.length}`);
}

const packagedDirectory = outputDirectories[0];
await rename(path.join(packagedDirectory, "Codyboard.app"), applicationPath);
await rm(packagedDirectory, { force: true, recursive: true });

console.info(applicationPath);

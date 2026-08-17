import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const configuration = process.env.NODE_ENV === "development" ? "debug" : "release";
const moduleCachePath = path.resolve("native", ".build", "module-cache");

await new Promise((resolve, reject) => {
  const child = spawn("swift", ["build", "--package-path", "native", "-c", configuration], {
    stdio: "inherit",
    env: { ...process.env, CLANG_MODULE_CACHE_PATH: moduleCachePath }
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`swift build exited with ${code}`)));
});

await mkdir("resources/bin", { recursive: true });
await cp(path.join("native", ".build", configuration, "CodyboardDaemon"), "resources/bin/CodyboardDaemon");

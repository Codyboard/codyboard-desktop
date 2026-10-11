import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  path.join(root, "resources", "bin", "CodyboardDaemon"),
  path.join(root, "native", ".build", "debug", "CodyboardDaemon"),
];
const executable = candidates.find((candidate) => existsSync(candidate));
if (!executable) {
  console.error("CodyboardDaemon was not found. Run pnpm build:native first.");
  process.exit(1);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.info("Usage: pnpm diagnostics:keyboard [keyboardType]");
  console.info("Default keyboard type: 40 (Xiaomi presenter)");
  process.exit(0);
}

const keyboardType = Number(process.argv[2] ?? 40);
if (!Number.isInteger(keyboardType) || keyboardType < 0) {
  console.error("Usage: pnpm diagnostics:keyboard [keyboardType]");
  process.exit(1);
}

const daemon = spawn(executable, [], { stdio: ["pipe", "pipe", "inherit"] });
const output = readline.createInterface({ input: daemon.stdout });
let sequence = 0;

output.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.event === "diagnosticKey") {
      console.info(JSON.stringify(message.data));
    } else if (message.event === "error") {
      console.error(JSON.stringify(message.error));
    } else if (message.id) {
      console.error(JSON.stringify(message));
    }
  } catch {
    console.error(line);
  }
});

const request = (method, params = {}) => {
  const id = String(++sequence);
  daemon.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
};

request("diagnostics.set", { keyboardType });
console.error(`Listening for keyboard type ${keyboardType}. Press Ctrl-C to stop.`);

const stop = () => {
  request("diagnostics.set");
  setTimeout(() => daemon.kill("SIGTERM"), 100);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
daemon.once("exit", (code) => process.exit(code ?? 0));

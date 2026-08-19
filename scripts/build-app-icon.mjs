import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectDirectory = process.cwd();
const sourcePath = path.join(projectDirectory, "resources", "app-icon.png");
const outputPath = path.join(projectDirectory, "resources", "app-icon.icns");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "codyboard-app-icon-"));
const representations = [
  { size: 16, type: "icp4" },
  { size: 32, type: "icp5" },
  { size: 64, type: "icp6" },
  { size: 128, type: "ic07" },
  { size: 256, type: "ic08" },
  { size: 512, type: "ic09" },
  { size: 1024, type: "ic10" },
];

try {
  const chunks = [];
  for (const representation of representations) {
    const pngPath = path.join(temporaryDirectory, `${representation.size}.png`);
    await run("sips", [
      "-z",
      String(representation.size),
      String(representation.size),
      sourcePath,
      "--out",
      pngPath,
    ]);
    const png = await readFile(pngPath);
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(representation.type, 0, "ascii");
    chunkHeader.writeUInt32BE(chunkHeader.length + png.length, 4);
    chunks.push(chunkHeader, png);
  }

  const payloadLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(header.length + payloadLength, 4);
  await writeFile(outputPath, Buffer.concat([header, ...chunks]));
  console.info(outputPath);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectDirectory, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

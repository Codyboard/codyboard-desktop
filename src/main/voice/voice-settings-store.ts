import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

import type { VoiceSettings } from "../../shared/hid.js";
import { withSettingsFileLock } from "../settings/settings-file-lock.js";

const voiceSettingsSchema = z.object({
  audioDeviceUID: z.string().min(1).optional(),
  enabled: z.boolean().default(false),
  gainDB: z.number().min(-24).max(24).default(0),
  targetIdentifier: z.string().min(1).optional(),
}).strict();

const settingsDocumentSchema = z.object({
  version: z.literal(1),
  voice: voiceSettingsSchema.default({
    audioDeviceUID: "CodyboardVirtualMicrophone2ch_UID",
    enabled: false,
    gainDB: 0,
  }),
}).passthrough();

export const defaultVoiceSettings: VoiceSettings = {
  audioDeviceUID: "CodyboardVirtualMicrophone2ch_UID",
  enabled: false,
  gainDB: 0,
};

export class VoiceSettingsStore {
  constructor(readonly file: string) {}

  async load(): Promise<VoiceSettings> {
    return withSettingsFileLock(this.file, async () => {
      const document = await this.readDocument();
      return { ...structuredClone(document.voice), gainDB: 0 };
    });
  }

  async persist(settings: VoiceSettings): Promise<void> {
    const parsed = voiceSettingsSchema.parse({ ...settings, gainDB: 0 });
    await withSettingsFileLock(this.file, async () => {
      const document = await this.readDocument();
      await this.writeAtomic(stringify({ ...document, voice: parsed }));
    });
  }

  private async readDocument() {
    try {
      return settingsDocumentSchema.parse(parse(await readFile(this.file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return settingsDocumentSchema.parse({ version: 1 });
      throw error;
    }
  }

  private async writeAtomic(contents: string): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.file);
  }
}

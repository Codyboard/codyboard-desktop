import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { CodyboardApplicationInfo } from '../../shared/hid.js';

const execFileAsync = promisify(execFile);
const MAX_COMMAND_OUTPUT = 2 * 1024 * 1024;

export async function applicationInfoAt(
  applicationPath: string,
): Promise<CodyboardApplicationInfo> {
  if (path.extname(applicationPath).toLowerCase() !== '.app')
    throw new Error('Select a macOS application.');

  const plist = await readApplicationPlist(applicationPath);
  const bundleId = stringValue(plist.CFBundleIdentifier);
  if (!bundleId)
    throw new Error('The selected application has no bundle identifier.');

  return {
    bundleId,
    iconDataUrl: await applicationIconDataUrl(applicationPath, plist),
    name:
      stringValue(plist.CFBundleDisplayName) ||
      stringValue(plist.CFBundleName) ||
      path.basename(applicationPath, '.app'),
    path: applicationPath,
  };
}

export async function resolveApplication(
  bundleId: string,
): Promise<CodyboardApplicationInfo | undefined> {
  if (!bundleId.trim()) return undefined;
  const escaped = bundleId.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const { stdout } = await execFileAsync(
    '/usr/bin/mdfind',
    [`kMDItemCFBundleIdentifier == "${escaped}"c`],
    { maxBuffer: MAX_COMMAND_OUTPUT },
  );
  const candidates = stdout
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.endsWith('.app'))
    .sort((left, right) => left.length - right.length);

  for (const candidate of candidates) {
    try {
      const info = await applicationInfoAt(candidate);
      if (info.bundleId === bundleId) return info;
    } catch {
      // Spotlight may include stale or inaccessible application paths.
    }
  }
  return undefined;
}

async function readApplicationPlist(
  applicationPath: string,
): Promise<Record<string, unknown>> {
  const plistPath = path.join(applicationPath, 'Contents', 'Info.plist');
  const { stdout } = await execFileAsync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', plistPath],
    { maxBuffer: MAX_COMMAND_OUTPUT },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function applicationIconDataUrl(
  applicationPath: string,
  plist: Record<string, unknown>,
): Promise<string> {
  const declaredIcon = stringValue(plist.CFBundleIconFile);
  if (!declaredIcon) return '';

  const iconFile = path.extname(declaredIcon)
    ? declaredIcon
    : `${declaredIcon}.icns`;
  const iconPath = path.join(
    applicationPath,
    'Contents',
    'Resources',
    path.basename(iconFile),
  );
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'codyboard-app-icon-'),
  );
  const pngPath = path.join(temporaryDirectory, 'icon.png');
  try {
    await execFileAsync(
      '/usr/bin/sips',
      ['-Z', '128', '-s', 'format', 'png', iconPath, '--out', pngPath],
      { maxBuffer: MAX_COMMAND_OUTPUT },
    );
    const png = await readFile(pngPath);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    // An unreadable icon should never prevent an application scope from loading.
    return '';
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

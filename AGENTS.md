# Codyboard Desktop Agent Notes

## Tooling

- Use `pnpm` exclusively for JavaScript dependencies and scripts. Do not use npm or Yarn.
- Use `uv` instead of `pip` for Python work.

## Architecture

- The desktop shell is Electron + React + TypeScript. It normally runs headless with a system tray; the tray menu contains Settings and Quit.
- macOS keyboard capture, matching, and rewriting belong in the long-lived Swift `CodyboardDaemon` process. Keep the Event Tap hot path free of file and cross-process lookups.
- Keep native capture alive for the full Electron app lifecycle, including while the main window is hidden and only the system tray remains.
- The Event Tap listens for `keyDown`, `keyUp`, `flagsChanged`, and `systemDefined`; auxiliary controls such as volume and media keys are exposed as `systemdefined` events.
- The renderer API is object-oriented around `codyboard.profiles`, `ProfileManager`, and stable per-type `KeyboardProfileCollection` objects.
- Use `listHIDs()` to retrieve the live list of physical keyboard HID devices and their IORegistry IDs. Virtual devices such as Karabiner are excluded by default; pass `{ includeVirtual: true }` only for diagnostics.
- Keyboard type means `CGEventField.keyboardEventKeyboardType`; Codyboard Presenter uses type `40` (`46` is the user's Magic Keyboard).
- A keyboard type cannot uniquely identify multiple physical devices. Future per-device selection must use IOHID identity such as registry ID, vendor/product IDs, or serial number.

## Profile storage

- Store one profile per YAML file under `~/.codyboard/profiles/hid-{type}/{profile-id}.yaml`.
- Store the single active profile per keyboard type in the shared `~/.codyboard/settings.yaml`; this file may hold future app settings too.
- Do not watch these files. Read them at startup or explicit reload and write them only through the profile API.
- On a genuinely fresh installation, seed the bundled active type 40 default profile once. Never recreate it after the user has established settings or a profiles directory.
- With no active profiles, the Swift daemon must not create an Event Tap or request Accessibility permission.
- The current React + Tailwind + shadcn-style settings UI is disposable and will be rewritten.

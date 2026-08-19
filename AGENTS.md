# Codyboard Desktop Agent Notes

## Tooling

- Use `pnpm` exclusively for JavaScript dependencies and scripts. Do not use npm or Yarn.
- Use `uv` instead of `pip` for Python work.
- Run `pnpm lint` before handing off TypeScript or React changes. ESLint uses typed rules and alphabetized `import-x/order`; use `pnpm lint:fix` for mechanical fixes.
- The Husky pre-commit hook runs `lint-staged`; keep staged JavaScript and TypeScript files auto-fixable by ESLint.
- Before handing off implementation changes, run `pnpm lint`, `pnpm test`, `pnpm test:native`, and `pnpm build` unless the change clearly cannot affect that layer.

## Documentation

- Keep `README.md` user-facing and accurate for the latest released behavior. Do not expose internal implementation identifiers unless they help users build or diagnose the app.
- Store repository screenshots under `docs/screenshots/` with descriptive kebab-case names. Never reference clipboard, `/tmp`, or other machine-local paths from committed Markdown.
- Verify screenshot dimensions and visible content before committing. Do not add blank, corrupted, secret-bearing, or user-identifying screenshots.
- Use repository-relative image paths so screenshots render on GitHub and in local Markdown viewers.
- When commands, permissions, supported hardware, or profile storage change, update the corresponding README section in the same change.

## Architecture

- The desktop shell is Electron + React + TypeScript. It normally runs headless with a system tray; the tray menu contains Get Funky, Settings, permissions, and Quit.
- macOS keyboard capture, matching, and rewriting belong in the long-lived Swift `CodyboardDaemon` process. Keep the Event Tap hot path free of file and cross-process lookups.
- `CodyboardDaemonClient` owns the Swift subprocess and JSON-lines request/response transport. Do not put profile or HID domain policy back into this transport class.
- `ProfileCoordinator` is the Electron main-process cold-path owner for YAML persistence, validation, compilation, atomic daemon snapshot replacement, and rollback.
- The Swift package, executable target, source module, and test module are all named `CodyboardDaemon`; do not reintroduce the former `CodyboardHIDHelper` naming.
- Keep native capture alive for the full Electron app lifecycle, including while the main window is hidden and only the system tray remains.
- The Event Tap listens for `keyDown`, `keyUp`, `flagsChanged`, and `systemDefined`; auxiliary controls such as volume and media keys are exposed as `systemdefined` events.
- The renderer API is object-oriented around `codyboard.profiles`, `ProfileManager`, and stable per-type `KeyboardProfileCollection` objects.
- Use `listHIDs()` to retrieve the live list of physical keyboard HID devices and their IORegistry IDs. Virtual devices such as Karabiner are excluded by default; pass `{ includeVirtual: true }` only for diagnostics.
- Keyboard type means `CGEventField.keyboardEventKeyboardType`; Codyboard Presenter uses type `40` (`46` is the user's Magic Keyboard).
- A keyboard type cannot uniquely identify multiple physical devices. Future per-device selection must use IOHID identity such as registry ID, vendor/product IDs, or serial number.
- Treat raw remote-only controls such as Power and Back as HID usages when possible. Do not assume their synthesized macOS keycodes uniquely identify the physical button.

## Renderer

- The settings window opens centered at 16:10 within 75% of the primary display work area, then remains freely resizable without a locked aspect ratio. The renderer uses a single `index.html` entry with `HashRouter`: `/permissions` is the permission gate, `/` selects a connected device, `/devices/:deviceId` shows its details, and `/midi` hosts Get Funky.
- Accessibility and Input Monitoring are hard gates for device routes. Read their actual state from Swift, never infer success in React; permission actions register the native request and open the corresponding macOS System Settings pane.
- Use the macOS `hiddenInset` title-bar style: hide standard window chrome but keep the native traffic lights. The window and page surfaces are translucent. Appearance is an explicit sun/moon Light/Dark choice stored in `localStorage`; do not follow the system appearance and do not force a Tailwind `.dark` class.
- The selection and detail pages share `AppToolbar`, with page identity on the left and the appearance switch on the right. Detail pages add their back navigation to the same toolbar.
- `AppToolbar` is exactly 60px tall. Its title group uses a 3px downward optical adjustment for glyphs with descenders, and the native traffic lights are centered on the same header axis.
- Keep the device-selection header compact like a desktop application, not an oversized marketing hero. Every device card is a strict 1:1 square.
- When no supported hardware is found, show the designed empty state with supported-model guidance and a working rescan action; do not leave a bare diagnostic message.
- Supported-device filtering is exact VID/PID matching: 小米蓝牙语音遥控器 is `0x2717/0x32B8`; Sweep Pro is `0x1D50/0x615E`.
- `Device` is the TSX boundary for a physical-device view and receives a `keyboardType` prop for internal device behavior; do not display that implementation identifier in the device UI or hardcode it inside the remote renderer.
- `XiaomiRemote` exposes `onKeyPress` for both `down` and `up` phases and must provide pressed/released visual feedback for pointer and real type-40 hardware events.
- `SweepPro` is the dedicated renderer for the 15-key board, side keys, and rotary control; keep its hardware mapping and visual behavior separate from `XiaomiRemote`.
- The current React + Tailwind + shadcn-style settings UI is disposable and will be rewritten. Keep domain behavior outside visual components.

## Get Funky MIDI

- The tray item is always named `Get Funky 🪩` and opens `/midi`. This is a public feature, not an easter egg, and it must remain usable without connected hardware or macOS input permissions through the on-screen Sweep Pro.
- MIDI renderer code lives under `src/renderer/features/midi/`: `MidiPage` owns feature lifecycle and hardware discovery, `MidiHud` owns readouts, `MidiVisualizer` owns Three.js, `audio-engine` owns scheduling/state, `audio-voices` owns Web Audio synthesis, and `midi-templates`, `harmony`, and `sequencer` contain data and pure domain logic.
- Get Funky starts playing immediately when opened. Do not add a welcome/boot screen or require Enter, Space, or another gesture. The BrowserWindow uses `autoplayPolicy: "no-user-gesture-required"`; hiding or leaving the page must pause/dispose audio, timers, RAF callbacks, Three.js resources, and hardware capture.
- `MidiPage` polls `listHIDs()` every two seconds for exact Sweep Pro VID/PID `0x1D50/0x615E`. It stays in virtual mode when absent or when permissions are missing, automatically captures a newly available device, and releases capture on disconnect, visibility loss, unmount, renderer failure, or window close.
- The 15 letter keys are a 5-by-3 harmonic grid. Rows are natural-minor degrees `i`, `III`, `iv`, `v`, and `VI`; columns are up, down, and pulse arpeggios. Inputs update the HUD immediately but enter audio on the next beat, and only the four most recent chord choices loop.
- Tab toggles playback; left Shift clears harmony; pressing the knob cycles `DRUM → BASS → TEMPO`. Knob rotation changes the selected drum template, bass template, or tempo in 2 BPM increments clamped to 60–180 BPM. Drum template changes also adopt that template's default BPM and swing on the next bar.
- Built-in templates remain BAD, BILLIE, SMOOTH, and FUNK77. Drum and bass template selection are independent. Keep template data out of React components and preserve the 25 ms scheduler with a short Web Audio look-ahead.
- `SweepPro` is shared by the settings and MIDI views. Hardware transition deduplication belongs in that component; do not add a second pressed-key cache in `MidiPage`. MIDI adds a minimum 220 ms selected-key highlight so short physical presses have visible feedback.
- The MIDI visual is one full-window Three.js canvas with the 40vh Sweep Pro floating above its left side; it is not a two-column layout. The current left offset is `-4vw`. The HUD title is `Cody ∞ Loop` and the `∞` mark is a text glyph, not an emoji.
- Preserve full-window translucency: the renderer and page background stay transparent, the canvas CSS opacity is `0.66`, and undrawn WebGL pixels must have alpha 0. `preserveBloomTransparency()` patches `UnrealBloomPass` blur alpha so bloom cannot turn empty pixels into opaque black. Do not set `scene.background`, add a black canvas background, or remove this alpha preservation when changing post-processing.
- Renderer access to exclusive input is `codyboard.midi.setExclusiveDevice(deviceId?)`, bridged by `midi:set-exclusive-device` and the daemon `midi.capture` command. The state is transient and must never be persisted in YAML or settings.
- `KeyboardController.setMIDICapture` starts the physical HID monitor and Event Tap without replacing the profile snapshot. New presses from the captured Sweep Pro resolve to suppress while still emitting diagnostic events to React; presses active before capture retain their original key-up action, other devices keep normal mappings, and stopping capture restores the existing profile immediately.
- Keep harmony and sequencer behavior covered by Vitest under the MIDI feature directory, and keep native capture protocol/isolation tests in `ProfileRuntimeTests.swift`. Changes spanning input or scheduling require `pnpm lint`, `pnpm test`, `pnpm test:native`, and `pnpm build`.

## Profile storage

- Store one profile per YAML file under `~/.codyboard/profiles/hid-{type}/{profile-id}.yaml`.
- Store the single active profile per keyboard type in the shared `~/.codyboard/settings.yaml`; this file may hold future app settings too.
- Do not watch these files. Read them at startup or explicit reload and write them only through the profile API.
- On a genuinely fresh installation, seed the bundled active type 40 default profile once. Never recreate it after the user has established settings or a profiles directory.
- With no active profiles, the Swift daemon must not create an Event Tap or request Accessibility permission.
- Keep default mappings in `resources/default-config`; do not hardcode experiment mappings in Swift or React.

## Releases

- Use semantic versioning from the `version` field in `package.json`. New backward-compatible actions or substantial capabilities increment the minor version; fixes increment the patch version.
- `pnpm package:mac` produces the Apple Silicon application at `release/Codyboard.app`. The entire `release/` directory is generated and ignored; never commit packaged applications or archives.
- The current package script performs ad-hoc signing, not Apple notarization. Do not describe a build as notarized unless a notarization workflow is added and verified.
- Before tagging a release, run `pnpm lint`, `pnpm test`, `pnpm test:native`, and `pnpm package:mac`.
- Verify `CFBundleShortVersionString`, `CFBundleVersion`, and `codesign --verify --deep --strict` on the packaged application before publishing it.
- Create annotated tags named `v{version}` and attach a versioned arm64 ZIP to the GitHub Release. Record the archive SHA-256 in the release handoff.

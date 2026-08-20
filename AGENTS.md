# Codyboard Desktop — Agent Map

## Commands

- JS/TS: `pnpm` only. Python: `uv`, not `pip`.
- Required before handoff: `pnpm lint && pnpm test && pnpm test:native && pnpm build`.
- ESLint enforces typed rules and `import-x/order`; use `pnpm lint:fix` only for mechanical fixes.
- Keep TS/Swift files focused and normally under ~300 lines. Split CSS by visual responsibility, not an arbitrary line count; never compress formatting to hide size.

## Find code by task

| Task | Start here | Related |
|---|---|---|
| App bootstrap/events | `src/main/main.ts` | `src/main/app/settings-window.ts`, `tray-controller.ts` |
| IPC channel | `src/main/app/ipc-handlers.ts` | `src/preload/preload.ts`, `src/shared/codyboard-api.ts` |
| Native subprocess transport | `src/main/daemon/codyboard-daemon-client.ts` | `native/.../NativeCommandServer.swift`, `NativeModels.swift` |
| App lookup/icons | `src/main/app/application-catalog.ts` | `ipc-handlers.ts` |
| Profile mutation/runtime replace | `src/main/profiles/profile-coordinator.ts` | `profile-schema.ts`, `profile-store.ts` |
| Profile YAML I/O/rollback | `src/main/profiles/profile-store.ts` | `resources/default-config/` |
| Shared HID types | `src/shared/hid-device.ts` | `profile-types.ts`; `hid.ts` is only a compatibility barrel |
| Profile mapping pure logic | `src/shared/profile-mappings.ts` | colocated tests |
| Native capture lifecycle/Event Tap | `native/.../KeyboardController.swift` | `KeyboardController+Commands.swift` |
| Native device event correlation | `native/.../KeyboardController+DeviceInput.swift` | `KeyboardInputDomain.swift` |
| Native output execution | `native/.../KeyboardController+ActionExecution.swift` | `KeyboardSimulator.swift` |
| Remote mic architecture | `docs/remote-mic.md` | BLE, ATVV, CoreAudio, driver identity, verification |
| Remote mic BLE/ATVV | `native/.../XiaomiVoiceBluetoothController.swift` | `ATVVProtocol.swift`, `BluetoothLifecycle.swift` |
| Remote mic audio output | `native/.../VirtualAudioOutput.swift` | `CoreAudioDeviceCatalog.swift`, `AudioPlaybackState.swift` |
| Remote mic key session | `native/.../VoiceSessionController.swift` | `ProfileRuntime.swift`, `KeyboardSimulator.swift` |
| Remote mic settings/runtime | `src/main/voice/voice-coordinator.ts` | `voice-settings-store.ts`, `src/shared/voice-types.ts` |
| Virtual microphone driver | `scripts/build-virtual-microphone.sh` | `third_party/blackhole/`, `scripts/install-virtual-microphone.sh` |
| Device catalog/VID-PID | `src/shared/device-catalog.ts` | `HIDDeviceManager.swift` |
| Device mapping UI | `DeviceButtonMappings.tsx` | `use-device-mappings.ts`, `DeviceMappingRow.tsx`, `MappingValueControls.tsx` |
| Mapping presets/device defaults | `device-controls.ts`, `mapping-output-presets.ts` | `mapping-output.ts` |
| Sweep Pro hardware decoding | `SweepPro.tsx` | `sweep-pro-input.ts` |
| Get Funky page lifecycle | `features/midi/MidiPage.tsx` | `use-midi-engine.ts`, `use-midi-hardware.ts`, `use-midi-performance-controls.ts` |
| MIDI scheduling/state | `features/midi/audio-engine.ts` | `audio-step-scheduler.ts`, `audio-engine-snapshot.ts`, `performance-effects.ts` |
| Web Audio graph/voices | `audio-graph.ts`, `audio-voices.ts` | `drum-voices.ts`, `melodic-voices.ts`, `audio-primitives.ts` |
| MIDI harmony/data | `harmony.ts`, `sequencer.ts` | `rigs.ts`, `midi-templates.ts`, `controls.ts` |
| Global styles | `renderer/styles/zz-components.css` | imports focused files under `renderer/styles/` in cascade order |
| MIDI styles | `features/midi/midi.css` | imports page, device skin, HUD, permission styles |

Paths beginning `native/...` mean `native/Sources/CodyboardDaemon/`; renderer component paths are under `src/renderer/components/devices/` unless stated.

## Hard boundaries

- Electron main composes services; do not move filesystem, tray, app lookup, window, or IPC policy back into `main.ts`.
- `CodyboardDaemonClient` is transport only. `ProfileCoordinator` owns mutation/compile/atomic runtime replace; `ProfileStore` owns disk and rollback.
- Keyboard capture/matching/rewriting stays in Swift. Keep the Event Tap path free of file and cross-process lookups.
- Swift package/module/executable/tests are named `CodyboardDaemon`; never restore `CodyboardHIDHelper`.
- `listHIDs()` returns physical IORegistry identities; virtual devices are excluded unless `{ includeVirtual: true }`.
- Supported devices are exact VID/PID: Xiaomi `0x2717/0x32B8`; Sweep Pro `0x1D50/0x615E`. Keyboard type is not a unique device ID.
- Profiles live at `~/.codyboard/profiles/device-{domain}/{profile-id}.yaml`; active IDs live in `~/.codyboard/settings.yaml`. No file watchers. Never reseed after settings or the profiles directory exists.
- With no active profiles, native code must not create an Event Tap or request Accessibility permission.

## Remote microphone invariants

- Read `docs/remote-mic.md` before changing BLE voice capture, ATVV decoding, CoreAudio routing or the HAL driver.
- PCM remains inside Swift; IPC exposes state/metrics only. Production audio is 16 kHz mono.
- Virtual device identity is fixed: `Codyboard Virtual Microphone`, UID `CodyboardVirtualMicrophone2ch_UID`, bundle ID `com.codyboard.VirtualMicrophone`.
- Bind CoreAudio output by UID/device ID. For remote-source sessions, lease the current macOS default input, switch to the configured virtual microphone before keyDown, and restore it after keyUp on every exit path.
- Persist an active default-input lease only in `~/.codyboard/runtime/default-audio-input.json`; daemon startup conditionally recovers it if the virtual microphone is still selected. Never overwrite a newer user selection.
- Sleep stops the active session and BLE connection; wake reconnects from the unchanged saved configuration. SIGTERM, SIGINT and SIGHUP use the same synchronous shutdown path.
- Start audio per voice session and drain `.dataPlayedBack` buffers before stopping or releasing a trigger.
- Voice is the synthetic profile trigger `{ kind: "voice", code: 0 }`; resolve it through the existing `ProfileRuntime` global/application fallback.
- Voice BLE/audio preferences live in `settings.yaml`; voice shortcuts live in the existing device profile groups. Do not add a second mapping store or editor.
- Voice audio source is independently inherited/overridden per profile group: `remote` routes BLE PCM to Codyboard Virtual Microphone; `system` discards BLE PCM and leaves the active app's microphone untouched.
- BLE mic start maps to output keyDown; after audio drain, the same pinned output maps to keyUp. Do not add tap/toggle semantics.
- CoreBluetooth callbacks must remain generation-safe; stale reconnect/session callbacks do no work.
- Voice trigger implementation stays generic; no product-specific app names or detection in native code.
- Remote microphone changes must not touch Power handling.

## MIDI invariants

- Opening `/midi` autoplays. Closing/leaving it disposes audio/timers/RAF/Three.js and releases capture; merely losing focus does not.
- Each `MidiPage` mount owns capture with a UUID. `MIDICaptureController` must ignore stale-owner release calls.
- While MIDI capture is active: suspend every global/application profile mapping across all devices; suppress captured Sweep Pro input while still emitting diagnostics. Release restores the unchanged profile snapshot.
- Keep hardware polling/capture in `use-midi-hardware.ts`, gestures/latch/reset in `use-midi-performance-controls.ts`, and `MidiPage.tsx` declarative.
- Scheduler interval stays 25 ms with look-ahead. Harmony commits next half-bar; rig/drum/bass changes restart at step 0; tempo changes immediately without restart.
- Audio path: drum/bass/music buses → mix → DJ filter → master → compressor → analyser. Delay/reverb are music sends only; voices never connect directly to destination.
- `SweepPro` is shared with settings. Hardware dedupe and knob reversal filtering belong in `SweepPro.tsx`/`sweep-pro-input.ts`, not MIDI hooks.
- MIDI skin selectors stay scoped under `.midi-device-float`; do not use Tailwind `@layer` in MIDI CSS. Preserve transparent WebGL pixels and bloom alpha.

## Renderer/style invariants

- Routes: `/permissions`, `/`, `/devices/:deviceId`, `/midi` via `HashRouter`.
- Device routes require actual Swift Accessibility + Input Monitoring status. `/midi` remains usable virtually without hardware/permissions.
- Window is translucent `hiddenInset`; light/dark is explicit local storage state, not system-following.
- `styles.css` contains Tailwind/base only. `styles/zz-components.css` is the ordered global CSS entry; preserve its import order. Add styles to the narrowest existing file.
- `midi.css` is an ordered import entry. Keep settings Sweep Pro ivory and MIDI-only skin amber.

## Tests/docs/releases

- Mapping/profile pure logic: adjacent Vitest files. MIDI scheduler: `audio-engine.test.ts` with `audio-engine-test-fixture.ts`. Native input/capture isolation: `ProfileRuntimeTests.swift`.
- Remote mic protocol/audio/session: `ATVVProtocolTests.swift`, `VirtualAudioOutputTests.swift`, and `VoiceSessionControllerTests.swift`; rebuild the driver with `pnpm build:virtual-mic` when its patch or scripts change.
- Update README only for user-visible behavior, commands, permissions, hardware, or storage. Store screenshots in `docs/screenshots/`; use repo-relative links and inspect them before commit.
- Version from `package.json` using semver. `pnpm package:mac` is ad-hoc signed, not notarized. Release artifacts under `release/` are generated and never committed.

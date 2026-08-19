# Remote microphone subsystem

AI-facing source of truth for Xiaomi ATVV voice capture and the Codyboard virtual microphone.
Power-button handling is unrelated and must not be changed as part of this subsystem.

## Data path

```text
Xiaomi remote
  -> CoreBluetooth GATT notifications
  -> ATVV framing + IMA ADPCM decode
  -> 16 kHz mono Int16 PCM
  -> AVAudioEngine / AVAudioPlayerNode
  -> Codyboard Virtual Microphone output stream
  -> HAL loopback input stream
  -> recording or dictation application
```

PCM stays inside the Swift daemon. IPC carries commands, state and metrics only.

## BLE and ATVV

GATT UUIDs:

| Role | UUID |
| --- | --- |
| Service | `AB5E0001-5A21-4F05-BC7D-AF01F617B664` |
| Transmit/write | `AB5E0002-5A21-4F05-BC7D-AF01F617B664` |
| Audio/notify | `AB5E0003-5A21-4F05-BC7D-AF01F617B664` |
| Control/notify | `AB5E0004-5A21-4F05-BC7D-AF01F617B664` |

The controller discovers all four characteristics, subscribes to audio and control, then requests
capabilities. Production audio is accepted only at 16 kHz. The verified RC003 reports ATVV v1,
codec `0x02`, 16 kHz and 120-byte ADPCM frames.

Important behavior:

- Decode high nibble before low nibble. Apply synchronization predictor/index messages.
- Accumulate fragmented notifications into negotiated frame sizes; never assume one notification is one frame.
- Accept audio-before-start through the stream processor, but reject audio after stop.
- Every CoreBluetooth delegate is generation-bound. Ignore stale callbacks after stop/reconnect.
- A session-level output gate prevents one audio failure from producing an error per PCM frame.
- Stop/disconnect order is `end stream -> audio drain -> reset BLE state`.
- Do not implement or infer `MIC_EXTEND` until a real trace proves its semantics.

Primary files:

- `native/Sources/CodyboardDaemon/ATVVProtocol.swift`
- `native/Sources/CodyboardDaemon/BluetoothLifecycle.swift` (stream processor and lifecycle state)
- `native/Sources/CodyboardDaemon/XiaomiVoiceBluetoothController.swift`
- `native/Sources/CodyboardDaemon/XiaomiVoiceBluetoothController+Central.swift`
- `native/Sources/CodyboardDaemon/XiaomiVoiceBluetoothController+Peripheral.swift`
- `native/Sources/CodyboardDaemon/XiaomiVoiceBluetoothController+Protocol.swift`

## Virtual audio device

Stable identity:

| Property | Value |
| --- | --- |
| Display name | `Codyboard Virtual Microphone` |
| Device UID | `CodyboardVirtualMicrophone2ch_UID` |
| Bundle | `CodyboardVirtualMicrophone.driver` |
| Bundle ID | `com.codyboard.VirtualMicrophone` |
| Factory UUID | `aa54e99a-0561-439a-9fd0-938c912a5c4f` |
| Installed path | `/Library/Audio/Plug-Ins/HAL/CodyboardVirtualMicrophone.driver` |

The driver is built from BlackHole `v0.7.1`, commit
`e2b22aaaba4e507a097131704bf96dabc004d9cf`, with a unique identity, exact display name and USB
transport type. It is a two-channel loopback device and can coexist with BlackHole or MiRemote.
The patch and resulting driver are GPL-3.0-derived. Local use needs only ad-hoc signing; distribution
requires GPL compliance and a separate signing/notarization decision.

Commands:

```bash
pnpm build:virtual-mic
pnpm install:virtual-mic
```

The build output is `.build/CodyboardVirtualMicrophone.driver`. Installation requires an admin
password and restarts `coreaudiod`. Do not rename or overwrite another project's driver.

## Audio runtime

`VirtualAudioOutput` accepts 16 kHz mono `Int16`, converts it to non-interleaved float PCM, and lets
AVAudioEngine convert to the device's live format. It explicitly binds the output audio unit with
`kAudioOutputUnitProperty_CurrentDevice`; changing the system default is not required.

Lifecycle:

1. `audio.configure` resolves and stores a live CoreAudio UID.
2. ATVV stream start starts the engine and player; idle configuration does not hold the device.
3. PCM buffers use `.dataPlayedBack` completion and increment/decrement the drain counter.
4. ATVV stream stop drains queued buffers before stopping the engine; timeout is fail-safe only.
5. Health requires a selected device, running engine, playing node and exact live device-ID binding.
6. Route/configuration changes fail closed. Recovery policy belongs in Phase 6, not the audio callback.

Primary files:

- `native/Sources/CodyboardDaemon/CoreAudioDeviceCatalog.swift`
- `native/Sources/CodyboardDaemon/VirtualAudioOutput.swift`
- `native/Sources/CodyboardDaemon/VirtualAudioOutput+Health.swift`
- `native/Sources/CodyboardDaemon/AudioPlaybackState.swift`

## Native commands and events

| Method | Required data | Purpose |
| --- | --- | --- |
| `voice.configure` | `configuration.enabled`, optional target UUID, `gainDB` | Start/stop BLE capture |
| `voice.status` | none | Current BLE/capability state |
| `voice.stop` | none | Close mic, drain/reset stream and stop BLE |
| `audio.devices.list` | none | Enumerate CoreAudio output-capable devices |
| `audio.configure` | `deviceUID` | Bind future sessions to one device |
| `audio.status` | none | Audio health and pending buffers |
| `audio.testTone` | none | Schedule a one-second 440 Hz diagnostic tone |
| `audio.stop` | none | Stop the runtime without clearing selection |

Key events are `bluetoothStateChanged`, `voiceStreamStarted`, `voiceMetrics`,
`voiceStreamStopped`, `audioStateChanged` and `audioTestToneFinished`. Never add PCM to JSON events.

## Verified baseline

Verified on 2026-08-19 with the Xiaomi Bluetooth voice remote:

- Driver enumerated as the exact display name and as both two-channel input and output.
- Test-tone loopback capture peaked at `-15.8 dB`.
- One representative voice session decoded 194 frames / 46,560 samples, about 2.91 seconds.
- QuickTime playback was confirmed by the user as “loud and clear”.
- Repeated start/stop sessions drained to zero pending buffers.

QuickTime does not live-monitor microphone input. Start recording, speak through the remote, stop,
then play the recording. A visible device with silence usually means the running daemon has not yet
called both `audio.configure` and `voice.configure`; installation alone does not start routing.

## Boundaries for later phases

- Phase 3 is native-only. Electron persistence/UI wiring is Phase 5.
- Trigger logic is generic Fn or configurable key-chord state, never product-specific native code.
- Do not add default-input switching, driver auto-install, application detection, battery handling or
  multi-remote support unless a later requirement explicitly needs it.
- MIDI capture must eventually suspend voice triggering without mutating the saved voice config.
- Preserve stop ordering when triggers arrive: stop PCM intake, drain audio, then release the trigger.
- Keep Power implementation and profile mapping behavior untouched.

Tests live in `ATVVProtocolTests.swift` and `VirtualAudioOutputTests.swift`. Before handoff run the
repository's full gate from `AGENTS.md` plus `pnpm build:virtual-mic` when driver files change.

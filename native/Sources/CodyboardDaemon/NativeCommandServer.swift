import Foundation
import Darwin

final class NativeCommandServer {
    private let bluetoothPermission = BluetoothPermissionController()
    private let decoder = JSONDecoder()
    private let devices: HIDDeviceManager
    private let keyboard: KeyboardController
    private let voice: XiaomiVoiceBluetoothController
    private let audio: VirtualAudioOutput
    private let voiceSession: VoiceSessionController

    init(
        devices: HIDDeviceManager,
        keyboard: KeyboardController,
        voice: XiaomiVoiceBluetoothController,
        audio: VirtualAudioOutput,
        voiceSession: VoiceSessionController
    ) {
        self.devices = devices
        self.keyboard = keyboard
        self.voice = voice
        self.audio = audio
        self.voiceSession = voiceSession
    }

    func start() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in self?.readCommands() }
    }

    private func readCommands() {
        while let line = readLine(strippingNewline: true) {
            guard !line.isEmpty else { continue }
            do {
                let command = try decoder.decode(Command.self, from: Data(line.utf8))
                DispatchQueue.main.async { [weak self] in self?.handle(command) }
            } catch {
                NativeOutput.shared.error(id: nil, code: "invalidCommand", message: error.localizedDescription)
            }
        }
        DispatchQueue.main.async { [weak self] in
            self?.keyboard.shutdown()
            self?.voice.shutdown()
            self?.voiceSession.shutdown()
            self?.audio.shutdown()
            exit(EXIT_SUCCESS)
        }
    }

    private func handle(_ command: Command) {
        do {
            switch command.method {
            case "devices.list":
                let result = devices.listKeyboards(includeVirtual: command.params?.includeVirtual ?? false)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "profiles.replace":
                guard let snapshot = command.params?.snapshot else { throw commandError("Missing profile snapshot") }
                let result = try keyboard.replaceProfiles(snapshot, promptForPermission: true)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "keyboard.send":
                guard let output = command.params?.output else { throw commandError("Missing keyboard output") }
                try keyboard.send(output)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: EmptyPayload()))
            case "diagnostics.set":
                let result = try keyboard.setDiagnostics(keyboardType: command.params?.keyboardType)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "midi.capture":
                let result = try keyboard.setMIDICapture(deviceId: command.params?.deviceId)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "voice.configure":
                guard let configuration = command.params?.configuration else {
                    throw commandError("Missing voice configuration")
                }
                let result = try voice.configure(configuration)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "voice.status":
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: voice.status))
            case "voice.stop":
                voice.stop()
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: voice.status))
            case "voice.session.status":
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: voiceSession.status))
            case "audio.devices.list":
                NativeOutput.shared.send(SuccessResponse(
                    id: command.id, data: CoreAudioDeviceCatalog.outputDevices()
                ))
            case "audio.inputDevices.list":
                NativeOutput.shared.send(SuccessResponse(
                    id: command.id, data: CoreAudioDeviceCatalog.inputDevices()
                ))
            case "audio.configure":
                guard !voiceSession.isBusy else {
                    throw commandError("Cannot reconfigure audio during a voice session")
                }
                guard let deviceUID = command.params?.deviceUID else {
                    throw commandError("Missing CoreAudio device UID")
                }
                let result = try audio.configure(deviceUID: deviceUID)
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: result))
            case "audio.status":
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: audio.status))
            case "audio.testTone":
                guard !voiceSession.isBusy, audio.playTestTone() else {
                    throw commandError("Unable to play CoreAudio test tone")
                }
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: audio.status))
            case "audio.stop":
                voiceSession.stopSession()
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: audio.status))
            case "permissions.status":
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: permissionStatus()))
            case "permissions.request":
                switch command.params?.permission {
                case "accessibility": _ = keyboard.requestPermission(prompt: true)
                case "bluetooth": bluetoothPermission.request()
                case "inputMonitoring": _ = RawHIDMonitor.requestInputMonitoringAccess()
                default: throw commandError("Unknown permission")
                }
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: permissionStatus()))
            default:
                NativeOutput.shared.error(id: command.id, code: "unknownMethod", message: "Unknown method: \(command.method)")
            }
        } catch {
            let code = (error as NSError).domain == "app.codyboard.permissions" ? "permissionDenied" : "nativeError"
            NativeOutput.shared.error(id: command.id, code: code, message: error.localizedDescription)
        }
    }

    private func commandError(_ message: String) -> NSError {
        NSError(domain: "app.codyboard.command", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private func permissionStatus() -> PermissionStatus {
        PermissionStatus(
            accessibility: keyboard.requestPermission(prompt: false),
            bluetooth: BluetoothPermissionController.status,
            inputMonitoring: RawHIDMonitor.hasInputMonitoringAccess
        )
    }
}

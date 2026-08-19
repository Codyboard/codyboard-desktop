import Foundation

final class NativeCommandServer {
    private let decoder = JSONDecoder()
    private let devices: HIDDeviceManager
    private let keyboard: KeyboardController

    init(devices: HIDDeviceManager, keyboard: KeyboardController) {
        self.devices = devices
        self.keyboard = keyboard
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
            CFRunLoopStop(CFRunLoopGetMain())
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
            case "permissions.status":
                NativeOutput.shared.send(SuccessResponse(id: command.id, data: permissionStatus()))
            case "permissions.request":
                switch command.params?.permission {
                case "accessibility": _ = keyboard.requestPermission(prompt: true)
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
            inputMonitoring: RawHIDMonitor.hasInputMonitoringAccess
        )
    }
}

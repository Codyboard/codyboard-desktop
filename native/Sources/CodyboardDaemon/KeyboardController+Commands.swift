import Foundation

extension KeyboardController {
    func send(_ output: CompiledOutput) throws {
        if output.kind == "launchApplication", let bundleIdentifier = output.bundleId {
            applicationLauncher.launch(bundleIdentifier: bundleIdentifier)
            return
        }
        if output.kind == "openURL", let url = output.url {
            applicationLauncher.open(urlString: url)
            return
        }
        guard requestPermission(prompt: true) else {
            throw NSError(
                domain: "app.codyboard.permissions", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required"]
            )
        }
        if output.kind == "typeText", let text = output.text {
            try simulator.sendText(text, pressEnter: output.pressEnter ?? false)
        } else {
            try simulator.sendStroke(output)
        }
    }

    func setDiagnostics(keyboardType: Int?) throws -> ReplaceResult {
        if let keyboardType {
            guard keyboardType >= 0 else {
                throw NSError(
                    domain: "app.codyboard.diagnostics", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid keyboard type"]
                )
            }
            let rawHIDWasRunning = rawHIDMonitor.isRunning
            if keyboardType == RawHIDMonitor.keyboardType { try rawHIDMonitor.start() }
            guard start(promptForPermission: true) else {
                if !rawHIDWasRunning && !profilesNeedRawHID { rawHIDMonitor.stop() }
                throw permissionError()
            }
            diagnosticKeyboardType = keyboardType
        } else {
            diagnosticKeyboardType = nil
            if !profilesNeedRawHID { rawHIDMonitor.stop() }
            if runtime.isEmpty && midiCaptureDeviceId == nil { stop() }
        }
        return ReplaceResult(generation: runtime.generation, listening: isListening)
    }

    func setMIDICapture(deviceId: String?) throws -> ReplaceResult {
        if let deviceId {
            guard !deviceId.isEmpty else {
                throw NSError(
                    domain: "app.codyboard.midi", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid MIDI capture device"]
                )
            }
            let wasRunning = physicalHIDMonitor.isRunning
            do {
                try physicalHIDMonitor.start()
                guard start(promptForPermission: true) else { throw permissionError() }
                midiCaptureDeviceId = deviceId
            } catch {
                if !wasRunning && runtime.isEmpty { physicalHIDMonitor.stop() }
                throw error
            }
        } else {
            midiCaptureDeviceId = nil
            if runtime.isEmpty { physicalHIDMonitor.stop() }
            if diagnosticKeyboardType == nil && runtime.isEmpty { stop() }
        }
        return ReplaceResult(generation: runtime.generation, listening: isListening)
    }
}

private func permissionError() -> NSError {
    NSError(
        domain: "app.codyboard.permissions", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required"]
    )
}

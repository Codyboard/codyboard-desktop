import ApplicationServices
import Foundation

extension KeyboardController {
    func receiveRawHIDUsage(deviceId: String, usage: UInt16, pressed: Bool) {
        if diagnosticKeyboardType == RawHIDMonitor.keyboardType {
            NativeOutput.shared.send(NativeEvent(
                event: "diagnosticKey",
                data: DiagnosticKeyEvent(
                    deviceId: deviceId, keyboardType: nil,
                    eventType: pressed ? "keydown" : "keyup",
                    source: "hidUsage", code: Int(usage), keyCode: nil,
                    flags: 0, timestamp: 0
                )
            ))
            return
        }
        let input = DeviceInputIdentity(deviceId: deviceId, kind: "hidUsage", code: Int(usage))
        let action: ActiveDeviceAction
        var autorepeat = false
        if pressed {
            if let active = activeDevicePresses.action(for: input) {
                action = active
                autorepeat = true
            } else {
                action = resolveDeviceAction(
                    deviceId: deviceId,
                    trigger: CompiledTrigger(kind: "hidUsage", code: Int(usage), modifiers: [])
                )
                activeDevicePresses.begin(input, action: action)
            }
        } else {
            guard let active = activeDevicePresses.end(input) else { return }
            action = active
        }
        applyRawHIDAction(
            action, pressed: pressed, autorepeat: autorepeat,
            details: ["hidUsage": String(usage)]
        )
    }

    func receivePhysicalInput(
        deviceId: String, isMIDICaptureSource: Bool = false,
        kind: String, code: Int, usage: UInt32, pressed: Bool
    ) {
        let now = DispatchTime.now().uptimeNanoseconds
        pendingPhysicalEvents.removeAll { now - $0.timestamp > 250_000_000 }
        pendingPhysicalEvents.append(PendingDeviceInputEvent(
            deviceId: deviceId, isMIDICaptureSource: isMIDICaptureSource,
            kind: kind, code: code, pressed: pressed, timestamp: now
        ))
        NativeOutput.shared.send(NativeEvent(
            event: "diagnosticKey",
            data: DiagnosticKeyEvent(
                deviceId: deviceId, keyboardType: nil,
                eventType: pressed ? "keydown" : "keyup",
                source: kind == "system" ? "hidUsage" : "keyCode",
                code: kind == "system" ? Int(usage) : code,
                keyCode: kind == "system" ? nil : code,
                flags: 0, timestamp: 0
            )
        ))
    }

    func consumePhysicalInput(
        kind: String, code: Int, pressed: Bool
    ) -> PendingDeviceInputEvent? {
        let now = DispatchTime.now().uptimeNanoseconds
        pendingPhysicalEvents.removeAll { now - $0.timestamp > 250_000_000 }
        guard let index = pendingPhysicalEvents.firstIndex(where: {
            $0.kind == kind && $0.code == code && $0.pressed == pressed
        }) else { return nil }
        return pendingPhysicalEvents.remove(at: index)
    }

    func resolveDeviceEvent(
        input: DeviceInputIdentity, isMIDICaptureSource: Bool,
        trigger: CompiledTrigger, event: CGEvent, pressed: Bool, autorepeat: Bool
    ) -> Unmanaged<CGEvent>? {
        let action: ActiveDeviceAction
        if pressed {
            if let active = activeDevicePresses.action(for: input) {
                action = active
            } else {
                action = resolveNewDevicePress(
                    isMIDICaptureActive: midiCaptureDeviceId != nil,
                    isMIDICaptureSource: isMIDICaptureSource
                ) {
                    resolveDeviceAction(deviceId: input.deviceId, trigger: trigger)
                }
                activeDevicePresses.begin(input, action: action)
            }
        } else {
            guard let active = activeDevicePresses.end(input) else {
                return Unmanaged.passUnretained(event)
            }
            action = active
        }
        return applyDeviceAction(
            action, event: event, pressed: pressed, autorepeat: autorepeat,
            details: ["deviceId": input.deviceId, "keyCode": String(trigger.code)]
        )
    }

    func resolveDeviceAction(deviceId: String, trigger: CompiledTrigger) -> ActiveDeviceAction {
        resolveProfileAction(isProfilesSuspended: midiCaptureDeviceId != nil) {
            switch runtime.resolve(
                trigger: trigger, deviceId: deviceId,
                bundleIdentifier: frontmostBundleIdentifier
            ) {
            case .none, .ambiguous:
                return .passthrough
            case .output(let output):
                if output.kind == "suppress" { return .suppress }
                if output.kind == "passthrough" { return .passthrough }
                if output.kind == "launchApplication" {
                    return output.bundleId.map(ActiveDeviceAction.launchApplication) ?? .suppress
                }
                if output.kind == "openURL" {
                    return output.url.map(ActiveDeviceAction.openURL) ?? .suppress
                }
                if output.kind == "typeText" {
                    return output.text.map {
                        ActiveDeviceAction.typeText($0, output.pressEnter ?? false)
                    } ?? .suppress
                }
                return .output(output)
            }
        }
    }
}

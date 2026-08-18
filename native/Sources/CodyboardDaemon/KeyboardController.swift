import AppKit
import ApplicationServices
import CoreFoundation
import Foundation

final class KeyboardController: @unchecked Sendable {
    private let runtime: ProfileRuntime
    private let simulator: KeyboardSimulator
    private let applicationLauncher: ApplicationLauncher
    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var frontmostBundleIdentifier: String?
    private var activationObserver: NSObjectProtocol?
    private var diagnosticKeyboardType: Int?
    private var activeLaunchTriggers = Set<ActiveLaunchTrigger>()
    private var activeDevicePresses = ActiveDevicePressStore()
    private var profilesNeedRawHID = false
    private var pendingPhysicalEvents: [PendingDeviceInputEvent] = []
    private lazy var rawHIDMonitor: RawHIDMonitor = {
        let monitor = RawHIDMonitor()
        monitor.onUsage = { [weak self] deviceId, usage, pressed in
            self?.receiveRawHIDUsage(deviceId: deviceId, usage: usage, pressed: pressed)
        }
        monitor.onInput = { [weak self] deviceId, kind, code, usage, pressed in
            self?.receivePhysicalInput(
                deviceId: deviceId, kind: kind, code: code, usage: usage, pressed: pressed
            )
        }
        return monitor
    }()
    private lazy var physicalHIDMonitor: PhysicalKeyboardHIDMonitor = {
        let monitor = PhysicalKeyboardHIDMonitor()
        monitor.onInput = { [weak self] deviceId, kind, code, usage, pressed in
            self?.receivePhysicalInput(
                deviceId: deviceId, kind: kind, code: code, usage: usage, pressed: pressed
            )
        }
        return monitor
    }()

    init(runtime: ProfileRuntime, simulator: KeyboardSimulator, applicationLauncher: ApplicationLauncher) {
        self.runtime = runtime
        self.simulator = simulator
        self.applicationLauncher = applicationLauncher
        self.frontmostBundleIdentifier = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        self.activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] notification in
            self?.frontmostBundleIdentifier = (notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier
        }
    }

    deinit {
        if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) }
    }

    var isListening: Bool { tap != nil || physicalHIDMonitor.isRunning }

    func replaceProfiles(_ snapshot: CompiledProfileSet, promptForPermission: Bool) throws -> ReplaceResult {
        let needsRawHID = !snapshot.profiles.isEmpty
        let needsPhysicalHID = !snapshot.profiles.isEmpty
        let rawHIDWasRunning = rawHIDMonitor.isRunning
        let physicalHIDWasRunning = physicalHIDMonitor.isRunning
        if needsRawHID { try rawHIDMonitor.start() }
        if needsPhysicalHID {
            do { try physicalHIDMonitor.start() }
            catch {
                NativeOutput.shared.error(
                    id: nil, code: "physicalHIDUnavailable", message: error.localizedDescription
                )
            }
        }
        if snapshot.profiles.isEmpty {
            runtime.replace(snapshot)
            profilesNeedRawHID = false
            if diagnosticKeyboardType != RawHIDMonitor.keyboardType { rawHIDMonitor.stop() }
            physicalHIDMonitor.stop()
            if diagnosticKeyboardType == nil { stop() }
        } else if !start(promptForPermission: promptForPermission) {
            if !rawHIDWasRunning { rawHIDMonitor.stop() }
            if !physicalHIDWasRunning { physicalHIDMonitor.stop() }
            throw NSError(
                domain: "app.codyboard.permissions", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "需要辅助功能权限。请在系统设置 → 隐私与安全性 → 辅助功能中允许 Codyboard。"]
            )
        } else {
            // Event taps and commands run on the main loop, so replacement is atomic
            // relative to input callbacks. Permission failure leaves the old generation intact.
            runtime.replace(snapshot)
            profilesNeedRawHID = needsRawHID
            if !needsRawHID && diagnosticKeyboardType != RawHIDMonitor.keyboardType { rawHIDMonitor.stop() }
            if !needsPhysicalHID { physicalHIDMonitor.stop() }
        }
        return ReplaceResult(generation: snapshot.generation, listening: isListening)
    }

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
            throw NSError(domain: "app.codyboard.permissions", code: 1, userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required"])
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
                throw NSError(domain: "app.codyboard.diagnostics", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid keyboard type"])
            }
            let rawHIDWasRunning = rawHIDMonitor.isRunning
            if keyboardType == RawHIDMonitor.keyboardType { try rawHIDMonitor.start() }
            guard start(promptForPermission: true) else {
                if !rawHIDWasRunning && !profilesNeedRawHID { rawHIDMonitor.stop() }
                throw NSError(domain: "app.codyboard.permissions", code: 1, userInfo: [NSLocalizedDescriptionKey: "Accessibility permission is required"])
            }
            diagnosticKeyboardType = keyboardType
        } else {
            diagnosticKeyboardType = nil
            if !profilesNeedRawHID { rawHIDMonitor.stop() }
            if runtime.isEmpty { stop() }
        }
        return ReplaceResult(generation: runtime.generation, listening: isListening)
    }

    func requestPermission(prompt: Bool) -> Bool {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt]
        return AXIsProcessTrustedWithOptions(options as CFDictionary)
    }

    func stop() {
        if let source = runLoopSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        if let tap { CFMachPortInvalidate(tap) }
        runLoopSource = nil
        tap = nil
    }

    private func start(promptForPermission: Bool) -> Bool {
        if tap != nil { return true }
        guard requestPermission(prompt: promptForPermission) else { return false }

        let systemDefined = CGEventType(rawValue: systemDefinedEventRawValue)!
        var mask: CGEventMask = 0
        mask |= CGEventMask(1) << CGEventType.keyDown.rawValue
        mask |= CGEventMask(1) << CGEventType.keyUp.rawValue
        mask |= CGEventMask(1) << CGEventType.flagsChanged.rawValue
        mask |= CGEventMask(1) << systemDefined.rawValue
        let context = Unmanaged.passUnretained(self).toOpaque()
        guard let created = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: mask, callback: keyboardEventTapCallback, userInfo: context
        ) else { return false }

        tap = created
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, created, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: created, enable: true)
        return true
    }

    fileprivate func receive(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        if event.getIntegerValueField(.eventSourceUserData) == syntheticEventMarker {
            return Unmanaged.passUnretained(event)
        }

        let systemDefined = CGEventType(rawValue: systemDefinedEventRawValue)!
        guard type == .keyDown || type == .keyUp || type == .flagsChanged || type == systemDefined else {
            return Unmanaged.passUnretained(event)
        }

        let system = type == systemDefined ? parseSystemEvent(event) : nil
        if type == systemDefined && system == nil { return Unmanaged.passUnretained(event) }
        let code = system?.code ?? Int(event.getIntegerValueField(.keyboardEventKeycode))
        let kind = type == systemDefined ? "system" : type == .flagsChanged ? "modifier" : "keyboard"
        var modifiers = modifierNames(event.flags)
        if kind == "modifier", let ownModifier = modifierName(for: code) { modifiers.removeAll(where: { $0 == ownModifier }) }
        let trigger = CompiledTrigger(kind: kind, code: code, modifiers: modifiers.sorted())
        let keyboardType = type == systemDefined ? nil : Int(event.getIntegerValueField(.keyboardEventKeyboardType))
        let pressed = system?.pressed ?? eventPressed(type: type, keyCode: code, flags: event.flags)
        let autorepeat = event.getIntegerValueField(.keyboardEventAutorepeat) != 0
        let activeLaunchTrigger = ActiveLaunchTrigger(
            trigger: trigger, source: keyboardType.map { "keyboard-type:\($0)" }
        )
        if !pressed, activeLaunchTriggers.remove(activeLaunchTrigger) != nil { return nil }
        if pressed, autorepeat,
           let action = activeDevicePresses.uniqueAction(kind: kind, code: code) {
            return applyDeviceAction(
                action, event: event, pressed: true, autorepeat: true,
                details: ["keyCode": String(code)]
            )
        }
        if let deviceId = consumePhysicalDeviceId(kind: kind, code: code, pressed: pressed) {
            return resolveDeviceEvent(
                input: DeviceInputIdentity(deviceId: deviceId, kind: kind, code: code),
                trigger: trigger, event: event, pressed: pressed, autorepeat: autorepeat
            )
        }
        if let keyboardType, keyboardType == diagnosticKeyboardType {
            let eventName = type == .keyDown ? "keydown" : type == .keyUp ? "keyup" : "flagschanged"
            NativeOutput.shared.send(NativeEvent(
                event: "diagnosticKey",
                data: DiagnosticKeyEvent(
                    deviceId: nil, keyboardType: keyboardType, eventType: eventName, source: "keyCode",
                    code: code, keyCode: code,
                    flags: event.flags.rawValue, timestamp: event.timestamp
                )
            ))
            return nil
        }

        return Unmanaged.passUnretained(event)
    }

    private func receiveRawHIDUsage(deviceId: String, usage: UInt16, pressed: Bool) {
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

    private func receivePhysicalInput(
        deviceId: String, kind: String, code: Int, usage: UInt32, pressed: Bool
    ) {
        let now = DispatchTime.now().uptimeNanoseconds
        pendingPhysicalEvents.removeAll { now - $0.timestamp > 250_000_000 }
        pendingPhysicalEvents.append(PendingDeviceInputEvent(
            deviceId: deviceId, kind: kind, code: code, pressed: pressed, timestamp: now
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

    private func consumePhysicalDeviceId(kind: String, code: Int, pressed: Bool) -> String? {
        let now = DispatchTime.now().uptimeNanoseconds
        pendingPhysicalEvents.removeAll { now - $0.timestamp > 250_000_000 }
        guard let index = pendingPhysicalEvents.firstIndex(where: {
            $0.kind == kind && $0.code == code && $0.pressed == pressed
        }) else { return nil }
        return pendingPhysicalEvents.remove(at: index).deviceId
    }

    private func resolveDeviceEvent(
        input: DeviceInputIdentity, trigger: CompiledTrigger, event: CGEvent,
        pressed: Bool, autorepeat: Bool
    ) -> Unmanaged<CGEvent>? {
        let action: ActiveDeviceAction
        if pressed {
            if let active = activeDevicePresses.action(for: input) {
                action = active
            } else {
                action = resolveDeviceAction(deviceId: input.deviceId, trigger: trigger)
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

    private func resolveDeviceAction(deviceId: String, trigger: CompiledTrigger) -> ActiveDeviceAction {
        switch runtime.resolve(
            trigger: trigger, deviceId: deviceId, bundleIdentifier: frontmostBundleIdentifier
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
                return output.text.map { ActiveDeviceAction.typeText($0, output.pressEnter ?? false) } ?? .suppress
            }
            return .output(output)
        }
    }

    private func applyDeviceAction(
        _ action: ActiveDeviceAction, event: CGEvent, pressed: Bool, autorepeat: Bool,
        details: [String: String]
    ) -> Unmanaged<CGEvent>? {
        switch action {
        case .passthrough:
            return Unmanaged.passUnretained(event)
        case .suppress:
            return nil
        case .launchApplication(let bundleIdentifier):
            if pressed && !autorepeat { applicationLauncher.launch(bundleIdentifier: bundleIdentifier) }
            return nil
        case .openURL(let url):
            if pressed && !autorepeat { applicationLauncher.open(urlString: url) }
            return nil
        case .typeText(let text, let pressEnter):
            if pressed && !autorepeat {
                do { try simulator.sendText(text, pressEnter: pressEnter) }
                catch {
                    NativeOutput.shared.error(
                        id: nil, code: "simulationFailed", message: error.localizedDescription,
                        details: details
                    )
                }
            }
            return nil
        case .output(let output):
            do {
                try simulator.post(output, pressed: pressed, autorepeat: autorepeat)
                return nil
            } catch {
                NativeOutput.shared.error(
                    id: nil, code: "simulationFailed", message: error.localizedDescription,
                    details: details
                )
                return Unmanaged.passUnretained(event)
            }
        }
    }

    private func applyRawHIDAction(
        _ action: ActiveDeviceAction, pressed: Bool, autorepeat: Bool,
        details: [String: String]
    ) {
        switch action {
        case .passthrough, .suppress:
            return
        case .launchApplication(let bundleIdentifier):
            if pressed && !autorepeat { applicationLauncher.launch(bundleIdentifier: bundleIdentifier) }
        case .openURL(let url):
            if pressed && !autorepeat { applicationLauncher.open(urlString: url) }
        case .typeText(let text, let pressEnter):
            if pressed && !autorepeat {
                do { try simulator.sendText(text, pressEnter: pressEnter) }
                catch {
                    NativeOutput.shared.error(
                        id: nil, code: "simulationFailed", message: error.localizedDescription,
                        details: details
                    )
                }
            }
        case .output(let output):
            do { try simulator.post(output, pressed: pressed, autorepeat: autorepeat) }
            catch {
                NativeOutput.shared.error(
                    id: nil, code: "simulationFailed", message: error.localizedDescription,
                    details: details
                )
            }
        }
    }
}

private struct PendingDeviceInputEvent {
    let deviceId: String
    let kind: String
    let code: Int
    let pressed: Bool
    let timestamp: UInt64
}

private struct ActiveLaunchTrigger: Hashable {
    let trigger: CompiledTrigger
    let source: String?
}

struct DeviceInputIdentity: Hashable {
    let deviceId: String
    let kind: String
    let code: Int
}

enum ActiveDeviceAction {
    case passthrough
    case suppress
    case launchApplication(String)
    case openURL(String)
    case typeText(String, Bool)
    case output(CompiledOutput)
}

struct ActiveDevicePressStore {
    private var actions: [DeviceInputIdentity: ActiveDeviceAction] = [:]

    mutating func begin(_ input: DeviceInputIdentity, action: ActiveDeviceAction) {
        actions[input] = action
    }

    func action(for input: DeviceInputIdentity) -> ActiveDeviceAction? {
        actions[input]
    }

    mutating func end(_ input: DeviceInputIdentity) -> ActiveDeviceAction? {
        actions.removeValue(forKey: input)
    }

    func uniqueAction(kind: String, code: Int) -> ActiveDeviceAction? {
        let matches = actions.filter { input, _ in input.kind == kind && input.code == code }
        guard matches.count == 1 else { return nil }
        return matches.first?.value
    }
}

private let keyboardEventTapCallback: CGEventTapCallBack = { _, type, event, context in
    guard let context else { return Unmanaged.passUnretained(event) }
    return Unmanaged<KeyboardController>.fromOpaque(context).takeUnretainedValue().receive(type: type, event: event)
}

private func modifierNames(_ flags: CGEventFlags) -> [String] {
    var values: [String] = []
    if flags.contains(.maskCommand) { values.append("command") }
    if flags.contains(.maskControl) { values.append("control") }
    if flags.contains(.maskAlternate) { values.append("option") }
    if flags.contains(.maskShift) { values.append("shift") }
    if flags.contains(.maskSecondaryFn) { values.append("fn") }
    return values
}

private func modifierName(for keyCode: Int) -> String? {
    switch keyCode {
    case 54, 55: "command"
    case 56, 60: "shift"
    case 58, 61: "option"
    case 59, 62: "control"
    case 63: "fn"
    default: nil
    }
}

private func eventPressed(type: CGEventType, keyCode: Int, flags: CGEventFlags) -> Bool {
    if type == .keyDown { return true }
    if type == .keyUp { return false }
    let flag: CGEventFlags? = switch keyCode {
    case 54, 55: .maskCommand
    case 56, 60: .maskShift
    case 57: .maskAlphaShift
    case 58, 61: .maskAlternate
    case 59, 62: .maskControl
    case 63: .maskSecondaryFn
    default: nil
    }
    return flag.map(flags.contains) ?? false
}

private func parseSystemEvent(_ event: CGEvent) -> (code: Int, key: String, pressed: Bool)? {
    guard let nsEvent = NSEvent(cgEvent: event), nsEvent.subtype.rawValue == 8 else { return nil }
    let data = UInt32(bitPattern: Int32(truncatingIfNeeded: nsEvent.data1))
    let code = Int((data & 0xFFFF0000) >> 16)
    let state = Int((data & 0x0000FF00) >> 8)
    return (code, systemKeyName(code), state == 0x0A)
}

private func systemKeyName(_ code: Int) -> String {
    [
        0: "volumeUp", 1: "volumeDown", 2: "brightnessUp", 3: "brightnessDown", 4: "capsLock",
        6: "power", 7: "mute", 14: "eject", 15: "videoMirror", 16: "playPause", 17: "nextTrack",
        18: "previousTrack", 19: "fastForward", 20: "rewind", 21: "keyboardBrightnessUp",
        22: "keyboardBrightnessDown", 23: "keyboardBrightnessToggle"
    ][code] ?? "system.\(code)"
}

private func keyName(_ code: Int) -> String {
    [
        0: "a", 1: "s", 2: "d", 3: "f", 4: "h", 5: "g", 6: "z", 7: "x", 8: "c", 9: "v",
        11: "b", 12: "q", 13: "w", 14: "e", 15: "r", 16: "y", 17: "t", 36: "enter",
        37: "l", 38: "j", 40: "k", 45: "n", 46: "m", 48: "tab", 49: "space", 51: "backspace",
        53: "escape", 63: "fn", 115: "home", 116: "pageUp", 117: "deleteForward", 119: "end",
        121: "pageDown", 123: "arrowLeft", 124: "arrowRight", 125: "arrowDown", 126: "arrowUp"
    ][code] ?? "keycode.\(code)"
}

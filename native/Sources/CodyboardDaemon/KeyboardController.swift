import AppKit
import ApplicationServices
import CoreFoundation
import Foundation

final class KeyboardController: @unchecked Sendable {
    let runtime: ProfileRuntime
    let simulator: KeyboardSimulator
    let applicationLauncher: ApplicationLauncher
    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    var frontmostBundleIdentifier: String?
    private var activationObserver: NSObjectProtocol?
    var diagnosticKeyboardType: Int?
    var midiCaptureDeviceId: String?
    private var activeLaunchTriggers = Set<ActiveLaunchTrigger>()
    var activeDevicePresses = ActiveDevicePressStore()
    var profilesNeedRawHID = false
    var pendingPhysicalEvents: [PendingDeviceInputEvent] = []
    let powerEventSuppressor = XiaomiPowerEventSuppressor()
    lazy var rawHIDMonitor: RawHIDMonitor = {
        let monitor = RawHIDMonitor()
        monitor.onUsage = { [weak self] deviceId, usage, pressed in
            if usage == XiaomiHIDProtectionController.powerUsage {
                self?.powerEventSuppressor.arm(pressed: pressed)
            }
            self?.receiveRawHIDUsage(deviceId: deviceId, usage: usage, pressed: pressed)
        }
        monitor.onInput = { [weak self] deviceId, kind, code, usage, pressed in
            self?.receivePhysicalInput(
                deviceId: deviceId, kind: kind, code: code, usage: usage, pressed: pressed
            )
        }
        monitor.onReset = { [weak self] in self?.powerEventSuppressor.reset() }
        return monitor
    }()
    lazy var physicalHIDMonitor: PhysicalKeyboardHIDMonitor = {
        let monitor = PhysicalKeyboardHIDMonitor()
        monitor.onInput = { [weak self] deviceId, kind, code, usage, pressed in
            self?.receivePhysicalInput(
                deviceId: deviceId, isMIDICaptureSource: true,
                kind: kind, code: code, usage: usage, pressed: pressed
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
        let needsPhysicalHID = !snapshot.profiles.isEmpty || midiCaptureDeviceId != nil
        let rawHIDWasRunning = rawHIDMonitor.isRunning
        let physicalHIDWasRunning = physicalHIDMonitor.isRunning
        if needsRawHID {
            do {
                try rawHIDMonitor.start()
            } catch {
                // A Xiaomi remote can already be owned by macOS's HID stack after
                // Bluetooth pairing. Keep the profile runtime usable through the
                // Event Tap and report the raw-report limitation separately.
                NativeOutput.shared.error(
                    id: nil, code: "rawHIDUnavailable", message: error.localizedDescription
                )
            }
        }
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
            if midiCaptureDeviceId == nil { physicalHIDMonitor.stop() }
            if diagnosticKeyboardType == nil && midiCaptureDeviceId == nil { stop() }
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

    func start(promptForPermission: Bool) -> Bool {
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

    func receive(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
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
        if kind == "keyboard",
           powerEventSuppressor.shouldSuppress(keyCode: code, pressed: pressed) {
            return nil
        }
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
        if let physicalInput = consumePhysicalInput(kind: kind, code: code, pressed: pressed) {
            return resolveDeviceEvent(
                input: DeviceInputIdentity(deviceId: physicalInput.deviceId, kind: kind, code: code),
                isMIDICaptureSource: physicalInput.isMIDICaptureSource,
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

    func shutdown() {
        rawHIDMonitor.stop()
        physicalHIDMonitor.stop()
        stop()
    }

}

import AppKit
import ApplicationServices

struct PendingDeviceInputEvent {
    let deviceId: String
    let isMIDICaptureSource: Bool
    let kind: String
    let code: Int
    let pressed: Bool
    let timestamp: UInt64
}

struct ActiveLaunchTrigger: Hashable {
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

func resolveNewDevicePress(
    isMIDICaptureActive: Bool,
    isMIDICaptureSource: Bool,
    otherwise: () -> ActiveDeviceAction
) -> ActiveDeviceAction {
    isMIDICaptureActive && isMIDICaptureSource ? .suppress : otherwise()
}

func resolveProfileAction(
    isProfilesSuspended: Bool,
    otherwise: () -> ActiveDeviceAction
) -> ActiveDeviceAction {
    isProfilesSuspended ? .passthrough : otherwise()
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

let keyboardEventTapCallback: CGEventTapCallBack = { _, type, event, context in
    guard let context else { return Unmanaged.passUnretained(event) }
    return Unmanaged<KeyboardController>.fromOpaque(context).takeUnretainedValue()
        .receive(type: type, event: event)
}

func modifierNames(_ flags: CGEventFlags) -> [String] {
    var values: [String] = []
    if flags.contains(.maskCommand) { values.append("command") }
    if flags.contains(.maskControl) { values.append("control") }
    if flags.contains(.maskAlternate) { values.append("option") }
    if flags.contains(.maskShift) { values.append("shift") }
    if flags.contains(.maskSecondaryFn) { values.append("fn") }
    return values
}

func modifierName(for keyCode: Int) -> String? {
    switch keyCode {
    case 54, 55: "command"
    case 56, 60: "shift"
    case 58, 61: "option"
    case 59, 62: "control"
    case 63: "fn"
    default: nil
    }
}

func eventPressed(type: CGEventType, keyCode: Int, flags: CGEventFlags) -> Bool {
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

func parseSystemEvent(_ event: CGEvent) -> (code: Int, key: String, pressed: Bool)? {
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

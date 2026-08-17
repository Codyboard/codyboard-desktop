import ApplicationServices
import AppKit
import CoreFoundation
import Foundation

private struct HIDFilter: Codable {
    var type: Int?
    var vendorId: Int?
    var productId: Int?
    var usagePage: Int?
    var usage: Int?
    var transport: String?
}

private struct Command: Decodable {
    let id: String
    let method: String
    let filter: HIDFilter?
}

private struct DeviceInfo: Codable {
    let id: String
    let type: Int?
    let vendorId: Int?
    let productId: Int?
    let usagePage: Int?
    let usage: Int?
    let manufacturer: String?
    let product: String?
    let serialNumber: String?
    let transport: String?
    let locationId: Int?
    let properties: [String: String]

    static func keyboard(type: Int) -> DeviceInfo {
        DeviceInfo(
            id: "keyboard-type:\(type)", type: type, vendorId: nil, productId: nil,
            usagePage: 0x07, usage: nil, manufacturer: "Codyboard",
            product: type == 40 ? "Codyboard Presenter" : "Keyboard type \(type)",
            serialNumber: nil, transport: "CGEventTap", locationId: nil,
            properties: ["KeyboardType": String(type)]
        )
    }
}

private struct HIDKeyEvent: Codable {
    let device: DeviceInfo
    let key: String
    let code: Int
    let usagePage: Int
    let pressed: Bool
    let value: Int
    let timestamp: UInt64
    let flags: UInt64
}

private enum Payload: Encodable {
    case devices([DeviceInfo])
    case key(HIDKeyEvent)
    case state([String: Bool])
    case empty

    func encode(to encoder: Encoder) throws {
        switch self {
        case .devices(let value): try value.encode(to: encoder)
        case .key(let value): try value.encode(to: encoder)
        case .state(let value): try value.encode(to: encoder)
        case .empty: try Optional<String>.none.encode(to: encoder)
        }
    }
}

private struct Response: Encodable {
    let id: String?
    let event: String?
    let ok: Bool?
    let data: Payload?
    let error: String?
}

private final class Output: @unchecked Sendable {
    static let shared = Output()
    private let queue = DispatchQueue(label: "app.codyboard.hid.output")
    private let encoder = JSONEncoder()

    func send(_ response: Response) {
        queue.async {
            do {
                var data = try self.encoder.encode(response)
                data.append(0x0A)
                FileHandle.standardOutput.write(data)
            } catch {
                FileHandle.standardError.write(Data("encode error: \(error)\n".utf8))
            }
        }
    }
}

private final class EventTapService: @unchecked Sendable {
    static let shared = EventTapService()

    private var tap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var activeFilter: HIDFilter?

    func start(promptForPermission: Bool) -> Bool {
        if tap != nil { return true }
        let permissionOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: promptForPermission]
        guard AXIsProcessTrustedWithOptions(permissionOptions as CFDictionary) else { return false }

        let mask = CGEventMask((1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue))
        let context = Unmanaged.passUnretained(self).toOpaque()
        guard let createdTap = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: mask, callback: eventTapCallback, userInfo: context
        ) else { return false }

        tap = createdTap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, createdTap, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: createdTap, enable: true)
        return true
    }

    func handle(_ command: Command) {
        switch command.method {
        case "get":
            activeFilter = command.filter
            guard start(promptForPermission: true) else {
                Output.shared.send(Response(
                    id: command.id, event: nil, ok: false, data: nil,
                    error: "需要辅助功能权限。请在系统设置 → 隐私与安全性 → 辅助功能中允许 Codyboard，然后重新扫描。"
                ))
                return
            }
            let devices = command.filter?.type.map { [DeviceInfo.keyboard(type: $0)] } ?? []
            Output.shared.send(Response(id: command.id, event: nil, ok: true, data: .devices(devices), error: nil))
        case "watch":
            activeFilter = command.filter
            Output.shared.send(Response(id: command.id, event: nil, ok: true, data: .empty, error: nil))
        case "permission":
            let trusted = start(promptForPermission: true)
            Output.shared.send(Response(id: command.id, event: nil, ok: true, data: .state(["trusted": trusted]), error: nil))
        default:
            Output.shared.send(Response(id: command.id, event: nil, ok: false, data: nil, error: "Unknown method: \(command.method)"))
        }
    }

    fileprivate func receive(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        guard type == .keyDown || type == .keyUp else { return Unmanaged.passUnretained(event) }

        let keyboardType = Int(event.getIntegerValueField(.keyboardEventKeyboardType))
        if let requestedType = activeFilter?.type, keyboardType != requestedType {
            return Unmanaged.passUnretained(event)
        }

        let keyCode = Int(event.getIntegerValueField(.keyboardEventKeycode))
        let pressed = type == .keyDown
        let payload = HIDKeyEvent(
            device: .keyboard(type: keyboardType), key: keyName(keyCode), code: keyCode,
            usagePage: 0x07, pressed: pressed, value: pressed ? 1 : 0,
            timestamp: event.timestamp, flags: event.flags.rawValue
        )
        Output.shared.send(Response(id: nil, event: pressed ? "keydown" : "keyup", ok: nil, data: .key(payload), error: nil))

        // Milestone 1: app-aware Codyboard Presenter proof-of-concept mappings.
        // Mutating the original event avoids posting a second event back through the tap.
        if keyboardType == 40 {
            let frontmostBundleIdentifier = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
            let mapped: (keyCode: Int64, flags: CGEventFlags)? = if frontmostBundleIdentifier == "com.openai.codex" {
                switch keyCode {
                case 123: (11, .maskCommand) // Left arrow -> Command-B
                case 125: (38, .maskCommand) // Down arrow -> Command-J
                default: nil
                }
            } else {
                switch keyCode {
                case 123: (37, []) // Left arrow -> L
                case 124: (15, []) // Right arrow -> R
                default: nil
                }
            }
            if let mapped {
                event.setIntegerValueField(.keyboardEventKeycode, value: mapped.keyCode)
                event.flags = mapped.flags
            }
        }
        return Unmanaged.passUnretained(event)
    }
}

private let eventTapCallback: CGEventTapCallBack = { _, type, event, context in
    guard let context else { return Unmanaged.passUnretained(event) }
    return Unmanaged<EventTapService>.fromOpaque(context).takeUnretainedValue().receive(type: type, event: event)
}

private func keyName(_ keyCode: Int) -> String {
    [
        0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
        11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 16: "Y", 17: "T", 18: "1", 19: "2",
        20: "3", 21: "4", 22: "6", 23: "5", 24: "=", 25: "9", 26: "7", 27: "-", 28: "8",
        29: "0", 30: "]", 31: "O", 32: "U", 33: "[", 34: "I", 35: "P", 36: "enter",
        37: "L", 38: "J", 39: "'", 40: "K", 41: ";", 42: "\\", 43: ",", 44: "/", 45: "N",
        46: "M", 47: ".", 48: "tab", 49: "space", 50: "`", 51: "backspace", 53: "escape",
        115: "home", 116: "pageUp", 117: "delete", 119: "end", 121: "pageDown",
        123: "arrowLeft", 124: "arrowRight", 125: "arrowDown", 126: "arrowUp"
    ][keyCode] ?? "keycode.\(keyCode)"
}

private func readCommands() {
    let decoder = JSONDecoder()
    while let line = readLine(strippingNewline: true) {
        guard !line.isEmpty else { continue }
        do {
            let command = try decoder.decode(Command.self, from: Data(line.utf8))
            DispatchQueue.main.async { EventTapService.shared.handle(command) }
        } catch {
            Output.shared.send(Response(id: nil, event: "error", ok: nil, data: nil, error: "Invalid command: \(error)"))
        }
    }
    DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetMain()) }
}

DispatchQueue.global(qos: .userInitiated).async(execute: readCommands)
RunLoop.main.run()

import AppKit
import ApplicationServices
import Foundation

final class KeyboardSimulator {
    func sendStroke(_ output: CompiledOutput) throws {
        try post(output, pressed: true, autorepeat: false)
        try post(output, pressed: false, autorepeat: false)
    }

    func post(_ output: CompiledOutput, pressed: Bool, autorepeat: Bool) throws {
        switch output.kind {
        case "keyboard":
            guard let code = output.code,
                  let event = CGEvent(keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: pressed) else {
                throw simulationError("Unable to create keyboard event")
            }
            event.flags = flags(output.modifiers)
            event.setIntegerValueField(.keyboardEventAutorepeat, value: autorepeat ? 1 : 0)
            event.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
            event.post(tap: .cghidEventTap)
        case "system":
            guard let code = output.code else { throw simulationError("Missing system key code") }
            let state = pressed ? 0x0A : 0x0B
            let data1 = (code << 16) | (state << 8)
            guard let nsEvent = NSEvent.otherEvent(
                with: .systemDefined, location: .zero, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: 0, context: nil, subtype: 8, data1: data1, data2: -1
            ), let event = nsEvent.cgEvent else { throw simulationError("Unable to create system-defined event") }
            event.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
            event.post(tap: .cghidEventTap)
        default:
            throw simulationError("Output kind \(output.kind) cannot be simulated")
        }
    }

    private func flags(_ modifiers: [String]) -> CGEventFlags {
        modifiers.reduce(into: CGEventFlags()) { flags, modifier in
            switch modifier {
            case "command": flags.insert(.maskCommand)
            case "control": flags.insert(.maskControl)
            case "option": flags.insert(.maskAlternate)
            case "shift": flags.insert(.maskShift)
            case "fn": flags.insert(.maskSecondaryFn)
            default: break
            }
        }
    }

    private func simulationError(_ message: String) -> NSError {
        NSError(domain: "app.codyboard.keyboard", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

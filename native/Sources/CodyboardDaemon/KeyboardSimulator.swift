import AppKit
import ApplicationServices
import Foundation

final class KeyboardSimulator {
    private var modifierLedger = SyntheticModifierLedger()

    func sendStroke(_ output: CompiledOutput) throws {
        try post(output, pressed: true, autorepeat: false)
        try post(output, pressed: false, autorepeat: false)
    }

    func sendText(_ text: String, pressEnter: Bool) throws {
        guard !text.isEmpty else { throw simulationError("Text cannot be empty") }
        let codeUnits = Array(text.utf16)
        var start = 0
        while start < codeUnits.count {
            var end = min(start + 20, codeUnits.count)
            if end < codeUnits.count,
               (0xD800...0xDBFF).contains(codeUnits[end - 1]),
               (0xDC00...0xDFFF).contains(codeUnits[end]) {
                end -= 1
            }
            let chunk = Array(codeUnits[start..<end])
            guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                  let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
                throw simulationError("Unable to create Unicode keyboard event")
            }
            chunk.withUnsafeBufferPointer { buffer in
                keyDown.keyboardSetUnicodeString(
                    stringLength: buffer.count,
                    unicodeString: buffer.baseAddress
                )
            }
            keyDown.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
            keyUp.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
            keyDown.post(tap: .cghidEventTap)
            keyUp.post(tap: .cghidEventTap)
            start = end
        }
        if pressEnter {
            try sendStroke(CompiledOutput(kind: "keyboard", code: 36, modifiers: []))
        }
    }

    func post(_ output: CompiledOutput, pressed: Bool, autorepeat: Bool) throws {
        switch output.kind {
        case "keyboard":
            guard let code = output.code else {
                throw simulationError("Unable to create keyboard event")
            }
            let releasesModifiers = !pressed
            defer {
                if releasesModifiers { release(output.modifiers.reversed()) }
            }
            guard let event = CGEvent(
                keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: pressed
            ) else { throw simulationError("Unable to create keyboard event") }
            if pressed && !autorepeat { acquire(output.modifiers) }
            event.flags = flags(modifierLedger.activeModifiers)
            event.setIntegerValueField(.keyboardEventAutorepeat, value: autorepeat ? 1 : 0)
            event.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
            event.post(tap: .cghidEventTap)
        case "modifier":
            guard let modifier = output.modifier else { throw simulationError("Missing modifier name") }
            if pressed {
                acquire(output.modifiers)
                acquire([modifier])
            } else {
                release([modifier])
                release(output.modifiers.reversed())
            }
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

    private func acquire<S: Sequence>(_ modifiers: S) where S.Element == String {
        for modifier in modifiers where modifierLedger.press(modifier) {
            postModifier(modifier, pressed: true)
        }
    }

    private func release<S: Sequence>(_ modifiers: S) where S.Element == String {
        for modifier in modifiers where modifierLedger.release(modifier) {
            postModifier(modifier, pressed: false)
        }
    }

    private func postModifier(_ modifier: String, pressed: Bool) {
        guard let code = modifierKeyCode(modifier),
              let event = CGEvent(
                  keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: pressed
              ) else { return }
        event.flags = flags(modifierLedger.activeModifiers)
        event.type = .flagsChanged
        event.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
        event.post(tap: .cghidEventTap)
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

    private func flag(for modifier: String) -> CGEventFlags {
        switch modifier {
        case "command": return .maskCommand
        case "control": return .maskControl
        case "option": return .maskAlternate
        case "shift": return .maskShift
        case "fn": return .maskSecondaryFn
        case "capsLock": return .maskAlphaShift
        default: return []
        }
    }

    private func modifierKeyCode(_ modifier: String) -> Int? {
        switch modifier {
        case "command": return 55
        case "control": return 59
        case "option": return 58
        case "shift": return 56
        case "fn": return 63
        case "capsLock": return 57
        default: return nil
        }
    }

    private func simulationError(_ message: String) -> NSError {
        NSError(domain: "app.codyboard.keyboard", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

struct SyntheticModifierLedger {
    private var holdCounts: [String: Int] = [:]

    var activeModifiers: [String] { holdCounts.keys.sorted() }

    mutating func press(_ modifier: String) -> Bool {
        let count = holdCounts[modifier, default: 0]
        holdCounts[modifier] = count + 1
        return count == 0
    }

    mutating func release(_ modifier: String) -> Bool {
        guard let count = holdCounts[modifier] else { return false }
        if count > 1 {
            holdCounts[modifier] = count - 1
            return false
        }
        holdCounts.removeValue(forKey: modifier)
        return true
    }
}

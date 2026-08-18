import CoreFoundation
import Foundation
import IOKit.hid

private func sweepProInputValue(
    context: UnsafeMutableRawPointer?,
    result: IOReturn,
    sender: UnsafeMutableRawPointer?,
    value: IOHIDValue
) {
    guard let context, result == kIOReturnSuccess else { return }
    let monitor = Unmanaged<PhysicalKeyboardHIDMonitor>.fromOpaque(context).takeUnretainedValue()
    monitor.receive(value)
}

/// Physical identity path for supported keyboards. Its values are correlated with
/// the following Event Tap event, where the original event can be rewritten.
final class PhysicalKeyboardHIDMonitor {
    private var manager: IOHIDManager?
    var onInput: ((String, String, Int, UInt32, Bool) -> Void)?
    var isRunning: Bool { manager != nil }

    func start() throws {
        if manager != nil { return }
        let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        let matching: [String: Int] = [
            kIOHIDVendorIDKey as String: 0x1D50,
            kIOHIDProductIDKey as String: 0x615E,
            kIOHIDPrimaryUsagePageKey as String: kHIDPage_GenericDesktop,
            kIOHIDPrimaryUsageKey as String: kHIDUsage_GD_Keyboard,
        ]
        IOHIDManagerSetDeviceMatching(manager, matching as CFDictionary)
        IOHIDManagerRegisterInputValueCallback(
            manager, sweepProInputValue, Unmanaged.passUnretained(self).toOpaque()
        )
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        guard result == kIOReturnSuccess else {
            IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
            throw NSError(
                domain: "app.codyboard.physical-hid", code: Int(result),
                userInfo: [NSLocalizedDescriptionKey: "无法监听物理键盘（错误 \(result)）"]
            )
        }
        self.manager = manager
    }

    func stop() {
        guard let manager else { return }
        IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        self.manager = nil
    }

    fileprivate func receive(_ value: IOHIDValue) {
        guard manager != nil else { return }
        let element = IOHIDValueGetElement(value)
        let usagePage = IOHIDElementGetUsagePage(element)
        let device = IOHIDElementGetDevice(element)
        var registryID: UInt64 = 0
        guard IORegistryEntryGetRegistryEntryID(IOHIDDeviceGetService(device), &registryID) == kIOReturnSuccess else { return }
        let deviceId = String(format: "0x%llx", registryID)
        let usage = IOHIDElementGetUsage(element)
        let pressed = IOHIDValueGetIntegerValue(value) != 0
        if usagePage == UInt32(kHIDPage_KeyboardOrKeypad), let keyCode = Self.keyCodes[usage] {
            let kind = Self.modifierUsages.contains(usage) ? "modifier" : "keyboard"
            onInput?(deviceId, kind, keyCode, usage, pressed)
        } else if usagePage == UInt32(kHIDPage_Consumer), let systemCode = Self.systemCodes[usage] {
            onInput?(deviceId, "system", systemCode, usage, pressed)
        }
    }

    deinit { stop() }

    static let keyCodes: [UInt32: Int] = [
        0x04: 0, 0x05: 11, 0x06: 8, 0x07: 2, 0x08: 14, 0x09: 3,
        0x0A: 5, 0x14: 12, 0x15: 15, 0x16: 1, 0x17: 17, 0x19: 9, 0x1A: 13,
        0x1B: 7, 0x1D: 6, 0x29: 53, 0x2B: 48, 0x4F: 124, 0x50: 123,
        0x51: 125, 0x52: 126,
        0xE1: 56,
    ]

    private static let modifierUsages: Set<UInt32> = [0xE1]

    private static let systemCodes: [UInt32: Int] = [
        0xE2: 7, 0xE9: 0, 0xEA: 1,
        0xB5: 17, 0xB6: 18, 0xCD: 16,
    ]
}

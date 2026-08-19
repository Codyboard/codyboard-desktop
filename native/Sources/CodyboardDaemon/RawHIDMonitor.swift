import CoreFoundation
import Foundation
import IOKit.hid

private func rawHIDInputReport(
    context: UnsafeMutableRawPointer?,
    result: IOReturn,
    sender: UnsafeMutableRawPointer?,
    type: IOHIDReportType,
    reportID: UInt32,
    report: UnsafeMutablePointer<UInt8>,
    reportLength: CFIndex
) {
    guard let context, result == kIOReturnSuccess, reportLength > 0 else { return }
    let monitor = Unmanaged<RawHIDMonitor>.fromOpaque(context).takeUnretainedValue()
    monitor.receive(reportID: reportID, data: Data(bytes: report, count: reportLength))
}

private func rawHIDInputValue(
    context: UnsafeMutableRawPointer?, result: IOReturn,
    sender: UnsafeMutableRawPointer?, value: IOHIDValue
) {
    guard let context, result == kIOReturnSuccess else { return }
    Unmanaged<RawHIDMonitor>.fromOpaque(context).takeUnretainedValue().receive(value: value)
}

private func rawHIDDeviceMatched(
    context: UnsafeMutableRawPointer?, result: IOReturn,
    sender: UnsafeMutableRawPointer?, device: IOHIDDevice
) {
    guard let context, result == kIOReturnSuccess else { return }
    Unmanaged<RawHIDMonitor>.fromOpaque(context).takeUnretainedValue()
        .deviceMatched(device)
}

/// Raw report bridge for the Xiaomi RC003/Codyboard Presenter. Most buttons
/// become CGEvents; vendor usage 0xF1 (Back) exists only in report ID 1.
final class RawHIDMonitor {
    static let keyboardType = 40
    private static let vendorID = 0x2717
    private static let productID = 0x32B8

    private var manager: IOHIDManager?
    private var deviceId: String?
    private var activeUsages = Set<UInt16>()
    private let protection: XiaomiHIDProtectionController
    var onUsage: ((String, UInt16, Bool) -> Void)?
    var onInput: ((String, String, Int, UInt32, Bool) -> Void)?
    var onReset: (() -> Void)?
    var isRunning: Bool { manager != nil }

    init(protection: XiaomiHIDProtectionController = XiaomiHIDProtectionController()) {
        self.protection = protection
    }

    static var hasInputMonitoringAccess: Bool {
        IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted
    }

    @discardableResult
    static func requestInputMonitoringAccess() -> Bool {
        IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
    }

    func start() throws {
        if manager != nil { return }
        guard Self.hasInputMonitoringAccess else {
            _ = Self.requestInputMonitoringAccess()
            throw NSError(
                domain: "app.codyboard.permissions", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "需要输入监控权限。请在系统设置 → 隐私与安全性 → 输入监控中允许 CodyboardDaemon，然后重新启动。"]
            )
        }

        guard protection.refresh() else {
            throw NSError(
                domain: "app.codyboard.hid", code: 3,
                userInfo: [NSLocalizedDescriptionKey: "无法安全屏蔽遥控器电源键；HID 监听未启动。"]
            )
        }

        let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        let matching = [
            kIOHIDVendorIDKey as String: Self.vendorID,
            kIOHIDProductIDKey as String: Self.productID,
        ] as CFDictionary
        IOHIDManagerSetDeviceMatching(manager, matching)
        IOHIDManagerRegisterDeviceMatchingCallback(
            manager, rawHIDDeviceMatched, Unmanaged.passUnretained(self).toOpaque()
        )
        IOHIDManagerRegisterInputReportCallback(
            manager, rawHIDInputReport, Unmanaged.passUnretained(self).toOpaque()
        )
        IOHIDManagerRegisterInputValueCallback(
            manager, rawHIDInputValue, Unmanaged.passUnretained(self).toOpaque()
        )
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        guard result == kIOReturnSuccess else {
            IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
            protection.restore()
            throw NSError(
                domain: "app.codyboard.hid", code: Int(result),
                userInfo: [NSLocalizedDescriptionKey: "无法打开 Codyboard Presenter 原始 HID 报告（错误 \(result)）"]
            )
        }
        if let device = (IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice>)?.first {
            deviceId = HIDProfileDomain.named(
                IOHIDDeviceGetProperty(device, kIOHIDProductKey as CFString) as? String,
                fallbackName: "小米蓝牙语音遥控器"
            )
        }
        self.manager = manager
    }

    func stop() {
        activeUsages.removeAll()
        deviceId = nil
        onReset?()
        if let manager {
            IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
            IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
            self.manager = nil
        }
        protection.restore()
    }

    fileprivate func deviceMatched(_ device: IOHIDDevice) {
        deviceId = HIDProfileDomain.named(
            IOHIDDeviceGetProperty(device, kIOHIDProductKey as CFString) as? String,
            fallbackName: "小米蓝牙语音遥控器"
        )
        if !protection.refresh() {
            NativeOutput.shared.error(
                id: nil, code: "powerProtectionFailed",
                message: "遥控器已连接，但无法安全屏蔽电源键。"
            )
        }
    }

    fileprivate func receive(reportID: UInt32, data: Data) {
        guard manager != nil, reportID == 1 else { return }
        var bytes = Array(data)
        if bytes.count == 7, bytes.first == UInt8(reportID) { bytes.removeFirst() }
        guard !bytes.isEmpty, bytes.count.isMultiple(of: 2) else { return }
        var usages = Set<UInt16>()
        for index in stride(from: 0, to: bytes.count, by: 2) {
            let usage = UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8
            if usage != 0 { usages.insert(usage) }
        }
        let pressed = usages.subtracting(activeUsages)
        let released = activeUsages.subtracting(usages)
        activeUsages = usages
        guard let deviceId else { return }
        for usage in pressed.sorted() where accepts(usage) { onUsage?(deviceId, usage, true) }
        for usage in released.sorted() where accepts(usage) { onUsage?(deviceId, usage, false) }
    }

    private func accepts(_ usage: UInt16) -> Bool {
        usage != XiaomiHIDProtectionController.powerUsage || protection.isPowerProtected
    }

    fileprivate func receive(value: IOHIDValue) {
        guard manager != nil, let deviceId else { return }
        let element = IOHIDValueGetElement(value)
        let usagePage = IOHIDElementGetUsagePage(element)
        let usage = IOHIDElementGetUsage(element)
        let pressed = IOHIDValueGetIntegerValue(value) != 0
        if usagePage == UInt32(kHIDPage_KeyboardOrKeypad), let keyCode = Self.keyCodes[usage] {
            onInput?(deviceId, "keyboard", keyCode, usage, pressed)
        } else if usagePage == UInt32(kHIDPage_Consumer), let systemCode = Self.systemCodes[usage] {
            onInput?(deviceId, "system", systemCode, usage, pressed)
        }
    }

    deinit { stop() }

    private static let keyCodes: [UInt32: Int] = [
        0x28: 36, 0x35: 50, 0x3E: 96, 0x4A: 115,
        0x4F: 124, 0x50: 123, 0x51: 125, 0x52: 126, 0x65: 110,
    ]

    private static let systemCodes: [UInt32: Int] = [
        0xE2: 7, 0xE9: 0, 0xEA: 1,
    ]
}

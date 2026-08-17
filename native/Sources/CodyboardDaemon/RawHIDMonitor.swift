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

/// Raw report bridge for the Xiaomi RC003/Codyboard Presenter. Most buttons
/// become CGEvents; vendor usage 0xF1 (Back) exists only in report ID 1.
final class RawHIDMonitor {
    static let keyboardType = 40
    private static let vendorID = 0x2717
    private static let productID = 0x32B8

    private var manager: IOHIDManager?
    private var activeUsages = Set<UInt16>()
    var onUsage: ((UInt16, Bool) -> Void)?
    var isRunning: Bool { manager != nil }

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

        let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        let matching = [
            kIOHIDVendorIDKey as String: Self.vendorID,
            kIOHIDProductIDKey as String: Self.productID,
        ] as CFDictionary
        IOHIDManagerSetDeviceMatching(manager, matching)
        IOHIDManagerRegisterInputReportCallback(
            manager, rawHIDInputReport, Unmanaged.passUnretained(self).toOpaque()
        )
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        let result = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        guard result == kIOReturnSuccess else {
            IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
            throw NSError(
                domain: "app.codyboard.hid", code: Int(result),
                userInfo: [NSLocalizedDescriptionKey: "无法打开 Codyboard Presenter 原始 HID 报告（错误 \(result)）"]
            )
        }
        self.manager = manager
    }

    func stop() {
        activeUsages.removeAll()
        guard let manager else { return }
        IOHIDManagerUnscheduleFromRunLoop(manager, CFRunLoopGetMain(), CFRunLoopMode.commonModes.rawValue)
        IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        self.manager = nil
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
        for usage in pressed.sorted() { onUsage?(usage, true) }
        for usage in released.sorted() { onUsage?(usage, false) }
    }

    deinit { stop() }
}

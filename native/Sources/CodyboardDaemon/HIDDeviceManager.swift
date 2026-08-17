import CoreFoundation
import Foundation
import IOKit
import IOKit.hid

final class HIDDeviceManager {
    func listKeyboards(includeVirtual: Bool) -> [DeviceInfo] {
        let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        IOHIDManagerSetDeviceMatching(manager, nil)
        let devices = IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice> ?? []
        return devices
            .filter(isKeyboard)
            .map(deviceInfo)
            .filter { includeVirtual || !$0.isVirtual }
            .sorted { ($0.product ?? "", $0.id) < ($1.product ?? "", $1.id) }
    }

    private func isKeyboard(_ device: IOHIDDevice) -> Bool {
        IOHIDDeviceConformsTo(device, UInt32(kHIDPage_GenericDesktop), UInt32(kHIDUsage_GD_Keyboard)) ||
        IOHIDDeviceConformsTo(device, UInt32(kHIDPage_GenericDesktop), UInt32(kHIDUsage_GD_Keypad))
    }

    private func deviceInfo(_ device: IOHIDDevice) -> DeviceInfo {
        var registryID: UInt64 = 0
        IORegistryEntryGetRegistryEntryID(IOHIDDeviceGetService(device), &registryID)
        func property(_ key: String) -> Any? { IOHIDDeviceGetProperty(device, key as CFString) }
        func integer(_ keys: String...) -> Int? {
            for key in keys { if let value = property(key) as? NSNumber { return value.intValue } }
            return nil
        }
        func string(_ keys: String...) -> String? {
            for key in keys { if let value = property(key) as? String { return value } }
            return nil
        }

        let rawKeys = [
            "Transport", "VendorID", "ProductID", "LocationID", "PrimaryUsagePage", "PrimaryUsage",
            "Manufacturer", "Product", "SerialNumber", "Built-In", "KeyboardType", "HIDKeyboardType",
            "DeviceType", "PhysicalDeviceUniqueID", "HIDVirtualDevice", "IOUserServerName", "CFBundleIdentifier"
        ]
        var properties: [String: String] = [:]
        for key in rawKeys { if let value = property(key) { properties[key] = String(describing: value) } }

        let transport = string(kIOHIDTransportKey as String)
        let evidence = [
            transport, string(kIOHIDProductKey as String), string(kIOHIDManufacturerKey as String),
            string(kIOHIDSerialNumberKey as String), string("IOUserServerName"), string("CFBundleIdentifier")
        ].compactMap { $0 }.joined(separator: " ").lowercased()
        let isVirtual = (property("HIDVirtualDevice") as? NSNumber)?.boolValue == true ||
            transport?.localizedCaseInsensitiveCompare(kIOHIDTransportVirtualValue as String) == .orderedSame ||
            evidence.contains("virtualhid") || evidence.contains("virtual hid")

        return DeviceInfo(
            id: String(format: "0x%llx", registryID),
            type: integer("KeyboardType", "HIDKeyboardType", "DeviceType"),
            vendorId: integer(kIOHIDVendorIDKey as String), productId: integer(kIOHIDProductIDKey as String),
            usagePage: integer(kIOHIDPrimaryUsagePageKey as String), usage: integer(kIOHIDPrimaryUsageKey as String),
            manufacturer: string(kIOHIDManufacturerKey as String), product: string(kIOHIDProductKey as String),
            serialNumber: string(kIOHIDSerialNumberKey as String), transport: transport,
            locationId: integer(kIOHIDLocationIDKey as String), isVirtual: isVirtual, properties: properties
        )
    }
}

import CoreFoundation
import Foundation
import IOKit.hid
import IOKit.hidsystem

struct XiaomiHIDMapping: Equatable {
    static let sourceKey = "HIDKeyboardModifierMappingSrc"
    static let destinationKey = "HIDKeyboardModifierMappingDst"

    let source: UInt64
    let destination: UInt64

    init(source: UInt64, destination: UInt64) {
        self.source = source
        self.destination = destination
    }

    init?(property: [String: NSNumber]) {
        guard let source = property[Self.sourceKey],
              let destination = property[Self.destinationKey] else { return nil }
        self.source = source.uint64Value
        self.destination = destination.uint64Value
    }

    var property: [String: NSNumber] {
        [
            Self.sourceKey: NSNumber(value: source),
            Self.destinationKey: NSNumber(value: destination),
        ]
    }
}

struct XiaomiHIDMappingService {
    let id: UInt64
    private let owner: AnyObject?
    let read: () -> [XiaomiHIDMapping]
    let write: ([XiaomiHIDMapping]) -> Bool

    init(
        id: UInt64,
        owner: AnyObject? = nil,
        read: @escaping () -> [XiaomiHIDMapping],
        write: @escaping ([XiaomiHIDMapping]) -> Bool
    ) {
        self.id = id
        self.owner = owner
        self.read = read
        self.write = write
    }
}

/// Neutralizes the Xiaomi remote's Power usage before macOS can interpret it
/// as a sleep request. Raw report callbacks still contain the original 0x66.
final class XiaomiHIDProtectionController {
    typealias ServiceProvider = () -> [XiaomiHIDMappingService]

    static let powerUsage: UInt16 = 0x66
    static let protectedKeyCode = 90 // F20
    static let powerMapping = XiaomiHIDMapping(
        source: 0x0000_0007_0000_0066,
        destination: 0x0000_0007_0000_006F
    )

    private static let vendorID = 0x2717
    private static let productID = 0x32B8
    private static let mappingProperty = "UserKeyMapping" as CFString

    private let services: ServiceProvider
    private var originals: [UInt64: [XiaomiHIDMapping]] = [:]
    private(set) var protectedServiceIDs = Set<UInt64>()
    private var lastRefreshSucceeded = true

    var isPowerProtected: Bool {
        lastRefreshSucceeded && !protectedServiceIDs.isEmpty
    }

    init(services: @escaping ServiceProvider = systemServices) {
        self.services = services
    }

    /// Applies protection to every currently visible service. No visible
    /// service is not an error: the IOHID matching callback retries on connect.
    @discardableResult
    func refresh() -> Bool {
        let available = services()
        guard !available.isEmpty else { return true }

        var changed: [(XiaomiHIDMappingService, [XiaomiHIDMapping])] = []
        for service in available where !protectedServiceIDs.contains(service.id) {
            let current = service.read()
            let desired = current.filter { $0.source != Self.powerMapping.source }
                + [Self.powerMapping]
            guard service.write(desired) else {
                lastRefreshSucceeded = false
                for (applied, previous) in changed.reversed() {
                    _ = applied.write(previous)
                    originals.removeValue(forKey: applied.id)
                    protectedServiceIDs.remove(applied.id)
                }
                return false
            }
            originals[service.id] = current
            protectedServiceIDs.insert(service.id)
            changed.append((service, current))
        }
        lastRefreshSucceeded = true
        return true
    }

    func restore() {
        guard !originals.isEmpty else { return }
        let available = Dictionary(uniqueKeysWithValues: services().map { ($0.id, $0) })
        for (id, original) in originals {
            guard let service = available[id] else { continue }
            _ = service.write(original)
        }
        originals.removeAll()
        protectedServiceIDs.removeAll()
        lastRefreshSucceeded = true
    }

    private static func systemServices() -> [XiaomiHIDMappingService] {
        let client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
        let allServices = IOHIDEventSystemClientCopyServices(client) as? [IOHIDServiceClient] ?? []
        return allServices.compactMap { service in
            guard integerProperty(service, key: kIOHIDVendorIDKey as CFString) == vendorID,
                  integerProperty(service, key: kIOHIDProductIDKey as CFString) == productID,
                  let id = (IOHIDServiceClientGetRegistryID(service) as? NSNumber)?.uint64Value
            else { return nil }
            return XiaomiHIDMappingService(
                id: id,
                owner: client,
                read: {
                    let properties = IOHIDServiceClientCopyProperty(
                        service, mappingProperty
                    ) as? [[String: NSNumber]] ?? []
                    return properties.compactMap(XiaomiHIDMapping.init(property:))
                },
                write: { mappings in
                    IOHIDServiceClientSetProperty(
                        service, mappingProperty, mappings.map(\.property) as CFArray
                    )
                }
            )
        }
    }

    private static func integerProperty(
        _ service: IOHIDServiceClient, key: CFString
    ) -> Int? {
        (IOHIDServiceClientCopyProperty(service, key) as? NSNumber)?.intValue
    }
}

final class XiaomiPowerEventSuppressor {
    private var rawPowerHeld = false
    private var pendingReleaseDeadline: TimeInterval?

    func arm(pressed: Bool, now: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        if pressed {
            rawPowerHeld = true
            pendingReleaseDeadline = nil
        } else {
            rawPowerHeld = false
            pendingReleaseDeadline = now + 0.18
        }
    }

    func shouldSuppress(
        keyCode: Int, pressed: Bool,
        now: TimeInterval = ProcessInfo.processInfo.systemUptime
    ) -> Bool {
        guard keyCode == XiaomiHIDProtectionController.protectedKeyCode else { return false }
        if pressed { return rawPowerHeld }
        guard let deadline = pendingReleaseDeadline, now <= deadline else {
            pendingReleaseDeadline = nil
            return false
        }
        pendingReleaseDeadline = nil
        return true
    }

    func reset() {
        rawPowerHeld = false
        pendingReleaseDeadline = nil
    }
}

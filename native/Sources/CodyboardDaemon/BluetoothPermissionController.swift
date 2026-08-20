import CoreBluetooth
import Foundation

final class BluetoothPermissionController: NSObject, CBCentralManagerDelegate {
    private var manager: CBCentralManager?

    static var status: String {
        switch CBManager.authorization {
        case .allowedAlways: "allowed"
        case .denied: "denied"
        case .restricted: "restricted"
        case .notDetermined: "notDetermined"
        @unknown default: "restricted"
        }
    }

    func request() {
        guard Self.status == "notDetermined", manager == nil else { return }
        manager = CBCentralManager(
            delegate: self, queue: .main,
            options: [CBCentralManagerOptionShowPowerAlertKey: false]
        )
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard manager === central, Self.status != "notDetermined" else { return }
        central.delegate = nil
        manager = nil
    }
}

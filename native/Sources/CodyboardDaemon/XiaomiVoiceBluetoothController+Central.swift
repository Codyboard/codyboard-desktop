import CoreBluetooth
import Foundation

extension XiaomiVoiceBluetoothController: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard self.central === central, let generation = centralGeneration else { return }
        switch central.state {
        case .poweredOn:
            discoverOrScan(central, generation: generation)
        case .poweredOff:
            lastError = "Bluetooth is powered off"
            state = .unavailable
        case .unauthorized:
            lastError = "Bluetooth permission is denied"
            state = .unavailable
        case .unsupported:
            lastError = "Bluetooth is unsupported"
            state = .unavailable
        case .resetting:
            lastError = "Bluetooth is resetting"
            state = .unavailable
        case .unknown:
            lastError = nil
            state = .unavailable
        @unknown default:
            lastError = "Bluetooth is unavailable"
            state = .unavailable
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        guard self.central === central, let generation = centralGeneration,
              phase == .scanning(generation), self.peripheral == nil
        else { return }
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let advertisedServices = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
        let matchesService = advertisedServices?.contains(serviceUUID) == true
        if let target = configuration.targetIdentifier {
            guard UUID(uuidString: target) == peripheral.identifier else { return }
        } else {
            guard matchesService || XiaomiVoiceRemoteNameMatcher.matches(peripheral.name)
                    || XiaomiVoiceRemoteNameMatcher.matches(advertisedName) else { return }
        }
        connect(peripheral, manager: central, generation: generation)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard self.central === central, self.peripheral === peripheral,
              let generation = centralGeneration, phase.acceptsDidConnect(generation)
        else { return }
        timeoutWorkItem?.cancel()
        phase = .discovering(generation)
        state = .discovering
        deviceName = peripheral.name
        scheduleTimeout(generation: generation, expected: .discovering(generation))
        peripheral.discoverServices([serviceUUID])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        guard self.central === central, self.peripheral === peripheral,
              let generation = centralGeneration,
              phase == .connecting(generation) || phase == .disconnecting(generation)
        else { return }
        fail(error?.localizedDescription ?? "Failed to connect to Xiaomi remote")
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        guard self.central === central, self.peripheral === peripheral,
              let generation = centralGeneration, phase.acceptsDisconnect(generation)
        else { return }
        lastError = error?.localizedDescription
        scheduleReconnect()
    }
}

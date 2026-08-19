import CoreBluetooth
import Foundation

extension XiaomiVoiceBluetoothController {
    func didDiscoverServices(
        _ peripheral: CBPeripheral, generation: UInt64, error: Error?
    ) {
        guard isCurrent(peripheral, generation: generation),
              phase.acceptsInitialization(generation) else { return }
        if let error {
            fail("ATVV service discovery failed: \(error.localizedDescription)")
            return
        }
        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            fail("Xiaomi remote does not expose the ATVV service")
            return
        }
        peripheral.discoverCharacteristics(
            [transmitUUID, audioUUID, controlUUID], for: service
        )
    }

    func didDiscoverCharacteristics(
        _ peripheral: CBPeripheral,
        generation: UInt64,
        service: CBService,
        error: Error?
    ) {
        guard isCurrent(peripheral, generation: generation),
              phase.acceptsInitialization(generation) else { return }
        if let error {
            fail("ATVV characteristic discovery failed: \(error.localizedDescription)")
            return
        }
        for characteristic in service.characteristics ?? [] {
            switch characteristic.uuid {
            case transmitUUID:
                transmitCharacteristic = characteristic
            case audioUUID:
                audioCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            case controlUUID:
                controlCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            default:
                break
            }
        }
        guard transmitCharacteristic != nil, audioCharacteristic != nil,
              controlCharacteristic != nil else {
            fail("Xiaomi remote ATVV characteristics are incomplete")
            return
        }
        requestCapabilitiesIfReady(generation: generation)
    }

    func didUpdateNotification(
        _ peripheral: CBPeripheral,
        generation: UInt64,
        characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard isCurrent(peripheral, generation: generation),
              phase.acceptsNotification(generation) else { return }
        if let error {
            fail("ATVV subscription failed: \(error.localizedDescription)")
            return
        }
        guard characteristic.uuid == audioUUID || characteristic.uuid == controlUUID,
              characteristic.isNotifying else {
            fail("ATVV notification channel is inactive")
            return
        }
        subscribedUUIDs.insert(characteristic.uuid)
        requestCapabilitiesIfReady(generation: generation)
    }

    func didUpdateValue(
        _ peripheral: CBPeripheral,
        generation: UInt64,
        characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard isCurrent(peripheral, generation: generation) else { return }
        if let error {
            fail("ATVV notification failed: \(error.localizedDescription)")
            return
        }
        guard let data = characteristic.value else { return }
        if characteristic.uuid == controlUUID {
            guard phase.acceptsCapabilities(generation)
                    || phase.acceptsProtocolData(generation) else { return }
            handleControl(data, generation: generation)
        } else if characteristic.uuid == audioUUID {
            handleAudio(data, generation: generation)
        }
    }

    private func isCurrent(_ candidate: CBPeripheral, generation: UInt64) -> Bool {
        peripheral === candidate && centralGeneration == generation
    }
}

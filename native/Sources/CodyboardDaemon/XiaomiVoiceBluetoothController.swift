import CoreBluetooth
import Foundation

final class XiaomiPeripheralDelegateProxy: NSObject, CBPeripheralDelegate {
    let generation: UInt64
    weak var owner: XiaomiVoiceBluetoothController?

    init(generation: UInt64, owner: XiaomiVoiceBluetoothController) {
        self.generation = generation
        self.owner = owner
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        owner?.didDiscoverServices(peripheral, generation: generation, error: error)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        owner?.didDiscoverCharacteristics(
            peripheral, generation: generation, service: service, error: error
        )
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        owner?.didUpdateNotification(
            peripheral, generation: generation, characteristic: characteristic, error: error
        )
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        owner?.didUpdateValue(
            peripheral, generation: generation, characteristic: characteristic, error: error
        )
    }
}

final class XiaomiVoiceBluetoothController: NSObject {
    let serviceUUID = CBUUID(string: ATVVProtocol.serviceUUID)
    let transmitUUID = CBUUID(string: ATVVProtocol.transmitUUID)
    let audioUUID = CBUUID(string: ATVVProtocol.audioUUID)
    let controlUUID = CBUUID(string: ATVVProtocol.controlUUID)

    var central: CBCentralManager?
    var centralGeneration: UInt64?
    var peripheral: CBPeripheral?
    var peripheralProxy: XiaomiPeripheralDelegateProxy?
    var transmitCharacteristic: CBCharacteristic?
    var audioCharacteristic: CBCharacteristic?
    var controlCharacteristic: CBCharacteristic?
    var subscribedUUIDs = Set<CBUUID>()
    var reconnectWorkItem: DispatchWorkItem?
    var timeoutWorkItem: DispatchWorkItem?
    var generation: UInt64 = 0
    var phase: BluetoothLifecyclePhase = .stopped
    var configuration = VoiceConfiguration.disabled
    var capabilitiesRequested = false
    var processor = ATVVVoiceStreamProcessor()
    var streamGeneration: UInt64?
    var microphoneOpened = false
    var deviceName: String?
    var lastError: String?

    var onPCM: (([Int16]) -> Bool)?
    var onStreamStarted: (() -> Bool)?
    var onStreamStopped: (() -> Void)?
    var streamOutputReady = false

    var state: VoiceBluetoothState = .stopped {
        didSet {
            if oldValue != state { publishState() }
        }
    }

    var status: VoiceStatus {
        VoiceStatus(
            state: state, enabled: configuration.enabled,
            deviceIdentifier: peripheral?.identifier.uuidString
                ?? configuration.targetIdentifier,
            deviceName: deviceName, capabilities: processor.capabilities,
            streaming: processor.isStreaming, generation: phase.generation,
            error: lastError
        )
    }

    func configure(_ configuration: VoiceConfiguration) throws -> VoiceStatus {
        guard configuration.gainDB.isFinite,
              (-24...24).contains(configuration.gainDB)
        else { throw voiceError("gainDB must be finite and between -24 and 24") }
        if let identifier = configuration.targetIdentifier, UUID(uuidString: identifier) == nil {
            throw voiceError("targetIdentifier must be a UUID")
        }
        let requiresRestart = self.configuration.targetIdentifier != configuration.targetIdentifier
        self.configuration = configuration
        if !configuration.enabled {
            stop()
        } else if requiresRestart || central == nil {
            stopConnection(publishStopped: false)
            start()
        } else {
            publishState()
        }
        return status
    }

    func start() {
        guard configuration.enabled, central == nil else { return }
        reconnectWorkItem?.cancel()
        generation &+= 1
        let current = generation
        phase = .scanning(current)
        lastError = nil
        let manager = CBCentralManager(
            delegate: self, queue: .main,
            options: [CBCentralManagerOptionShowPowerAlertKey: true]
        )
        central = manager
        centralGeneration = current
        if manager.state == .poweredOn { discoverOrScan(manager, generation: current) }
    }

    func stop() {
        configuration = VoiceConfiguration(
            enabled: false, targetIdentifier: configuration.targetIdentifier,
            gainDB: configuration.gainDB
        )
        stopConnection(publishStopped: true)
    }

    func shutdown() {
        stopConnection(publishStopped: false)
        configuration = .disabled
    }

    func discoverOrScan(_ manager: CBCentralManager, generation: UInt64) {
        guard configuration.enabled, central === manager,
              phase == .scanning(generation), manager.state == .poweredOn
        else { return }
        if let rawIdentifier = configuration.targetIdentifier,
           let identifier = UUID(uuidString: rawIdentifier),
           let saved = manager.retrievePeripherals(withIdentifiers: [identifier]).first {
            connect(saved, manager: manager, generation: generation)
            return
        }
        if configuration.targetIdentifier == nil,
           let connected = manager.retrieveConnectedPeripherals(withServices: [serviceUUID])
            .first(where: { XiaomiVoiceRemoteNameMatcher.matches($0.name) }) {
            connect(connected, manager: manager, generation: generation)
            return
        }
        state = .scanning
        manager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func connect(_ candidate: CBPeripheral, manager: CBCentralManager, generation: UInt64) {
        guard central === manager, peripheral == nil, phase == .scanning(generation) else { return }
        manager.stopScan()
        peripheral = candidate
        deviceName = candidate.name
        let proxy = XiaomiPeripheralDelegateProxy(generation: generation, owner: self)
        peripheralProxy = proxy
        candidate.delegate = proxy
        phase = .connecting(generation)
        state = .connecting
        scheduleTimeout(generation: generation, expected: .connecting(generation))
        manager.connect(candidate, options: nil)
    }

    func requestCapabilitiesIfReady(generation: UInt64) {
        guard phase.acceptsInitialization(generation), !capabilitiesRequested,
              let peripheral, let transmitCharacteristic,
              let audioCharacteristic, let controlCharacteristic,
              subscribedUUIDs.contains(audioCharacteristic.uuid),
              subscribedUUIDs.contains(controlCharacteristic.uuid)
        else { return }
        capabilitiesRequested = true
        write(ATVVProtocol.getCapabilities, peripheral: peripheral, to: transmitCharacteristic)
        phase = .awaitingCapabilities(generation)
    }

    func fail(_ message: String) {
        lastError = message
        state = .failed
        scheduleReconnect()
    }

    func scheduleReconnect() {
        guard configuration.enabled else { return }
        let finishedGeneration = phase.generation ?? generation
        stopConnection(publishStopped: false)
        phase = .waitingReconnect(finishedGeneration)
        state = .reconnecting
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.configuration.enabled,
                  self.phase == .waitingReconnect(finishedGeneration) else { return }
            self.phase = .stopped
            self.start()
        }
        reconnectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    }

    func stopConnection(publishStopped: Bool) {
        reconnectWorkItem?.cancel()
        timeoutWorkItem?.cancel()
        closeMicrophoneIfNeeded()
        endStream(now: ProcessInfo.processInfo.systemUptime)
        central?.stopScan()
        if let central, let peripheral, peripheral.state != .disconnected {
            central.cancelPeripheralConnection(peripheral)
        }
        central?.delegate = nil
        peripheral?.delegate = nil
        central = nil
        centralGeneration = nil
        resetPeripheral()
        generation &+= 1
        phase = .stopped
        if publishStopped { state = .stopped }
    }

    func resetPeripheral() {
        peripheral = nil
        peripheralProxy = nil
        transmitCharacteristic = nil
        audioCharacteristic = nil
        controlCharacteristic = nil
        subscribedUUIDs.removeAll()
        capabilitiesRequested = false
        microphoneOpened = false
        deviceName = nil
        processor.reset()
        streamOutputReady = false
    }

    func scheduleTimeout(generation: UInt64, expected: BluetoothLifecyclePhase) {
        timeoutWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.phase == expected,
                  self.phase.generation == generation else { return }
            self.fail("Bluetooth initialization timed out")
        }
        timeoutWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    func write(_ data: Data, peripheral: CBPeripheral, to characteristic: CBCharacteristic) {
        let type: CBCharacteristicWriteType = characteristic.properties.contains(.writeWithoutResponse)
            ? .withoutResponse : .withResponse
        peripheral.writeValue(data, for: characteristic, type: type)
    }

    private func closeMicrophoneIfNeeded() {
        guard microphoneOpened || processor.isStreaming,
              let capabilities = processor.capabilities,
              let peripheral, let transmitCharacteristic else { return }
        write(
            ATVVProtocol.microphoneClose(
                version: capabilities.version, sessionID: processor.sessionID
            ),
            peripheral: peripheral, to: transmitCharacteristic
        )
        microphoneOpened = false
    }

    private func voiceError(_ message: String) -> NSError {
        NSError(
            domain: "app.codyboard.voice", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

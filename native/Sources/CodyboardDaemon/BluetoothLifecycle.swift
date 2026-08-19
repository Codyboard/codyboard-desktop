import Foundation

enum XiaomiVoiceRemoteNameMatcher {
    private static let approvedNames: Set<String> = [
        "mi rc", "xiaomi bluetooth remote 2", "xiaomi bluetooth remote 2 pro",
        "小米蓝牙语音遥控器",
    ]

    static func matches(_ rawName: String?) -> Bool {
        guard let rawName else { return false }
        return approvedNames.contains(
            rawName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        )
    }
}

enum BluetoothLifecyclePhase: Equatable {
    case stopped
    case scanning(UInt64)
    case connecting(UInt64)
    case discovering(UInt64)
    case awaitingCapabilities(UInt64)
    case ready(UInt64)
    case disconnecting(UInt64)
    case waitingReconnect(UInt64)

    var generation: UInt64? {
        switch self {
        case .scanning(let value), .connecting(let value), .discovering(let value),
             .awaitingCapabilities(let value), .ready(let value),
             .disconnecting(let value), .waitingReconnect(let value): value
        case .stopped: nil
        }
    }

    func acceptsDidConnect(_ generation: UInt64) -> Bool { self == .connecting(generation) }
    func acceptsInitialization(_ generation: UInt64) -> Bool { self == .discovering(generation) }
    func acceptsCapabilities(_ generation: UInt64) -> Bool {
        self == .awaitingCapabilities(generation)
    }
    func acceptsProtocolData(_ generation: UInt64) -> Bool { self == .ready(generation) }
    func acceptsNotification(_ generation: UInt64) -> Bool {
        switch self {
        case .discovering(generation), .awaitingCapabilities(generation), .ready(generation): true
        default: false
        }
    }
    func acceptsDisconnect(_ generation: UInt64) -> Bool {
        switch self {
        case .connecting(generation), .discovering(generation),
             .awaitingCapabilities(generation), .ready(generation),
             .disconnecting(generation): true
        default: false
        }
    }
}

struct ATVVDecodedAudio {
    let startedImplicitly: Bool
    let chunks: [[Int16]]
}

final class ATVVVoiceStreamProcessor {
    private let decoder = IMAADPCMDecoder()
    private var accumulator = VoiceFrameAccumulator()
    private var pendingSync: (predictor: Int, stepIndex: Int)?
    private var lastStopAt: TimeInterval?
    private(set) var capabilities: ATVVCapabilities?
    private(set) var isStreaming = false
    private(set) var sessionID: UInt8 = 0
    private(set) var decodedFrames = 0
    private(set) var decodedSamples = 0

    func configure(_ capabilities: ATVVCapabilities) -> Bool {
        guard ATVVProtocol.supportsAudio(sampleRate: capabilities.sampleRate) else { return false }
        self.capabilities = capabilities
        return true
    }

    @discardableResult
    func start(codec: UInt8?, sessionID: UInt8) -> Bool {
        guard let capabilities else { return false }
        if let codec, codec != capabilities.selectedCodec || codec != 0x02 { return false }
        resetStreamState()
        self.sessionID = sessionID
        isStreaming = true
        lastStopAt = nil
        return true
    }

    func synchronize(predictor: Int, stepIndex: Int) {
        pendingSync = (predictor, stepIndex)
        accumulator.reset()
    }

    func appendAudio(
        _ data: Data, gainDB: Double, now: TimeInterval
    ) -> ATVVDecodedAudio {
        guard let capabilities else { return ATVVDecodedAudio(startedImplicitly: false, chunks: []) }
        if let lastStopAt, now - lastStopAt < 0.3 {
            return ATVVDecodedAudio(startedImplicitly: false, chunks: [])
        }
        let implicit = !isStreaming
        if implicit {
            guard start(codec: nil, sessionID: 0) else {
                return ATVVDecodedAudio(startedImplicitly: false, chunks: [])
            }
        }
        let chunks = accumulator.append(data, frameSize: capabilities.frameSize).map { frame in
            if let pendingSync {
                decoder.reset(predictor: pendingSync.predictor, stepIndex: pendingSync.stepIndex)
                self.pendingSync = nil
            }
            decodedFrames += 1
            let samples = PCMPostprocessor.process(decoder.decode(frame), gainDB: gainDB)
            decodedSamples += samples.count
            return samples
        }
        return ATVVDecodedAudio(startedImplicitly: implicit, chunks: chunks)
    }

    func stop(now: TimeInterval) {
        isStreaming = false
        accumulator.reset()
        pendingSync = nil
        lastStopAt = now
    }

    func reset() {
        capabilities = nil
        sessionID = 0
        decodedFrames = 0
        decodedSamples = 0
        lastStopAt = nil
        resetStreamState()
    }

    private func resetStreamState() {
        accumulator.reset()
        pendingSync = nil
        decoder.reset()
        decodedFrames = 0
        decodedSamples = 0
        isStreaming = false
    }
}

import Foundation

enum ATVVProtocol {
    static let serviceUUID = "AB5E0001-5A21-4F05-BC7D-AF01F617B664"
    static let transmitUUID = "AB5E0002-5A21-4F05-BC7D-AF01F617B664"
    static let audioUUID = "AB5E0003-5A21-4F05-BC7D-AF01F617B664"
    static let controlUUID = "AB5E0004-5A21-4F05-BC7D-AF01F617B664"
    static let getCapabilities = Data([0x0A, 0x01, 0x00, 0x00, 0x03, 0x03])

    static func supportsAudio(sampleRate: Double) -> Bool { sampleRate == 16_000 }

    static func microphoneOpen(version: UInt16, codec: UInt8) -> Data {
        version >= 0x0100 ? Data([0x0C, 0x00]) : Data([0x0C, 0x00, codec])
    }

    static func microphoneClose(version: UInt16, sessionID: UInt8) -> Data {
        version >= 0x0100 ? Data([0x0D, sessionID]) : Data([0x0D])
    }
}

struct ATVVCapabilities: Equatable, Codable {
    let version: UInt16
    let codecs: UInt8
    let interaction: UInt8
    let frameSize: Int
    let selectedCodec: UInt8
    let sampleRate: Double

    static func parse(_ data: Data) -> ATVVCapabilities? {
        let bytes = Array(data)
        guard bytes.count >= 7, bytes[0] == 0x0B else { return nil }
        let version = UInt16(bytes[1]) << 8 | UInt16(bytes[2])
        var codecs = version >= 0x0100 ? bytes[3] : bytes[4]
        var interaction: UInt8 = version >= 0x0100 ? bytes[4] : 0
        if version >= 0x0100, codecs == 0, bytes.count >= 9, bytes[4] & 0x03 != 0 {
            codecs = bytes[4]
            interaction = 0x03
        }
        if version < 0x0100, bytes.count < 9 { return nil }
        let frameSize = Int(bytes[5]) << 8 | Int(bytes[6])
        let codec: UInt8 = codecs & 0x02 != 0 ? 0x02 : 0x01
        return ATVVCapabilities(
            version: version, codecs: codecs, interaction: interaction,
            frameSize: frameSize == 0 ? 120 : frameSize,
            selectedCodec: codec, sampleRate: codec == 0x02 ? 16_000 : 8_000
        )
    }
}

enum ATVVControlMessage: Equatable {
    case capabilities(ATVVCapabilities)
    case microphoneOpenRequested
    case streamStarted(codec: UInt8?, sessionID: UInt8)
    case streamStopped
    case synchronization(predictor: Int, stepIndex: Int)
    case unknown

    static func parse(_ data: Data) -> ATVVControlMessage? {
        let bytes = Array(data)
        guard let opcode = bytes.first else { return nil }
        switch opcode {
        case 0x0B:
            return ATVVCapabilities.parse(data).map(Self.capabilities)
        case 0x08:
            return .microphoneOpenRequested
        case 0x04:
            return .streamStarted(
                codec: bytes.count >= 3 ? bytes[2] : nil,
                sessionID: bytes.count >= 4 ? bytes[3] : 0
            )
        case 0x00:
            return .streamStopped
        case 0x0A:
            guard bytes.count >= 7 else { return nil }
            let bits = UInt16(bytes[4]) << 8 | UInt16(bytes[5])
            return .synchronization(
                predictor: Int(Int16(bitPattern: bits)), stepIndex: Int(bytes[6])
            )
        default:
            return .unknown
        }
    }
}

final class IMAADPCMDecoder {
    private static let stepTable = [
        7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
        34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
        143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449,
        494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
        1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
        4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
        11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
        27086, 29794, 32767,
    ]
    private static let indexTable = [-1, -1, -1, -1, 2, 4, 6, 8]
    private(set) var predictor = 0
    private(set) var stepIndex = 0

    func reset(predictor: Int = 0, stepIndex: Int = 0) {
        self.predictor = min(32_767, max(-32_768, predictor))
        self.stepIndex = min(88, max(0, stepIndex))
    }

    func decode(_ data: Data) -> [Int16] {
        data.flatMap { [decodeNibble(Int($0 >> 4)), decodeNibble(Int($0 & 0x0F))] }
    }

    private func decodeNibble(_ nibble: Int) -> Int16 {
        let step = Self.stepTable[stepIndex]
        var difference = step >> 3
        if nibble & 1 != 0 { difference += step >> 2 }
        if nibble & 2 != 0 { difference += step >> 1 }
        if nibble & 4 != 0 { difference += step }
        predictor += nibble & 8 != 0 ? -difference : difference
        predictor = min(32_767, max(-32_768, predictor))
        stepIndex = min(88, max(0, stepIndex + Self.indexTable[nibble & 7]))
        return Int16(predictor)
    }
}

enum PCMPostprocessor {
    static func process(_ input: [Int16], gainDB: Double) -> [Int16] {
        guard !input.isEmpty else { return [] }
        var filtered = input.map(Int.init)
        if input.count >= 3 {
            for index in 1..<(input.count - 1) {
                filtered[index] = (
                    Int(input[index - 1]) + 2 * Int(input[index]) + Int(input[index + 1])
                ) >> 2
            }
        }
        let safeDB = min(24, max(-24, gainDB.isFinite ? gainDB : 0))
        let gain = pow(10, safeDB / 20)
        return filtered.map {
            Int16(min(32_767, max(-32_768, Int((Double($0) * gain).rounded()))))
        }
    }
}

struct VoiceFrameAccumulator {
    private(set) var pending = Data()

    mutating func append(_ data: Data, frameSize: Int) -> [Data] {
        guard frameSize > 0 else { return [] }
        pending.append(data)
        var frames: [Data] = []
        while pending.count >= frameSize {
            frames.append(pending.prefix(frameSize))
            pending.removeFirst(frameSize)
        }
        return frames
    }

    mutating func reset() { pending.removeAll(keepingCapacity: true) }
}

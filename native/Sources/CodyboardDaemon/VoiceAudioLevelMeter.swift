import Foundation

struct VoiceAudioLevelMeter {
    private static let emissionInterval: TimeInterval = 1.0 / 30.0

    private var lastEmission: TimeInterval?
    private var peak = 0.0
    private var sampleCount = 0
    private var sequence: UInt64 = 0
    private var sumSquares = 0.0

    mutating func append(samples: [Int16], now: TimeInterval) -> VoiceAudioLevel? {
        for sample in samples {
            let normalized = Double(sample) / 32768.0
            peak = max(peak, abs(normalized))
            sumSquares += normalized * normalized
        }
        sampleCount += samples.count

        guard sampleCount > 0,
              lastEmission == nil || now - lastEmission! >= Self.emissionInterval
        else { return nil }

        sequence &+= 1
        let level = VoiceAudioLevel(
            rms: sqrt(sumSquares / Double(sampleCount)),
            peak: peak,
            sequence: sequence
        )
        lastEmission = now
        peak = 0
        sampleCount = 0
        sumSquares = 0
        return level
    }

    mutating func reset() {
        lastEmission = nil
        peak = 0
        sampleCount = 0
        sumSquares = 0
    }
}

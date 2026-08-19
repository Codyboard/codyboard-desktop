import Foundation

enum VirtualAudioHealthPolicy {
    static func isHealthy(
        hasSelectedDevice: Bool,
        engineRunning: Bool,
        playerPlaying: Bool,
        boundToSelectedDevice: Bool
    ) -> Bool {
        hasSelectedDevice && engineRunning && playerPlaying && boundToSelectedDevice
    }
}

struct AudioDrainState {
    private(set) var pendingBuffers = 0
    private(set) var generation: UInt64 = 0
    private var waitingGeneration: UInt64?

    mutating func scheduledBuffer() { pendingBuffers += 1 }

    mutating func begin() -> (generation: UInt64, immediate: Bool) {
        generation &+= 1
        if pendingBuffers == 0 { return (generation, true) }
        waitingGeneration = generation
        return (generation, false)
    }

    mutating func completedBuffer() -> Bool {
        pendingBuffers = max(0, pendingBuffers - 1)
        guard pendingBuffers == 0, waitingGeneration != nil else { return false }
        waitingGeneration = nil
        generation &+= 1
        return true
    }

    mutating func timedOut(generation expected: UInt64) -> Bool {
        guard waitingGeneration == expected else { return false }
        pendingBuffers = 0
        waitingGeneration = nil
        generation &+= 1
        return true
    }

    mutating func cancelDrain() {
        waitingGeneration = nil
        generation &+= 1
    }

    mutating func reset() {
        pendingBuffers = 0
        waitingGeneration = nil
        generation &+= 1
    }
}

enum TestToneGenerator {
    static let sampleRate = 16_000.0
    static let duration = 1.0
    static let frequency = 440.0
    static let amplitude = 0.15

    static func samples() -> [Int16] {
        let count = Int(sampleRate * duration)
        let peak = Double(Int16.max) * amplitude
        return (0..<count).map { index in
            let phase = 2 * Double.pi * frequency * Double(index) / sampleRate
            return Int16((peak * sin(phase)).rounded())
        }
    }
}

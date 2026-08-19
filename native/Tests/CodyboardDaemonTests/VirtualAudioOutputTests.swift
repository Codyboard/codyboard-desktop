import XCTest
@testable import CodyboardDaemon

final class VirtualAudioOutputTests: XCTestCase {
    func testHealthRequiresLivePlayerAndSelectedBinding() {
        XCTAssertTrue(VirtualAudioHealthPolicy.isHealthy(
            hasSelectedDevice: true,
            engineRunning: true,
            playerPlaying: true,
            boundToSelectedDevice: true
        ))
        XCTAssertFalse(VirtualAudioHealthPolicy.isHealthy(
            hasSelectedDevice: true,
            engineRunning: true,
            playerPlaying: false,
            boundToSelectedDevice: true
        ))
        XCTAssertFalse(VirtualAudioHealthPolicy.isHealthy(
            hasSelectedDevice: true,
            engineRunning: true,
            playerPlaying: true,
            boundToSelectedDevice: false
        ))
    }

    func testDrainWaitsForEveryScheduledBuffer() {
        var state = AudioDrainState()
        state.scheduledBuffer()
        state.scheduledBuffer()
        let drain = state.begin()

        XCTAssertFalse(drain.immediate)
        XCTAssertFalse(state.completedBuffer())
        XCTAssertTrue(state.completedBuffer())
        XCTAssertEqual(state.pendingBuffers, 0)
        XCTAssertFalse(state.timedOut(generation: drain.generation))
    }

    func testCancelledDrainRejectsStaleTimeout() {
        var state = AudioDrainState()
        state.scheduledBuffer()
        let drain = state.begin()
        state.cancelDrain()

        XCTAssertFalse(state.timedOut(generation: drain.generation))
        XCTAssertEqual(state.pendingBuffers, 1)
    }

    func testToneIsOneSecondAndLowAmplitude() {
        let samples = TestToneGenerator.samples()
        XCTAssertEqual(samples.count, 16_000)
        let limit = Int(Double(Int16.max) * TestToneGenerator.amplitude) + 1
        XCTAssertTrue(samples.allSatisfy { abs(Int($0)) <= limit })
    }

    func testOutputFailsClosedWithoutConfiguredDevice() {
        let output = VirtualAudioOutput()
        XCTAssertFalse(output.enqueue(samples: [1, 2, 3]))
        XCTAssertFalse(output.startSession())
        XCTAssertEqual(output.status.state, .failed)
        XCTAssertFalse(output.status.healthy)
        output.shutdown()
    }
}

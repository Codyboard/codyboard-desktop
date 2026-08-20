import XCTest
@testable import CodyboardDaemon

final class VoiceAudioLevelMeterTests: XCTestCase {
    func testMeasuresNormalizedPeakAndRMS() throws {
        var meter = VoiceAudioLevelMeter()

        let level = try XCTUnwrap(meter.append(samples: [0, 16_384, -16_384], now: 1))

        XCTAssertEqual(level.peak, 0.5, accuracy: 0.0001)
        XCTAssertEqual(level.rms, sqrt(0.5 / 3.0), accuracy: 0.0001)
        XCTAssertEqual(level.sequence, 1)
    }

    func testThrottlesAndAccumulatesSamples() throws {
        var meter = VoiceAudioLevelMeter()
        _ = meter.append(samples: [0], now: 1)

        XCTAssertNil(meter.append(samples: [16_384], now: 1.01))
        let level = try XCTUnwrap(meter.append(samples: [0], now: 1.04))

        XCTAssertEqual(level.peak, 0.5, accuracy: 0.0001)
        XCTAssertEqual(level.rms, sqrt(0.25 / 2.0), accuracy: 0.0001)
        XCTAssertEqual(level.sequence, 2)
    }

    func testResetStartsANewWindow() throws {
        var meter = VoiceAudioLevelMeter()
        _ = meter.append(samples: [16_384], now: 1)
        meter.reset()

        let level = try XCTUnwrap(meter.append(samples: [0], now: 1.01))

        XCTAssertEqual(level.peak, 0, accuracy: 0.0001)
        XCTAssertEqual(level.rms, 0, accuracy: 0.0001)
    }
}

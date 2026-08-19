import Foundation
import XCTest
@testable import CodyboardDaemon

final class ATVVProtocolTests: XCTestCase {
    func testParsesVersionOneAndLegacyCapabilities() {
        let current = ATVVCapabilities.parse(
            Data([0x0B, 0x01, 0x00, 0x02, 0x03, 0x00, 0x78])
        )
        XCTAssertEqual(current?.selectedCodec, 0x02)
        XCTAssertEqual(current?.sampleRate, 16_000)
        XCTAssertEqual(current?.frameSize, 120)

        let legacyLayout = ATVVCapabilities.parse(
            Data([0x0B, 0x01, 0x00, 0x00, 0x02, 0x00, 0x78, 0x00, 0x00])
        )
        XCTAssertEqual(legacyLayout?.selectedCodec, 0x02)
        XCTAssertEqual(legacyLayout?.interaction, 0x03)
    }

    func testRejectsMalformedAndEightKilohertzCapabilities() {
        XCTAssertNil(ATVVCapabilities.parse(Data()))
        XCTAssertNil(ATVVCapabilities.parse(Data([0x0B, 0x01])))
        XCTAssertNil(ATVVControlMessage.parse(Data([0x0A, 0x00])))
        XCTAssertFalse(ATVVProtocol.supportsAudio(sampleRate: 8_000))

        let unsupported = ATVVCapabilities.parse(
            Data([0x0B, 0x01, 0x00, 0x01, 0x03, 0x00, 0x78])
        )
        XCTAssertEqual(unsupported?.sampleRate, 8_000)
    }

    func testBuildsVersionSpecificMicrophoneCommands() {
        XCTAssertEqual(
            ATVVProtocol.microphoneOpen(version: 0x0100, codec: 0x02),
            Data([0x0C, 0x00])
        )
        XCTAssertEqual(
            ATVVProtocol.microphoneOpen(version: 1, codec: 0x02),
            Data([0x0C, 0x00, 0x02])
        )
        XCTAssertEqual(
            ATVVProtocol.microphoneClose(version: 0x0100, sessionID: 7),
            Data([0x0D, 0x07])
        )
    }

    func testParsesStreamAndSynchronizationMessages() {
        XCTAssertEqual(
            ATVVControlMessage.parse(Data([0x04, 0x03, 0x02, 0x07])),
            .streamStarted(codec: 0x02, sessionID: 7)
        )
        XCTAssertEqual(
            ATVVControlMessage.parse(Data([0x0A, 0, 0, 0, 0xFF, 0xFE, 12])),
            .synchronization(predictor: -2, stepIndex: 12)
        )
    }

    func testDecoderUsesHighNibbleBeforeLowNibbleAndClampsState() {
        let decoder = IMAADPCMDecoder()
        XCTAssertEqual(decoder.decode(Data([0x11])), [1, 2])
        decoder.reset()
        XCTAssertEqual(decoder.decode(Data([0x7F])), [11, -19])
        decoder.reset(predictor: 100_000, stepIndex: 1_000)
        XCTAssertEqual(decoder.predictor, 32_767)
        XCTAssertEqual(decoder.stepIndex, 88)
    }

    func testPostprocessorSmoothsAndClampsGain() {
        XCTAssertEqual(PCMPostprocessor.process([0, 1000, 0], gainDB: 0), [0, 500, 0])
        XCTAssertEqual(PCMPostprocessor.process([20_000], gainDB: 24), [Int16.max])
        XCTAssertEqual(PCMPostprocessor.process([20_000], gainDB: .infinity), [20_000])
    }

    func testFrameAccumulatorPreservesPartialNotifications() {
        var accumulator = VoiceFrameAccumulator()
        XCTAssertTrue(accumulator.append(Data([1, 2]), frameSize: 3).isEmpty)
        XCTAssertEqual(accumulator.pending, Data([1, 2]))
        XCTAssertEqual(
            accumulator.append(Data([3, 4, 5, 6, 7]), frameSize: 3),
            [Data([1, 2, 3]), Data([4, 5, 6])]
        )
        XCTAssertEqual(accumulator.pending, Data([7]))
    }

    func testStreamProcessorSupportsAudioBeforeStartAndRejectsLateAudio() throws {
        let processor = ATVVVoiceStreamProcessor()
        let capabilities = try XCTUnwrap(ATVVCapabilities.parse(
            Data([0x0B, 0x01, 0x00, 0x02, 0x03, 0x00, 0x02])
        ))
        XCTAssertTrue(processor.configure(capabilities))

        let decoded = processor.appendAudio(Data([0x11, 0x11]), gainDB: 0, now: 1)
        XCTAssertTrue(decoded.startedImplicitly)
        XCTAssertEqual(decoded.chunks.count, 1)
        XCTAssertEqual(decoded.chunks[0].count, 4)

        processor.stop(now: 2)
        XCTAssertTrue(
            processor.appendAudio(Data([0x11, 0x11]), gainDB: 0, now: 2.1).chunks.isEmpty
        )
        XCTAssertTrue(
            processor.appendAudio(Data([0x11, 0x11]), gainDB: 0, now: 2.4)
                .startedImplicitly
        )
    }

    func testLifecycleRejectsStaleGeneration() {
        XCTAssertTrue(BluetoothLifecyclePhase.connecting(1).acceptsDidConnect(1))
        XCTAssertFalse(BluetoothLifecyclePhase.connecting(1).acceptsDidConnect(2))
        XCTAssertTrue(BluetoothLifecyclePhase.ready(2).acceptsProtocolData(2))
        XCTAssertFalse(BluetoothLifecyclePhase.ready(2).acceptsProtocolData(1))
    }

    func testRemoteNameMatcherIsStrict() {
        XCTAssertTrue(XiaomiVoiceRemoteNameMatcher.matches("  MI RC "))
        XCTAssertTrue(XiaomiVoiceRemoteNameMatcher.matches("小米蓝牙语音遥控器"))
        XCTAssertFalse(XiaomiVoiceRemoteNameMatcher.matches("MI RC2"))
        XCTAssertFalse(XiaomiVoiceRemoteNameMatcher.matches(nil))
    }

    func testVoiceConfigurationRejectsInvalidValuesWithoutStartingBluetooth() {
        let controller = XiaomiVoiceBluetoothController()
        XCTAssertThrowsError(try controller.configure(VoiceConfiguration(
            enabled: true, targetIdentifier: nil, gainDB: .infinity
        )))
        XCTAssertThrowsError(try controller.configure(VoiceConfiguration(
            enabled: true, targetIdentifier: "not-a-uuid", gainDB: 0
        )))
        XCTAssertEqual(controller.status.state, .stopped)
    }

    func testVoiceMetricsContainCountsButNoPCM() throws {
        let metrics = VoiceMetrics(
            generation: 3, sessionID: 7, decodedFrames: 4, decodedSamples: 960
        )
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(metrics))
                as? [String: Any]
        )
        XCTAssertEqual(object["decodedSamples"] as? Int, 960)
        XCTAssertNil(object["pcm"])
        XCTAssertNil(object["samples"])
    }
}

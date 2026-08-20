import XCTest
@testable import CodyboardDaemon

final class VoiceSessionControllerTests: XCTestCase {
    private let fn = CompiledOutput(
        kind: "modifier", code: 63, modifiers: [], modifier: "fn"
    )
    private let shortcut = CompiledOutput(
        kind: "keyboard", code: 2, modifiers: ["control", "shift"]
    )

    func testGlobalMappingPairsDownWithUpAfterAudioDrain() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn)
        )

        XCTAssertTrue(controller.startSession())
        XCTAssertTrue(controller.enqueue(samples: [1, 2, 3]))
        controller.finishSession()

        XCTAssertEqual(keyboard.events, [.init(output: fn, pressed: true)])
        XCTAssertEqual(controller.status.state, .draining)
        audio.completeDrain(at: 0)
        XCTAssertEqual(keyboard.events, [
            .init(output: fn, pressed: true), .init(output: fn, pressed: false),
        ])
        XCTAssertEqual(controller.status.state, .idle)
    }

    func testApplicationAtStartPinsResolvedMappingUntilKeyUp() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        var bundleIdentifier: String? = "com.example.chat"
        var resolvedBundleIdentifier: String?
        let controller = makeController(
            audio: audio,
            keyboard: keyboard,
            frontmostBundleIdentifier: { bundleIdentifier },
            resolveTrigger: {
                resolvedBundleIdentifier = $0
                return .output(self.shortcut)
            }
        )

        XCTAssertTrue(controller.startSession())
        bundleIdentifier = "com.example.other"
        controller.finishSession()
        audio.completeDrain(at: 0)

        XCTAssertEqual(resolvedBundleIdentifier, "com.example.chat")
        XCTAssertEqual(keyboard.events, [
            .init(output: shortcut, pressed: true),
            .init(output: shortcut, pressed: false),
        ])
    }

    func testOutputThatCannotPairDownAndUpFailsClosed() {
        let invalid = CompiledOutput(kind: "openURL", code: nil, modifiers: [])
        let audio = FakeVoiceAudio()
        let controller = makeController(
            audio: audio, keyboard: FakeVoiceKeyboard(), resolution: .output(invalid)
        )

        XCTAssertFalse(controller.startSession())
        XCTAssertEqual(audio.startCount, 0)
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testPassthroughMappingRunsAudioWithoutKeyboardPermission() {
        let passthrough = CompiledOutput(kind: "passthrough", code: nil, modifiers: [])
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(passthrough),
            canPostKeyboardEvents: { false }
        )

        XCTAssertTrue(controller.startSession())
        XCTAssertTrue(keyboard.events.isEmpty)
    }

    func testKeyDownFailureStopsAudioAndAttemptsMatchingKeyUp() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        keyboard.failNextKeyDown = true
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn)
        )

        XCTAssertFalse(controller.startSession())
        XCTAssertEqual(audio.stopCount, 1)
        XCTAssertEqual(keyboard.events, [.init(output: fn, pressed: false)])
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testAmbiguousProfilesFailClosed() {
        let audio = FakeVoiceAudio()
        let controller = makeController(
            audio: audio, keyboard: FakeVoiceKeyboard(), resolution: .ambiguous
        )

        XCTAssertFalse(controller.startSession())
        XCTAssertEqual(audio.startCount, 0)
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testAudioFailureReleasesMappingImmediately() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn)
        )
        XCTAssertTrue(controller.startSession())
        audio.enqueueSucceeds = false

        XCTAssertFalse(controller.enqueue(samples: [1]))
        XCTAssertEqual(audio.stopCount, 1)
        XCTAssertEqual(keyboard.events.last, .init(output: fn, pressed: false))
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testRouteFailureDuringDrainReleasesMappingAndRestoresInput() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let inputDevice = FakeVoiceInputDevice()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn),
            inputDevice: inputDevice
        )
        XCTAssertTrue(controller.startSession())
        controller.finishSession()

        controller.audioRuntimeFailed("CoreAudio route changed")

        XCTAssertEqual(keyboard.events.last, .init(output: fn, pressed: false))
        XCTAssertEqual(inputDevice.restored.count, 1)
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testStaleDrainCannotReleaseNewSession() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn)
        )

        XCTAssertTrue(controller.startSession())
        controller.finishSession()
        XCTAssertTrue(controller.startSession())
        audio.completeDrain(at: 0)

        XCTAssertEqual(keyboard.events, [
            .init(output: fn, pressed: true),
            .init(output: fn, pressed: false),
            .init(output: fn, pressed: true),
        ])
        XCTAssertEqual(controller.status.state, .active)
    }

    func testNoMappingNeedsNoAccessibilityPermission() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .none,
            canPostKeyboardEvents: { false }
        )

        XCTAssertTrue(controller.startSession())
        XCTAssertTrue(keyboard.events.isEmpty)
        controller.stopSession()
        XCTAssertEqual(controller.status.state, .idle)
    }

    func testSystemMicrophoneSourceHoldsShortcutWithoutRoutingBLEAudio() {
        let output = CompiledOutput(
            kind: "keyboard", code: 2, modifiers: ["control", "shift"],
            voiceAudioSource: "system"
        )
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let inputDevice = FakeVoiceInputDevice()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(output),
            inputDevice: inputDevice
        )

        XCTAssertTrue(controller.startSession())
        XCTAssertTrue(controller.enqueue(samples: [1, 2, 3]))
        controller.finishSession()

        XCTAssertEqual(audio.startCount, 0)
        XCTAssertTrue(inputDevice.started.isEmpty)
        XCTAssertEqual(keyboard.events, [
            .init(output: output, pressed: true),
            .init(output: output, pressed: false),
        ])
        XCTAssertEqual(controller.status.state, .idle)
    }

    func testRemoteSourceRestoresPreviousDefaultInputAfterDrain() {
        let audio = FakeVoiceAudio()
        let inputDevice = FakeVoiceInputDevice()
        let controller = makeController(
            audio: audio, keyboard: FakeVoiceKeyboard(), resolution: .output(fn),
            inputDevice: inputDevice, targetInputDeviceUID: { "virtual-mic" }
        )

        XCTAssertTrue(controller.startSession())
        XCTAssertEqual(inputDevice.started, ["virtual-mic"])
        XCTAssertTrue(inputDevice.restored.isEmpty)

        controller.finishSession()
        XCTAssertTrue(inputDevice.restored.isEmpty)
        audio.completeDrain(at: 0)

        XCTAssertEqual(inputDevice.restored, [
            .init(previousDeviceUID: "built-in-mic", targetDeviceUID: "virtual-mic"),
        ])
    }

    func testRemoteInputAndAudioAreReadyBeforeShortcutKeyDown() {
        var events: [String] = []
        let audio = FakeVoiceAudio()
        audio.onStart = { events.append("audio") }
        let keyboard = FakeVoiceKeyboard()
        keyboard.onPost = { if $1 { events.append("keyDown") } }
        let inputDevice = FakeVoiceInputDevice()
        inputDevice.onBegin = { events.append("input") }
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(fn),
            inputDevice: inputDevice
        )

        XCTAssertTrue(controller.startSession())

        XCTAssertEqual(events, ["input", "audio", "keyDown"])
    }

    func testMissingAccessibilityFailsBeforeAudioStarts() {
        let audio = FakeVoiceAudio()
        let controller = makeController(
            audio: audio, keyboard: FakeVoiceKeyboard(), resolution: .output(fn),
            canPostKeyboardEvents: { false }
        )

        XCTAssertFalse(controller.startSession())
        XCTAssertEqual(audio.startCount, 0)
        XCTAssertEqual(controller.status.state, .failed)
    }

    func testShutdownReleasesHeldMapping() {
        let audio = FakeVoiceAudio()
        let keyboard = FakeVoiceKeyboard()
        let controller = makeController(
            audio: audio, keyboard: keyboard, resolution: .output(shortcut)
        )
        XCTAssertTrue(controller.startSession())

        controller.shutdown()

        XCTAssertEqual(keyboard.events.last, .init(output: shortcut, pressed: false))
        XCTAssertEqual(audio.stopCount, 1)
        XCTAssertEqual(controller.status.state, .idle)
    }

    private func makeController(
        audio: FakeVoiceAudio,
        keyboard: FakeVoiceKeyboard,
        resolution: MappingResolution = .none,
        frontmostBundleIdentifier: @escaping () -> String? = { nil },
        resolveTrigger: ((String?) -> MappingResolution)? = nil,
        canPostKeyboardEvents: @escaping () -> Bool = { true },
        inputDevice: FakeVoiceInputDevice = FakeVoiceInputDevice(),
        targetInputDeviceUID: @escaping () -> String? = { "virtual-mic" }
    ) -> VoiceSessionController {
        VoiceSessionController(
            audio: audio,
            keyboard: keyboard,
            frontmostBundleIdentifier: frontmostBundleIdentifier,
            resolveTrigger: resolveTrigger ?? { _ in resolution },
            canPostKeyboardEvents: canPostKeyboardEvents,
            inputDevice: inputDevice,
            targetInputDeviceUID: targetInputDeviceUID,
            publishesEvents: false
        )
    }
}

private final class FakeVoiceInputDevice: VoiceInputDeviceRouting {
    private(set) var restored: [DefaultAudioInputLease] = []
    private(set) var started: [String] = []
    var onBegin: (() -> Void)?

    func beginOverride(targetDeviceUID: String) throws -> DefaultAudioInputLease {
        onBegin?()
        started.append(targetDeviceUID)
        return .init(
            previousDeviceUID: "built-in-mic", targetDeviceUID: targetDeviceUID
        )
    }

    func restore(_ lease: DefaultAudioInputLease) { restored.append(lease) }
}

private final class FakeVoiceAudio: VoiceAudioRouting {
    var enqueueSucceeds = true
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private var drainCompletions: [(() -> Void)?] = []
    var onStart: (() -> Void)?

    func startVoiceSession() -> Bool {
        onStart?()
        startCount += 1
        return true
    }

    func enqueue(samples: [Int16]) -> Bool { enqueueSucceeds }

    func drainAndStop(maximumDelay: TimeInterval, completion: (() -> Void)?) {
        drainCompletions.append(completion)
    }

    func stop() { stopCount += 1 }

    func completeDrain(at index: Int) { drainCompletions[index]?() }
}

private struct FakeKeyboardEvent: Equatable {
    let output: CompiledOutput
    let pressed: Bool
}

private final class FakeVoiceKeyboard: VoiceKeyboardRouting {
    private(set) var events: [FakeKeyboardEvent] = []
    var failNextKeyDown = false
    var onPost: ((CompiledOutput, Bool) -> Void)?

    func post(_ output: CompiledOutput, pressed: Bool, autorepeat: Bool) throws {
        if pressed, failNextKeyDown {
            failNextKeyDown = false
            throw FakeVoiceKeyboardError.keyDown
        }
        onPost?(output, pressed)
        events.append(.init(output: output, pressed: pressed))
    }
}

private enum FakeVoiceKeyboardError: Error {
    case keyDown
}

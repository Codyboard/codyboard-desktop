import Foundation

let voiceSessionTrigger = CompiledTrigger(kind: "voice", code: 0, modifiers: [])

enum VoiceSessionState: String, Codable {
    case idle
    case active
    case draining
    case failed
}

struct VoiceSessionStatus: Codable, Equatable {
    let state: VoiceSessionState
    let activeBundleIdentifier: String?
    let activeOutput: CompiledOutput?
    let error: String?
    let previousInputDeviceUID: String?
    let activeInputDeviceUID: String?
}

protocol VoiceAudioRouting: AnyObject {
    func startVoiceSession() -> Bool
    func enqueue(samples: [Int16]) -> Bool
    func drainAndStop(maximumDelay: TimeInterval, completion: (() -> Void)?)
    func stop()
}

protocol VoiceKeyboardRouting: AnyObject {
    func post(_ output: CompiledOutput, pressed: Bool, autorepeat: Bool) throws
}

extension VirtualAudioOutput: VoiceAudioRouting {}
extension KeyboardSimulator: VoiceKeyboardRouting {}

private struct ActiveVoiceSession {
    let generation: UInt64
    let bundleIdentifier: String?
    let output: CompiledOutput?
    let routesAudio: Bool
    let inputLease: DefaultAudioInputLease?
}

final class VoiceSessionController {
    private let audio: VoiceAudioRouting
    private let keyboard: VoiceKeyboardRouting
    private let frontmostBundleIdentifier: () -> String?
    private let resolveTrigger: (String?) -> MappingResolution
    private let canPostKeyboardEvents: () -> Bool
    private let inputDevice: VoiceInputDeviceRouting
    private let targetInputDeviceUID: () -> String?
    private let publishesEvents: Bool
    private var activeSession: ActiveVoiceSession?
    private var generation: UInt64 = 0
    private var state: VoiceSessionState = .idle
    private var lastError: String?

    init(
        audio: VoiceAudioRouting,
        keyboard: VoiceKeyboardRouting,
        frontmostBundleIdentifier: @escaping () -> String?,
        resolveTrigger: @escaping (String?) -> MappingResolution,
        canPostKeyboardEvents: @escaping () -> Bool,
        inputDevice: VoiceInputDeviceRouting,
        targetInputDeviceUID: @escaping () -> String?,
        publishesEvents: Bool = true
    ) {
        self.audio = audio
        self.keyboard = keyboard
        self.frontmostBundleIdentifier = frontmostBundleIdentifier
        self.resolveTrigger = resolveTrigger
        self.canPostKeyboardEvents = canPostKeyboardEvents
        self.inputDevice = inputDevice
        self.targetInputDeviceUID = targetInputDeviceUID
        self.publishesEvents = publishesEvents
    }

    var isBusy: Bool { activeSession != nil }

    var status: VoiceSessionStatus {
        VoiceSessionStatus(
            state: state,
            activeBundleIdentifier: activeSession?.bundleIdentifier,
            activeOutput: activeSession?.output,
            error: lastError,
            previousInputDeviceUID: activeSession?.inputLease?.previousDeviceUID,
            activeInputDeviceUID: activeSession?.inputLease?.targetDeviceUID
        )
    }

    @discardableResult
    func startSession() -> Bool {
        if activeSession != nil { stopSession() }
        let bundleIdentifier = frontmostBundleIdentifier()
        let output: CompiledOutput?
        var routesAudio = true
        switch resolveTrigger(bundleIdentifier) {
        case .none:
            output = nil
        case .output(let resolved):
            routesAudio = resolved.voiceAudioSource != "system"
            if resolved.kind == "passthrough" || resolved.kind == "suppress" {
                output = nil
            } else if Self.canHold(resolved) {
                output = resolved
            } else {
                fail("Voice mapping must be a keyboard key or modifier")
                return false
            }
        case .ambiguous:
            fail("Voice mapping is ambiguous across active device profiles")
            return false
        }
        if output != nil, !canPostKeyboardEvents() {
            fail("Accessibility permission is required for the voice mapping")
            return false
        }
        var inputLease: DefaultAudioInputLease?
        if routesAudio {
            guard let targetUID = targetInputDeviceUID() else {
                fail("Remote microphone input device is not configured")
                return false
            }
            do {
                inputLease = try inputDevice.beginOverride(targetDeviceUID: targetUID)
            } catch {
                fail("Unable to select remote microphone: \(error.localizedDescription)")
                return false
            }
        }
        if routesAudio, !audio.startVoiceSession() {
            if let inputLease { inputDevice.restore(inputLease) }
            fail("Unable to start voice audio output")
            return false
        }

        generation &+= 1
        let session = ActiveVoiceSession(
            generation: generation, bundleIdentifier: bundleIdentifier,
            output: output, routesAudio: routesAudio, inputLease: inputLease
        )
        activeSession = session
        do {
            if let output { try keyboard.post(output, pressed: true, autorepeat: false) }
        } catch {
            if routesAudio { audio.stop() }
            releaseActiveSession(
                finalState: .failed,
                error: "Unable to press voice mapping: \(error.localizedDescription)"
            )
            return false
        }
        update(state: .active, error: nil)
        return true
    }

    @discardableResult
    func enqueue(samples: [Int16]) -> Bool {
        guard let session = activeSession else { return false }
        if !session.routesAudio { return true }
        guard audio.enqueue(samples: samples) else {
            abortSession(message: "Voice audio output failed")
            return false
        }
        return true
    }

    func finishSession() {
        guard let session = activeSession else { return }
        if !session.routesAudio {
            releaseActiveSession(finalState: .idle, error: nil)
            return
        }
        update(state: .draining, error: nil)
        audio.drainAndStop(maximumDelay: 0.75) { [weak self] in
            guard let self, self.activeSession?.generation == session.generation else { return }
            self.releaseActiveSession(finalState: .idle, error: nil)
        }
    }

    func stopSession() {
        generation &+= 1
        if activeSession?.routesAudio == true { audio.stop() }
        releaseActiveSession(finalState: .idle, error: nil)
    }

    func shutdown() { stopSession() }

    private static func canHold(_ output: CompiledOutput) -> Bool {
        let modifiers = Set(["command", "control", "option", "shift", "fn"])
        guard Set(output.modifiers).count == output.modifiers.count,
              output.modifiers.allSatisfy(modifiers.contains) else { return false }
        switch output.kind {
        case "keyboard":
            return output.code.map { (0...127).contains($0) } == true
        case "modifier":
            return output.modifier.map {
                modifiers.contains($0) && !output.modifiers.contains($0)
            } == true
        default:
            return false
        }
    }

    private func abortSession(message: String) {
        generation &+= 1
        if activeSession?.routesAudio == true { audio.stop() }
        releaseActiveSession(finalState: .failed, error: message)
    }

    private func releaseActiveSession(finalState: VoiceSessionState, error: String?) {
        let session = activeSession
        activeSession = nil
        defer {
            if let lease = session?.inputLease { inputDevice.restore(lease) }
        }
        do {
            if let output = session?.output {
                try keyboard.post(output, pressed: false, autorepeat: false)
            }
            update(state: finalState, error: error)
        } catch {
            update(
                state: .failed,
                error: "Unable to release voice mapping: \(error.localizedDescription)"
            )
        }
    }

    private func fail(_ message: String) {
        activeSession = nil
        update(state: .failed, error: message)
    }

    private func update(state: VoiceSessionState, error: String?) {
        self.state = state
        lastError = error
        publishStatus()
    }

    private func publishStatus() {
        guard publishesEvents else { return }
        NativeOutput.shared.send(NativeEvent(event: "voiceSessionStateChanged", data: status))
    }
}

import Foundation
import Darwin

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let voice = XiaomiVoiceBluetoothController()
let audio = VirtualAudioOutput()
let defaultAudioInput = DefaultAudioInputController()
defaultAudioInput.recoverInterruptedOverride()
let voiceSession = VoiceSessionController(
    audio: audio,
    keyboard: simulator,
    frontmostBundleIdentifier: { keyboard.frontmostBundleIdentifier },
    resolveTrigger: { bundleIdentifier in
        guard keyboard.midiCaptureDeviceId == nil else { return .none }
        return runtime.resolveUnique(
            trigger: voiceSessionTrigger, bundleIdentifier: bundleIdentifier
        )
    },
    canPostKeyboardEvents: { keyboard.requestPermission(prompt: false) },
    inputDevice: defaultAudioInput,
    targetInputDeviceUID: { audio.status.selectedDevice?.uid }
)
audio.onRuntimeFailure = { message in voiceSession.audioRuntimeFailed(message) }
voice.onStreamStarted = { voiceSession.startSession() }
voice.onPCM = { samples in voiceSession.enqueue(samples: samples) }
voice.onStreamStopped = { voiceSession.finishSession() }
let systemLifecycle = SystemLifecycleController(
    onSleep: {
        voiceSession.stopSession()
        audio.stop()
        voice.suspendForSystemSleep()
    },
    onWake: { voice.resumeAfterSystemWake() }
)
systemLifecycle.start()
let server = NativeCommandServer(
    devices: HIDDeviceManager(), keyboard: keyboard, voice: voice,
    audio: audio, voiceSession: voiceSession
)
let shutdown = {
    systemLifecycle.shutdown()
    keyboard.shutdown()
    voice.shutdown()
    voiceSession.shutdown()
    audio.shutdown()
    exit(EXIT_SUCCESS)
}
let terminationSignals = [SIGTERM, SIGINT, SIGHUP]
terminationSignals.forEach { signal($0, SIG_IGN) }
let terminationSources = terminationSignals.map { signalCode in
    let source = DispatchSource.makeSignalSource(signal: signalCode, queue: .main)
    source.setEventHandler(handler: shutdown)
    source.resume()
    return source
}

server.start()
RunLoop.main.run()

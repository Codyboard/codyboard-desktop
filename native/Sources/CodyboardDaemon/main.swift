import Foundation
import Darwin

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let voice = XiaomiVoiceBluetoothController()
let audio = VirtualAudioOutput()
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
    canPostKeyboardEvents: { keyboard.requestPermission(prompt: false) }
)
voice.onStreamStarted = { voiceSession.startSession() }
voice.onPCM = { samples in voiceSession.enqueue(samples: samples) }
voice.onStreamStopped = { voiceSession.finishSession() }
let server = NativeCommandServer(
    devices: HIDDeviceManager(), keyboard: keyboard, voice: voice,
    audio: audio, voiceSession: voiceSession
)
signal(SIGTERM, SIG_IGN)
let terminationSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminationSource.setEventHandler {
    keyboard.shutdown()
    voice.shutdown()
    voiceSession.shutdown()
    audio.shutdown()
    exit(EXIT_SUCCESS)
}
terminationSource.resume()

server.start()
RunLoop.main.run()

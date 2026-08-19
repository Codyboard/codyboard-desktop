import Foundation
import Darwin

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let voice = XiaomiVoiceBluetoothController()
let audio = VirtualAudioOutput()
voice.onStreamStarted = { audio.startVoiceSession() }
voice.onPCM = { samples in audio.enqueue(samples: samples) }
voice.onStreamStopped = { audio.drainAndStop() }
let server = NativeCommandServer(
    devices: HIDDeviceManager(), keyboard: keyboard, voice: voice, audio: audio
)
signal(SIGTERM, SIG_IGN)
let terminationSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminationSource.setEventHandler {
    keyboard.shutdown()
    voice.shutdown()
    audio.shutdown()
    exit(EXIT_SUCCESS)
}
terminationSource.resume()

server.start()
RunLoop.main.run()

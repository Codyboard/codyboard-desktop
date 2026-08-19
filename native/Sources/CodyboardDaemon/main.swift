import Foundation
import Darwin

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let voice = XiaomiVoiceBluetoothController()
let server = NativeCommandServer(
    devices: HIDDeviceManager(), keyboard: keyboard, voice: voice
)
signal(SIGTERM, SIG_IGN)
let terminationSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminationSource.setEventHandler {
    keyboard.shutdown()
    voice.shutdown()
    exit(EXIT_SUCCESS)
}
terminationSource.resume()

server.start()
RunLoop.main.run()

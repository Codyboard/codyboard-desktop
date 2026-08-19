import Foundation
import Darwin

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let server = NativeCommandServer(devices: HIDDeviceManager(), keyboard: keyboard)
signal(SIGTERM, SIG_IGN)
let terminationSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
terminationSource.setEventHandler {
    keyboard.shutdown()
    CFRunLoopStop(CFRunLoopGetMain())
}
terminationSource.resume()

server.start()
RunLoop.main.run()

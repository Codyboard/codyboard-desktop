import Foundation

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let applicationLauncher = ApplicationLauncher()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator, applicationLauncher: applicationLauncher)
let server = NativeCommandServer(devices: HIDDeviceManager(), keyboard: keyboard)

server.start()
RunLoop.main.run()

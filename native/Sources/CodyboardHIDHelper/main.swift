import Foundation

let runtime = ProfileRuntime()
let simulator = KeyboardSimulator()
let keyboard = KeyboardController(runtime: runtime, simulator: simulator)
let server = NativeCommandServer(devices: HIDDeviceManager(), keyboard: keyboard)

server.start()
RunLoop.main.run()

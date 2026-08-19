import ApplicationServices
import Foundation

extension KeyboardController {
    func applyDeviceAction(
        _ action: ActiveDeviceAction, event: CGEvent, pressed: Bool, autorepeat: Bool,
        details: [String: String]
    ) -> Unmanaged<CGEvent>? {
        switch action {
        case .passthrough:
            return Unmanaged.passUnretained(event)
        case .suppress:
            return nil
        case .launchApplication(let bundleIdentifier):
            if pressed && !autorepeat {
                applicationLauncher.launch(bundleIdentifier: bundleIdentifier)
            }
            return nil
        case .openURL(let url):
            if pressed && !autorepeat { applicationLauncher.open(urlString: url) }
            return nil
        case .typeText(let text, let pressEnter):
            if pressed && !autorepeat {
                reportSimulationError(details: details) {
                    try simulator.sendText(text, pressEnter: pressEnter)
                }
            }
            return nil
        case .output(let output):
            do {
                try simulator.post(output, pressed: pressed, autorepeat: autorepeat)
                return nil
            } catch {
                emitSimulationError(error, details: details)
                return Unmanaged.passUnretained(event)
            }
        }
    }

    func applyRawHIDAction(
        _ action: ActiveDeviceAction, pressed: Bool, autorepeat: Bool,
        details: [String: String]
    ) {
        switch action {
        case .passthrough, .suppress:
            return
        case .launchApplication(let bundleIdentifier):
            if pressed && !autorepeat {
                applicationLauncher.launch(bundleIdentifier: bundleIdentifier)
            }
        case .openURL(let url):
            if pressed && !autorepeat { applicationLauncher.open(urlString: url) }
        case .typeText(let text, let pressEnter):
            if pressed && !autorepeat {
                reportSimulationError(details: details) {
                    try simulator.sendText(text, pressEnter: pressEnter)
                }
            }
        case .output(let output):
            reportSimulationError(details: details) {
                try simulator.post(output, pressed: pressed, autorepeat: autorepeat)
            }
        }
    }

    private func reportSimulationError(
        details: [String: String], operation: () throws -> Void
    ) {
        do { try operation() }
        catch { emitSimulationError(error, details: details) }
    }

    private func emitSimulationError(_ error: Error, details: [String: String]) {
        NativeOutput.shared.error(
            id: nil, code: "simulationFailed", message: error.localizedDescription,
            details: details
        )
    }
}

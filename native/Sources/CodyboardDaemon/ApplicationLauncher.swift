import AppKit
import Foundation

final class ApplicationLauncher: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.codyboard.application-launcher", qos: .userInitiated)

    func launch(bundleIdentifier: String) {
        queue.async {
            guard let applicationURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleIdentifier) else {
                NativeOutput.shared.error(
                    id: nil,
                    code: "applicationNotFound",
                    message: "Unable to find application \(bundleIdentifier)",
                    details: ["bundleId": bundleIdentifier]
                )
                return
            }

            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = true
            configuration.addsToRecentItems = false
            NSWorkspace.shared.openApplication(at: applicationURL, configuration: configuration) { _, error in
                if let error {
                    NativeOutput.shared.error(
                        id: nil,
                        code: "applicationLaunchFailed",
                        message: error.localizedDescription,
                        details: ["bundleId": bundleIdentifier]
                    )
                }
            }
        }
    }
}

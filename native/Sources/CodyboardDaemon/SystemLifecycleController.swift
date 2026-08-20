import AppKit
import Foundation

final class SystemLifecycleController {
    private let onSleep: () -> Void
    private let onWake: () -> Void
    private var observers: [NSObjectProtocol] = []

    init(onSleep: @escaping () -> Void, onWake: @escaping () -> Void) {
        self.onSleep = onSleep
        self.onWake = onWake
    }

    func start() {
        guard observers.isEmpty else { return }
        let center = NSWorkspace.shared.notificationCenter
        observers = [
            center.addObserver(
                forName: NSWorkspace.willSleepNotification, object: nil, queue: .main
            ) { [weak self] _ in self?.prepareForSleep() },
            center.addObserver(
                forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
            ) { [weak self] _ in self?.resumeAfterWake() },
        ]
    }

    func prepareForSleep() { onSleep() }

    func resumeAfterWake() { onWake() }

    func shutdown() {
        let center = NSWorkspace.shared.notificationCenter
        observers.forEach(center.removeObserver)
        observers.removeAll()
    }
}

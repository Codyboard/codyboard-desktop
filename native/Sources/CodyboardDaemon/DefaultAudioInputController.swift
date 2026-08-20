import Foundation

struct DefaultAudioInputLease: Codable, Equatable {
    let previousDeviceUID: String
    let targetDeviceUID: String
}

protocol VoiceInputDeviceRouting: AnyObject {
    func beginOverride(targetDeviceUID: String) throws -> DefaultAudioInputLease
    func restore(_ lease: DefaultAudioInputLease)
}

struct DefaultAudioInputRecoveryStore {
    let url: URL

    func load() -> DefaultAudioInputLease? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(DefaultAudioInputLease.self, from: data)
    }

    func save(_ lease: DefaultAudioInputLease) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        try JSONEncoder().encode(lease).write(to: url, options: .atomic)
    }

    func clear() { try? FileManager.default.removeItem(at: url) }
}

final class DefaultAudioInputController: VoiceInputDeviceRouting {
    private let recoveryStore: DefaultAudioInputRecoveryStore

    init(recoveryURL: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codyboard/runtime/default-audio-input.json")) {
        self.recoveryStore = DefaultAudioInputRecoveryStore(url: recoveryURL)
    }

    func recoverInterruptedOverride() {
        guard let lease = storedLease() else { return }
        guard CoreAudioDeviceCatalog.defaultInputDevice()?.uid == lease.targetDeviceUID else {
            clearStoredLease()
            return
        }
        restore(lease)
    }

    func beginOverride(targetDeviceUID: String) throws -> DefaultAudioInputLease {
        recoverInterruptedOverride()
        guard let previous = CoreAudioDeviceCatalog.defaultInputDevice() else {
            throw inputError("Unable to read the current default input device")
        }
        let lease = DefaultAudioInputLease(
            previousDeviceUID: previous.uid,
            targetDeviceUID: targetDeviceUID
        )
        guard previous.uid != targetDeviceUID else { return lease }
        try recoveryStore.save(lease)
        do { try CoreAudioDeviceCatalog.setDefaultInputDevice(uid: targetDeviceUID) }
        catch {
            clearStoredLease()
            throw error
        }
        return lease
    }

    func restore(_ lease: DefaultAudioInputLease) {
        guard lease.previousDeviceUID != lease.targetDeviceUID else { return }
        guard CoreAudioDeviceCatalog.defaultInputDevice()?.uid == lease.targetDeviceUID else {
            clearStoredLease()
            return
        }
        guard CoreAudioDeviceCatalog.inputDevice(uid: lease.previousDeviceUID) != nil else {
            reportRestoreFailure("Previous input device is unavailable")
            return
        }
        do {
            try CoreAudioDeviceCatalog.setDefaultInputDevice(uid: lease.previousDeviceUID)
            clearStoredLease()
        } catch {
            reportRestoreFailure(error.localizedDescription)
        }
    }

    private func storedLease() -> DefaultAudioInputLease? {
        guard let lease = recoveryStore.load() else {
            clearStoredLease()
            return nil
        }
        return lease
    }

    private func clearStoredLease() {
        recoveryStore.clear()
    }

    private func reportRestoreFailure(_ message: String) {
        NativeOutput.shared.error(
            id: nil, code: "audioInputRestoreFailed", message: message
        )
    }

    private func inputError(_ message: String) -> NSError {
        NSError(
            domain: "app.codyboard.audio-input", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

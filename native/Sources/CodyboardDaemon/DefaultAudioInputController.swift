import Foundation

struct DefaultAudioInputLease: Equatable {
    let previousDeviceUID: String
    let targetDeviceUID: String
}

protocol VoiceInputDeviceRouting: AnyObject {
    func beginOverride(targetDeviceUID: String) throws -> DefaultAudioInputLease
    func restore(_ lease: DefaultAudioInputLease)
}

final class DefaultAudioInputController: VoiceInputDeviceRouting {
    func beginOverride(targetDeviceUID: String) throws -> DefaultAudioInputLease {
        guard let previous = CoreAudioDeviceCatalog.defaultInputDevice() else {
            throw inputError("Unable to read the current default input device")
        }
        let lease = DefaultAudioInputLease(
            previousDeviceUID: previous.uid,
            targetDeviceUID: targetDeviceUID
        )
        if previous.uid != targetDeviceUID {
            try CoreAudioDeviceCatalog.setDefaultInputDevice(uid: targetDeviceUID)
        }
        return lease
    }

    func restore(_ lease: DefaultAudioInputLease) {
        guard lease.previousDeviceUID != lease.targetDeviceUID,
              CoreAudioDeviceCatalog.inputDevice(uid: lease.previousDeviceUID) != nil
        else { return }
        do {
            try CoreAudioDeviceCatalog.setDefaultInputDevice(uid: lease.previousDeviceUID)
        } catch {
            NativeOutput.shared.error(
                id: nil, code: "audioInputRestoreFailed",
                message: error.localizedDescription
            )
        }
    }

    private func inputError(_ message: String) -> NSError {
        NSError(
            domain: "app.codyboard.audio-input", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

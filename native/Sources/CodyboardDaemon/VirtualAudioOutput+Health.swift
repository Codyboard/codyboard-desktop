import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation

extension VirtualAudioOutput {
    var isHealthy: Bool {
        VirtualAudioHealthPolicy.isHealthy(
            hasSelectedDevice: selectedDevice != nil,
            engineRunning: engine?.isRunning == true,
            playerPlaying: player?.isPlaying == true,
            boundToSelectedDevice: selectedDevice?.id == currentOutputDeviceID()
        )
    }

    func currentOutputDeviceID() -> AudioDeviceID? {
        guard let outputUnit = engine?.outputNode.audioUnit else { return nil }
        var id = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioUnitGetProperty(
            outputUnit, kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0, &id, &size
        ) == noErr else { return nil }
        return id
    }

    func observeConfigurationChanges(_ engine: AVAudioEngine) {
        configurationGeneration &+= 1
        let generation = configurationGeneration
        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self, weak engine] _ in
            guard let self, let engine, self.engine === engine,
                  self.configurationGeneration == generation, !self.isHealthy else { return }
            self.fail("CoreAudio route changed")
        }
    }

    func removeConfigurationObserver() {
        if let configurationObserver {
            NotificationCenter.default.removeObserver(configurationObserver)
            self.configurationObserver = nil
        }
        configurationGeneration &+= 1
    }

    func fail(_ message: String) {
        lastError = message
        stopRuntime(nextState: .failed)
        onRuntimeFailure?(message)
    }

    func publishStatus() {
        NativeOutput.shared.send(NativeEvent(event: "audioStateChanged", data: status))
    }

    func audioError(_ message: String) -> NSError {
        NSError(
            domain: "app.codyboard.audio", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

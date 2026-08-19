import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation

final class VirtualAudioOutput {
    private let sourceFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
    )!
    private let playbackLock = NSLock()
    private var drainState = AudioDrainState()
    private var drainCompletion: (() -> Void)?
    var engine: AVAudioEngine?
    var player: AVAudioPlayerNode?
    var configurationObserver: NSObjectProtocol?
    var configurationGeneration: UInt64 = 0
    private(set) var selectedDevice: AudioDeviceInfo?
    private(set) var testToneActive = false
    var lastError: String?

    var state: AudioOutputState = .unconfigured {
        didSet {
            if oldValue != state { publishStatus() }
        }
    }

    var status: AudioOutputStatus {
        playbackLock.lock()
        let pending = drainState.pendingBuffers
        playbackLock.unlock()
        return AudioOutputStatus(
            state: state, selectedDevice: selectedDevice,
            active: engine?.isRunning == true,
            healthy: isHealthy, pendingBuffers: pending,
            testToneActive: testToneActive, error: lastError
        )
    }

    func configure(deviceUID: String) throws -> AudioOutputStatus {
        guard !deviceUID.isEmpty else { throw audioError("deviceUID must not be empty") }
        guard let device = CoreAudioDeviceCatalog.device(uid: deviceUID) else {
            throw audioError("Selected CoreAudio output device is unavailable")
        }
        stopRuntime(nextState: .unconfigured)
        selectedDevice = device
        lastError = nil
        state = .configured
        return status
    }

    @discardableResult
    func startVoiceSession() -> Bool {
        if testToneActive { flushPlayer() }
        return startSession()
    }

    @discardableResult
    func startSession() -> Bool {
        cancelPendingDrain()
        if isHealthy {
            state = .ready
            return true
        }
        stopRuntime(nextState: selectedDevice == nil ? .unconfigured : .configured)
        guard let selectedDevice,
              let currentDevice = CoreAudioDeviceCatalog.device(uid: selectedDevice.uid)
        else {
            fail("Selected CoreAudio output device is unavailable")
            return false
        }
        self.selectedDevice = currentDevice
        state = .starting
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: sourceFormat)
        guard let outputUnit = engine.outputNode.audioUnit else {
            fail("Unable to open CoreAudio output unit")
            return false
        }
        var deviceID = AudioDeviceID(currentDevice.id)
        let result = AudioUnitSetProperty(
            outputUnit, kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0, &deviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )
        guard result == noErr else {
            fail("Unable to bind CoreAudio output device (\(result))")
            return false
        }
        do {
            engine.prepare()
            try engine.start()
            player.play()
            guard player.isPlaying else {
                engine.stop()
                fail("CoreAudio player did not start")
                return false
            }
            self.engine = engine
            self.player = player
            observeConfigurationChanges(engine)
            lastError = nil
            state = .ready
            guard isHealthy else {
                fail("CoreAudio output binding is unhealthy")
                return false
            }
            return true
        } catch {
            fail("CoreAudio start failed: \(error.localizedDescription)")
            return false
        }
    }

    @discardableResult
    func enqueue(samples: [Int16]) -> Bool {
        guard isHealthy, let player, let buffer = makeBuffer(samples) else {
            if selectedDevice != nil { fail("CoreAudio output became unhealthy") }
            return false
        }
        playbackLock.lock()
        drainState.scheduledBuffer()
        playbackLock.unlock()
        player.scheduleBuffer(
            buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in
            self?.scheduledBufferCompleted()
        }
        return true
    }

    func drainAndStop(
        maximumDelay: TimeInterval = 0.75,
        completion: (() -> Void)? = nil
    ) {
        guard engine != nil else {
            completion?()
            return
        }
        state = .draining
        playbackLock.lock()
        let drain = drainState.begin()
        drainCompletion = completion
        playbackLock.unlock()
        if drain.immediate {
            finishDrain()
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + maximumDelay) { [weak self] in
            self?.finishDrainIfTimedOut(generation: drain.generation)
        }
    }

    @discardableResult
    func playTestTone() -> Bool {
        guard !testToneActive, startSession() else { return false }
        testToneActive = true
        publishStatus()
        guard enqueue(samples: TestToneGenerator.samples()) else {
            testToneActive = false
            return false
        }
        drainAndStop(maximumDelay: 1.5) { [weak self] in
            guard let self else { return }
            self.testToneActive = false
            NativeOutput.shared.send(NativeEvent(
                event: "audioTestToneFinished", data: self.status
            ))
        }
        return true
    }

    func stop() {
        stopRuntime(nextState: selectedDevice == nil ? .unconfigured : .configured)
    }

    func shutdown() {
        stopRuntime(nextState: .unconfigured)
        selectedDevice = nil
        lastError = nil
    }

    private func makeBuffer(_ samples: [Int16]) -> AVAudioPCMBuffer? {
        guard !samples.isEmpty,
              let buffer = AVAudioPCMBuffer(
                pcmFormat: sourceFormat,
                frameCapacity: AVAudioFrameCount(samples.count)
              ),
              let channel = buffer.floatChannelData?[0] else { return nil }
        for index in samples.indices {
            channel[index] = Float(samples[index]) / Float(Int16.max)
        }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        return buffer
    }

    private func scheduledBufferCompleted() {
        playbackLock.lock()
        let shouldFinish = drainState.completedBuffer()
        playbackLock.unlock()
        if shouldFinish { DispatchQueue.main.async { [weak self] in self?.finishDrain() } }
    }

    private func finishDrainIfTimedOut(generation: UInt64) {
        playbackLock.lock()
        let shouldFinish = drainState.timedOut(generation: generation)
        playbackLock.unlock()
        if shouldFinish { finishDrain() }
    }

    private func finishDrain() {
        playbackLock.lock()
        let completion = drainCompletion
        drainCompletion = nil
        playbackLock.unlock()
        stopRuntime(nextState: selectedDevice == nil ? .unconfigured : .configured)
        completion?()
    }

    private func cancelPendingDrain() {
        playbackLock.lock()
        drainState.cancelDrain()
        drainCompletion = nil
        playbackLock.unlock()
    }

    private func flushPlayer() {
        playbackLock.lock()
        drainState.reset()
        drainCompletion = nil
        playbackLock.unlock()
        testToneActive = false
        guard let player, engine?.isRunning == true else { return }
        player.stop()
        player.reset()
        player.play()
    }

    func stopRuntime(nextState: AudioOutputState) {
        removeConfigurationObserver()
        playbackLock.lock()
        drainState.reset()
        drainCompletion = nil
        playbackLock.unlock()
        testToneActive = false
        player?.stop()
        engine?.stop()
        player = nil
        engine = nil
        state = nextState
    }

}

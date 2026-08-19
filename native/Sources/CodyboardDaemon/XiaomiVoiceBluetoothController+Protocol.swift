import Foundation

extension XiaomiVoiceBluetoothController {
    func handleControl(_ data: Data, generation: UInt64) {
        guard let message = ATVVControlMessage.parse(data) else {
            fail("Malformed ATVV control message")
            return
        }
        switch message {
        case .capabilities(let capabilities):
            guard phase.acceptsCapabilities(generation) else { return }
            guard processor.configure(capabilities) else {
                fail("Remote does not provide 16 kHz ATVV audio")
                return
            }
            timeoutWorkItem?.cancel()
            phase = .ready(generation)
            state = .ready
        case .microphoneOpenRequested:
            guard phase.acceptsProtocolData(generation),
                  let capabilities = processor.capabilities,
                  let peripheral, let transmitCharacteristic else { return }
            write(
                ATVVProtocol.microphoneOpen(
                    version: capabilities.version, codec: capabilities.selectedCodec
                ),
                peripheral: peripheral, to: transmitCharacteristic
            )
            microphoneOpened = true
        case .streamStarted(let codec, let sessionID):
            guard phase.acceptsProtocolData(generation) else { return }
            if processor.isStreaming { return }
            guard processor.start(codec: codec, sessionID: sessionID) else {
                fail("Unsupported ATVV stream codec")
                return
            }
            beginStream(generation: generation)
        case .streamStopped:
            guard phase.acceptsProtocolData(generation) else { return }
            endStream(now: ProcessInfo.processInfo.systemUptime)
        case .synchronization(let predictor, let stepIndex):
            guard phase.acceptsProtocolData(generation) else { return }
            processor.synchronize(predictor: predictor, stepIndex: stepIndex)
        case .unknown:
            break
        }
    }

    func handleAudio(_ data: Data, generation: UInt64) {
        guard phase.acceptsProtocolData(generation) else { return }
        let decoded = processor.appendAudio(
            data, gainDB: configuration.gainDB,
            now: ProcessInfo.processInfo.systemUptime
        )
        if decoded.startedImplicitly { beginStream(generation: generation) }
        guard streamOutputReady else { return }
        for chunk in decoded.chunks where onPCM?(chunk) != true {
            streamOutputReady = false
            break
        }
    }

    func beginStream(generation: UInt64) {
        guard streamGeneration == nil else { return }
        streamGeneration = generation
        streamOutputReady = onStreamStarted?() == true
        publishState()
        NativeOutput.shared.send(NativeEvent(
            event: "voiceStreamStarted",
            data: VoiceStreamEvent(generation: generation, sessionID: processor.sessionID)
        ))
    }

    func endStream(now: TimeInterval) {
        guard let streamGeneration else { return }
        let metrics = VoiceMetrics(
            generation: streamGeneration, sessionID: processor.sessionID,
            decodedFrames: processor.decodedFrames, decodedSamples: processor.decodedSamples
        )
        processor.stop(now: now)
        microphoneOpened = false
        self.streamGeneration = nil
        NativeOutput.shared.send(NativeEvent(event: "voiceMetrics", data: metrics))
        NativeOutput.shared.send(NativeEvent(event: "voiceStreamStopped", data: metrics))
        if streamOutputReady { onStreamStopped?() }
        streamOutputReady = false
        publishState()
    }

    func publishState() {
        NativeOutput.shared.send(NativeEvent(event: "bluetoothStateChanged", data: status))
    }
}

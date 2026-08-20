import CoreAudio
import Foundation

struct AudioDeviceInfo: Codable, Equatable {
    let id: UInt32
    let uid: String
    let name: String
    let inputChannels: Int
    let outputChannels: Int
}

enum CoreAudioDeviceCatalog {
    private static let lock = NSRecursiveLock()

    static func outputDevices() -> [AudioDeviceInfo] {
        lock.lock()
        defer { lock.unlock() }
        return allDevices().filter { $0.outputChannels > 0 }
    }

    static func inputDevices() -> [AudioDeviceInfo] {
        lock.lock()
        defer { lock.unlock() }
        return allDevices().filter { $0.inputChannels > 0 }
    }

    static func device(uid: String) -> AudioDeviceInfo? {
        outputDevices().first { $0.uid == uid }
    }

    static func inputDevice(uid: String) -> AudioDeviceInfo? {
        inputDevices().first { $0.uid == uid }
    }

    static func defaultInputDevice() -> AudioDeviceInfo? {
        lock.lock()
        defer { lock.unlock() }
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var id = AudioDeviceID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &id
        ) == noErr else { return nil }
        return makeDevice(id)
    }

    static func setDefaultInputDevice(uid: String) throws {
        lock.lock()
        defer { lock.unlock() }
        guard let device = inputDevice(uid: uid) else {
            throw audioDeviceError("Input device is unavailable: \(uid)")
        }
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var id = AudioDeviceID(device.id)
        let result = AudioObjectSetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil,
            UInt32(MemoryLayout<AudioDeviceID>.size), &id
        )
        guard result == noErr, defaultInputDevice()?.uid == uid else {
            throw audioDeviceError("Unable to select input device (\(result))")
        }
    }

    private static func allDevices() -> [AudioDeviceInfo] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size
        ) == noErr else { return [] }
        let count = Int(size) / MemoryLayout<AudioDeviceID>.size
        guard count > 0 else { return [] }
        var ids = Array(repeating: AudioDeviceID(0), count: count)
        let result = ids.withUnsafeMutableBufferPointer { buffer in
            AudioObjectGetPropertyData(
                AudioObjectID(kAudioObjectSystemObject), &address, 0, nil,
                &size, buffer.baseAddress!
            )
        }
        guard result == noErr else { return [] }
        var seen = Set<String>()
        return ids.compactMap(makeDevice)
            .filter { seen.insert($0.uid).inserted }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    private static func makeDevice(_ id: AudioDeviceID) -> AudioDeviceInfo? {
        guard id != kAudioObjectUnknown,
              let uid = stringProperty(id, selector: kAudioDevicePropertyDeviceUID),
              let name = stringProperty(id, selector: kAudioObjectPropertyName)
        else { return nil }
        return AudioDeviceInfo(
            id: id, uid: uid, name: name,
            inputChannels: channelCount(id, scope: kAudioDevicePropertyScopeInput),
            outputChannels: channelCount(id, scope: kAudioDevicePropertyScopeOutput)
        )
    }

    private static func stringProperty(
        _ id: AudioObjectID, selector: AudioObjectPropertySelector
    ) -> String? {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr
        else { return nil }
        return value?.takeUnretainedValue() as String?
    }

    private static func channelCount(
        _ id: AudioDeviceID, scope: AudioObjectPropertyScope
    ) -> Int {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr,
              size >= UInt32(MemoryLayout<AudioBufferList>.size) else { return 0 }
        let raw = UnsafeMutableRawPointer.allocate(
            byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { raw.deallocate() }
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, raw) == noErr
        else { return 0 }
        return UnsafeMutableAudioBufferListPointer(
            raw.assumingMemoryBound(to: AudioBufferList.self)
        ).reduce(0) { $0 + Int($1.mNumberChannels) }
    }
}

private func audioDeviceError(_ message: String) -> NSError {
    NSError(
        domain: "app.codyboard.audio-input", code: 1,
        userInfo: [NSLocalizedDescriptionKey: message]
    )
}

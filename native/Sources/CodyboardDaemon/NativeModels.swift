import Foundation

let systemDefinedEventRawValue: UInt32 = 14
let syntheticEventMarker: Int64 = 0x434F4459424F4152

struct Command: Decodable {
    let id: String
    let method: String
    let params: CommandParams?
}

struct CommandParams: Decodable {
    let deviceId: String?
    let includeVirtual: Bool?
    let snapshot: CompiledProfileSet?
    let output: CompiledOutput?
    let keyboardType: Int?
    let permission: String?
    let configuration: VoiceConfiguration?
    let deviceUID: String?
}

struct PermissionStatus: Codable {
    let accessibility: Bool
    let bluetooth: String
    let inputMonitoring: Bool
}

struct DiagnosticKeyEvent: Codable {
    let deviceId: String?
    let keyboardType: Int?
    let eventType: String
    let source: String
    let code: Int
    let keyCode: Int?
    let flags: UInt64
    let timestamp: UInt64
}

struct NativeErrorPayload: Codable {
    let code: String
    let message: String
    let details: [String: String]?
}

struct SuccessResponse<T: Encodable>: Encodable {
    let id: String
    let ok = true
    let data: T
}

struct FailureResponse: Encodable {
    let id: String?
    let ok = false
    let error: NativeErrorPayload
}

struct NativeEvent<T: Encodable>: Encodable {
    let event: String
    let data: T
}

struct NativeErrorEvent: Encodable {
    let event = "error"
    let error: NativeErrorPayload
}

struct EmptyPayload: Codable {}

struct ReplaceResult: Codable {
    let generation: Int
    let listening: Bool
}

struct VoiceConfiguration: Codable, Equatable {
    let enabled: Bool
    let targetIdentifier: String?
    let gainDB: Double

    static let disabled = VoiceConfiguration(
        enabled: false, targetIdentifier: nil, gainDB: 0
    )
}

enum VoiceBluetoothState: String, Codable {
    case stopped
    case unavailable
    case scanning
    case connecting
    case discovering
    case ready
    case reconnecting
    case failed
}

struct VoiceStatus: Codable, Equatable {
    let state: VoiceBluetoothState
    let enabled: Bool
    let deviceIdentifier: String?
    let deviceName: String?
    let capabilities: ATVVCapabilities?
    let streaming: Bool
    let generation: UInt64?
    let error: String?
}

struct VoiceStreamEvent: Codable, Equatable {
    let generation: UInt64
    let sessionID: UInt8
}

struct VoiceMetrics: Codable, Equatable {
    let generation: UInt64
    let sessionID: UInt8
    let decodedFrames: Int
    let decodedSamples: Int
}

enum AudioOutputState: String, Codable {
    case unconfigured
    case configured
    case starting
    case ready
    case draining
    case failed
}

struct AudioOutputStatus: Codable, Equatable {
    let state: AudioOutputState
    let selectedDevice: AudioDeviceInfo?
    let active: Bool
    let healthy: Bool
    let pendingBuffers: Int
    let testToneActive: Bool
    let error: String?
}

struct DeviceInfo: Codable {
    let id: String
    let type: Int?
    let vendorId: Int?
    let productId: Int?
    let usagePage: Int?
    let usage: Int?
    let manufacturer: String?
    let product: String?
    let serialNumber: String?
    let transport: String?
    let locationId: Int?
    let isVirtual: Bool
    let properties: [String: String]

    static func logicalKeyboard(type: Int) -> DeviceInfo {
        DeviceInfo(
            id: "keyboard-type:\(type)", type: type, vendorId: nil, productId: nil,
            usagePage: 0x07, usage: nil, manufacturer: nil,
            product: "Keyboard type \(type)", serialNumber: nil, transport: "CGEventTap",
            locationId: nil, isVirtual: false, properties: ["KeyboardType": String(type)]
        )
    }
}

struct HIDKeyEvent: Codable {
    let device: DeviceInfo
    let eventType: String
    let key: String
    let code: Int
    let usagePage: Int
    let pressed: Bool
    let value: Int
    let timestamp: UInt64
    let flags: UInt64
    let frontmostBundleIdentifier: String?
}

struct CompiledProfileSet: Codable {
    let generation: Int
    let profiles: [CompiledActiveProfile]
}

struct CompiledActiveProfile: Codable {
    let deviceId: String
    let profileId: String
    let global: [CompiledMapping]
    let applications: [String: [CompiledMapping]]

    init(
        deviceId: String, profileId: String,
        global: [CompiledMapping], applications: [String: [CompiledMapping]]
    ) {
        self.deviceId = deviceId
        self.profileId = profileId
        self.global = global
        self.applications = applications
    }
}

struct CompiledMapping: Codable {
    let id: String
    let trigger: CompiledTrigger
    let output: CompiledOutput
}

struct CompiledTrigger: Codable, Hashable {
    let kind: String
    let code: Int
    let modifiers: [String]
}

struct CompiledOutput: Codable, Equatable {
    let kind: String
    let code: Int?
    let bundleId: String?
    let modifier: String?
    let modifiers: [String]
    let pressEnter: Bool?
    let text: String?
    let url: String?
    let voiceAudioSource: String?

    init(
        kind: String, code: Int?, modifiers: [String], bundleId: String? = nil,
        modifier: String? = nil, pressEnter: Bool? = nil, text: String? = nil,
        url: String? = nil, voiceAudioSource: String? = nil
    ) {
        self.kind = kind
        self.code = code
        self.bundleId = bundleId
        self.modifier = modifier
        self.modifiers = modifiers
        self.pressEnter = pressEnter
        self.text = text
        self.url = url
        self.voiceAudioSource = voiceAudioSource
    }
}

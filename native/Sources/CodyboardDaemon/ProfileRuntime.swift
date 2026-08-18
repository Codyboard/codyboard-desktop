import Foundation

enum MappingResolution {
    case none
    case output(CompiledOutput)
    case ambiguous
}

private struct RuntimeProfile {
    let global: [CompiledTrigger: CompiledOutput]
    let applications: [String: [CompiledTrigger: CompiledOutput]]
}

final class ProfileRuntime {
    private(set) var generation = 0
    private var deviceProfiles: [String: RuntimeProfile] = [:]

    var isEmpty: Bool { deviceProfiles.isEmpty }

    func replace(_ snapshot: CompiledProfileSet) {
        generation = snapshot.generation
        deviceProfiles = [:]
        for profile in snapshot.profiles {
            let global = Dictionary(uniqueKeysWithValues: profile.global.map { ($0.trigger, $0.output) })
            let applications = profile.applications.mapValues { mappings in
                Dictionary(uniqueKeysWithValues: mappings.map { ($0.trigger, $0.output) })
            }
            let runtimeProfile = RuntimeProfile(global: global, applications: applications)
            deviceProfiles[profile.deviceId] = runtimeProfile
        }
    }

    func resolve(trigger: CompiledTrigger, deviceId: String, bundleIdentifier: String?) -> MappingResolution {
        guard let profile = deviceProfiles[deviceId] else { return .none }
        return output(in: profile, trigger: trigger, bundleIdentifier: bundleIdentifier)
            .map(MappingResolution.output) ?? .none
    }

    private func output(in profile: RuntimeProfile, trigger: CompiledTrigger, bundleIdentifier: String?) -> CompiledOutput? {
        if let bundleIdentifier, let applicationOutput = profile.applications[bundleIdentifier]?[trigger] {
            return applicationOutput
        }
        return profile.global[trigger]
    }
}

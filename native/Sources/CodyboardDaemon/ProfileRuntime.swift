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
    private var profiles: [Int: RuntimeProfile] = [:]

    var isEmpty: Bool { profiles.isEmpty }

    func replace(_ snapshot: CompiledProfileSet) {
        generation = snapshot.generation
        profiles = Dictionary(uniqueKeysWithValues: snapshot.profiles.map { profile in
            let global = Dictionary(uniqueKeysWithValues: profile.global.map { ($0.trigger, $0.output) })
            let applications = profile.applications.mapValues { mappings in
                Dictionary(uniqueKeysWithValues: mappings.map { ($0.trigger, $0.output) })
            }
            return (profile.keyboardType, RuntimeProfile(global: global, applications: applications))
        })
    }

    func resolve(trigger: CompiledTrigger, keyboardType: Int?, bundleIdentifier: String?) -> MappingResolution {
        if let keyboardType {
            guard let profile = profiles[keyboardType] else { return .none }
            return output(in: profile, trigger: trigger, bundleIdentifier: bundleIdentifier).map(MappingResolution.output) ?? .none
        }

        var match: CompiledOutput?
        for profile in profiles.values {
            guard let output = output(in: profile, trigger: trigger, bundleIdentifier: bundleIdentifier) else { continue }
            if match != nil { return .ambiguous }
            match = output
        }
        return match.map(MappingResolution.output) ?? .none
    }

    private func output(in profile: RuntimeProfile, trigger: CompiledTrigger, bundleIdentifier: String?) -> CompiledOutput? {
        if let bundleIdentifier, let applicationOutput = profile.applications[bundleIdentifier]?[trigger] {
            return applicationOutput
        }
        return profile.global[trigger]
    }
}

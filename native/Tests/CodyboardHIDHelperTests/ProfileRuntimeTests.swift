import XCTest
@testable import CodyboardHIDHelper

final class ProfileRuntimeTests: XCTestCase {
    private let left = CompiledTrigger(kind: "keyboard", code: 123, modifiers: [])
    private let globalOutput = CompiledOutput(kind: "keyboard", code: 37, modifiers: [])
    private let appOutput = CompiledOutput(kind: "keyboard", code: 11, modifiers: ["command"])

    func testApplicationMappingOverridesGlobal() {
        let runtime = ProfileRuntime()
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [profile(type: 40)]))
        guard case .output(let output) = runtime.resolve(
            trigger: left, keyboardType: 40, bundleIdentifier: "com.openai.codex"
        ) else { return XCTFail("Expected an application mapping") }
        XCTAssertEqual(output.code, 11)
        XCTAssertEqual(output.modifiers, ["command"])
    }

    func testGlobalFallback() {
        let runtime = ProfileRuntime()
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [profile(type: 40)]))
        guard case .output(let output) = runtime.resolve(
            trigger: left, keyboardType: 40, bundleIdentifier: "com.apple.TextEdit"
        ) else { return XCTFail("Expected a global mapping") }
        XCTAssertEqual(output.code, 37)
    }

    func testUntypedSystemEventIsAmbiguousAcrossProfiles() {
        let runtime = ProfileRuntime()
        let trigger = CompiledTrigger(kind: "system", code: 0, modifiers: [])
        let mapping = CompiledMapping(id: "volume", trigger: trigger, output: globalOutput)
        let first = CompiledActiveProfile(keyboardType: 40, profileId: "one", global: [mapping], applications: [:])
        let second = CompiledActiveProfile(keyboardType: 41, profileId: "two", global: [mapping], applications: [:])
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [first, second]))
        guard case .ambiguous = runtime.resolve(trigger: trigger, keyboardType: nil, bundleIdentifier: nil)
        else { return XCTFail("Expected ambiguity") }
    }

    private func profile(type: Int) -> CompiledActiveProfile {
        CompiledActiveProfile(
            keyboardType: type,
            profileId: "presenter",
            global: [CompiledMapping(id: "global", trigger: left, output: globalOutput)],
            applications: ["com.openai.codex": [CompiledMapping(id: "app", trigger: left, output: appOutput)]]
        )
    }
}

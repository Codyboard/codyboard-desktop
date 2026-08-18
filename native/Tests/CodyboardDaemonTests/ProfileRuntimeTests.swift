import XCTest
@testable import CodyboardDaemon

final class ProfileRuntimeTests: XCTestCase {
    private let left = CompiledTrigger(kind: "keyboard", code: 123, modifiers: [])
    private let globalOutput = CompiledOutput(kind: "keyboard", code: 37, modifiers: [])
    private let appOutput = CompiledOutput(kind: "keyboard", code: 11, modifiers: ["command"])

    func testSweepProUsagesCoverAllVisibleKeys() {
        let usages: [UInt32] = [
            0x17, 0x0A, 0x05, 0x15, 0x09, 0x19, 0x08, 0x07,
            0x06, 0x1A, 0x16, 0x1B, 0x14, 0x04, 0x1D,
        ]
        XCTAssertTrue(usages.allSatisfy { PhysicalKeyboardHIDMonitor.keyCodes[$0] != nil })
        XCTAssertEqual(PhysicalKeyboardHIDMonitor.keyCodes[0x14], 12)
        XCTAssertEqual(PhysicalKeyboardHIDMonitor.keyCodes[0x2B], 48)
        XCTAssertEqual(PhysicalKeyboardHIDMonitor.keyCodes[0xE1], 56)
    }

    func testProfileDomainsPreserveDeviceNamesExactly() {
        XCTAssertEqual(
            HIDProfileDomain.named("Sweep Pro", fallbackName: "Sweep Pro"),
            "Sweep Pro"
        )
        XCTAssertEqual(
            HIDProfileDomain.named("  Sweep  PRO  ", fallbackName: "Sweep Pro"),
            "  Sweep  PRO  "
        )
        XCTAssertEqual(
            HIDProfileDomain.named("", fallbackName: "小米蓝牙语音遥控器"),
            "小米蓝牙语音遥控器"
        )
    }

    func testApplicationMappingOverridesGlobal() {
        let runtime = ProfileRuntime()
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [profile(deviceId: "0x100004baa")]))
        guard case .output(let output) = runtime.resolve(
            trigger: left, deviceId: "0x100004baa", bundleIdentifier: "com.openai.codex"
        ) else { return XCTFail("Expected an application mapping") }
        XCTAssertEqual(output.code, 11)
        XCTAssertEqual(output.modifiers, ["command"])
    }

    func testGlobalFallback() {
        let runtime = ProfileRuntime()
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [profile(deviceId: "0x100004baa")]))
        guard case .output(let output) = runtime.resolve(
            trigger: left, deviceId: "0x100004baa", bundleIdentifier: "com.apple.TextEdit"
        ) else { return XCTFail("Expected a global mapping") }
        XCTAssertEqual(output.code, 37)
    }

    func testDeviceProfileResolvesByDeviceId() {
        let runtime = ProfileRuntime()
        runtime.replace(CompiledProfileSet(generation: 1, profiles: [
            CompiledActiveProfile(
                deviceId: "vid-1d50-pid-615e", profileId: "default",
                global: [CompiledMapping(id: "global", trigger: left, output: globalOutput)],
                applications: [:]
            )
        ]))
        guard case .output(let output) = runtime.resolve(
            trigger: left, deviceId: "vid-1d50-pid-615e", bundleIdentifier: nil
        ) else { return XCTFail("Expected a device mapping") }
        XCTAssertEqual(output.code, 37)
    }

    func testLaunchApplicationOutputDecodesBundleIdentifier() throws {
        let data = Data(#"{"kind":"launchApplication","bundleId":"com.apple.Keynote","modifiers":[]}"#.utf8)
        let output = try JSONDecoder().decode(CompiledOutput.self, from: data)
        XCTAssertEqual(output.kind, "launchApplication")
        XCTAssertEqual(output.bundleId, "com.apple.Keynote")
        XCTAssertNil(output.code)
    }

    func testLegacyKeyboardOutputDecodesWithoutBundleIdentifier() throws {
        let data = Data(#"{"kind":"keyboard","code":37,"modifiers":[]}"#.utf8)
        let output = try JSONDecoder().decode(CompiledOutput.self, from: data)
        XCTAssertNil(output.bundleId)
        XCTAssertEqual(output.code, 37)
    }

    func testModifierOutputDecodesModifierName() throws {
        let data = Data(#"{"kind":"modifier","code":63,"modifier":"fn","modifiers":[]}"#.utf8)
        let output = try JSONDecoder().decode(CompiledOutput.self, from: data)
        XCTAssertEqual(output.kind, "modifier")
        XCTAssertEqual(output.modifier, "fn")
        XCTAssertEqual(output.code, 63)
    }

    func testActiveDevicePressKeepsDownMappingUntilMatchingUp() {
        var presses = ActiveDevicePressStore()
        let input = DeviceInputIdentity(deviceId: "sweep", kind: "keyboard", code: 17)
        let downOutput = CompiledOutput(kind: "keyboard", code: 11, modifiers: ["command"])

        presses.begin(input, action: .output(downOutput))

        guard case .output(let repeatOutput) = presses.uniqueAction(kind: "keyboard", code: 17) else {
            return XCTFail("Expected repeat to use the active down mapping")
        }
        XCTAssertEqual(repeatOutput.code, 11)
        XCTAssertEqual(repeatOutput.modifiers, ["command"])

        guard case .output(let upOutput) = presses.end(input) else {
            return XCTFail("Expected key up to release the active down mapping")
        }
        XCTAssertEqual(upOutput.code, 11)
        XCTAssertNil(presses.action(for: input))
    }

    func testRepeatMappingRequiresOneUnambiguousActiveDevice() {
        var presses = ActiveDevicePressStore()
        presses.begin(
            DeviceInputIdentity(deviceId: "sweep-a", kind: "keyboard", code: 17),
            action: .suppress
        )
        presses.begin(
            DeviceInputIdentity(deviceId: "sweep-b", kind: "keyboard", code: 17),
            action: .passthrough
        )

        XCTAssertNil(presses.uniqueAction(kind: "keyboard", code: 17))
    }

    func testSyntheticModifiersRemainHeldUntilEveryChordReleasesThem() {
        var ledger = SyntheticModifierLedger()

        XCTAssertTrue(ledger.press("control"))
        XCTAssertTrue(ledger.press("shift"))
        XCTAssertFalse(ledger.press("control"))
        XCTAssertEqual(ledger.activeModifiers, ["control", "shift"])

        XCTAssertFalse(ledger.release("control"))
        XCTAssertEqual(ledger.activeModifiers, ["control", "shift"])
        XCTAssertTrue(ledger.release("shift"))
        XCTAssertTrue(ledger.release("control"))
        XCTAssertTrue(ledger.activeModifiers.isEmpty)
    }

    private func profile(deviceId: String) -> CompiledActiveProfile {
        CompiledActiveProfile(
            deviceId: deviceId,
            profileId: "presenter",
            global: [CompiledMapping(id: "global", trigger: left, output: globalOutput)],
            applications: ["com.openai.codex": [CompiledMapping(id: "app", trigger: left, output: appOutput)]]
        )
    }
}

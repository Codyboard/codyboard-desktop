import XCTest
@testable import CodyboardDaemon

final class SystemLifecycleControllerTests: XCTestCase {
    func testSleepAndWakeCallbacksRemainPaired() {
        var events: [String] = []
        let controller = SystemLifecycleController(
            onSleep: { events.append("sleep") },
            onWake: { events.append("wake") }
        )

        controller.prepareForSleep()
        controller.resumeAfterWake()

        XCTAssertEqual(events, ["sleep", "wake"])
    }
}

import Foundation
import XCTest
@testable import CodyboardDaemon

final class DefaultAudioInputControllerTests: XCTestCase {
    func testRecoveryStorePersistsAndClearsLease() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        let store = DefaultAudioInputRecoveryStore(
            url: directory.appendingPathComponent("input-lease.json")
        )
        let lease = DefaultAudioInputLease(
            previousDeviceUID: "built-in", targetDeviceUID: "virtual"
        )
        defer { try? FileManager.default.removeItem(at: directory) }

        try store.save(lease)
        XCTAssertEqual(store.load(), lease)

        store.clear()
        XCTAssertNil(store.load())
    }
}

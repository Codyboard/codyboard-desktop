import Foundation

final class NativeOutput: @unchecked Sendable {
    static let shared = NativeOutput()
    private let queue = DispatchQueue(label: "app.codyboard.hid.output")
    private let encoder = JSONEncoder()

    func send<T: Encodable>(_ value: T) {
        queue.async {
            do {
                var data = try self.encoder.encode(value)
                data.append(0x0A)
                FileHandle.standardOutput.write(data)
            } catch {
                FileHandle.standardError.write(Data("encode error: \(error)\n".utf8))
            }
        }
    }

    func error(id: String?, code: String, message: String, details: [String: String]? = nil) {
        let payload = NativeErrorPayload(code: code, message: message, details: details)
        if let id { send(FailureResponse(id: id, error: payload)) }
        else { send(NativeErrorEvent(error: payload)) }
    }

    func log(_ message: String) {
        queue.async {
            FileHandle.standardError.write(Data("[CodyboardDaemon] \(message)\n".utf8))
        }
    }
}

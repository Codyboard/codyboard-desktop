import Foundation

enum HIDProfileDomain {
    static func named(_ productName: String?, fallbackName: String) -> String {
        guard let productName, !productName.isEmpty else { return fallbackName }
        return productName
    }
}

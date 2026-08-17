// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CodyboardNative",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "CodyboardHIDHelper", targets: ["CodyboardHIDHelper"])
    ],
    targets: [
        .executableTarget(
            name: "CodyboardHIDHelper",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("CoreFoundation")
            ]
        )
    ],
    swiftLanguageModes: [.v5]
)

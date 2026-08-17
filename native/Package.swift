// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CodyboardNative",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "CodyboardDaemon", targets: ["CodyboardHIDHelper"])
    ],
    targets: [
        .executableTarget(
            name: "CodyboardHIDHelper",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("IOKit"),
                .linkedFramework("CoreFoundation")
            ]
        ),
        .testTarget(name: "CodyboardHIDHelperTests", dependencies: ["CodyboardHIDHelper"])
    ],
    swiftLanguageModes: [.v5]
)

// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CodyboardDaemon",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "CodyboardDaemon", targets: ["CodyboardDaemon"])
    ],
    targets: [
        .executableTarget(
            name: "CodyboardDaemon",
            path: "Sources/CodyboardDaemon",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("CoreBluetooth"),
                .linkedFramework("IOKit"),
                .linkedFramework("CoreFoundation")
            ]
        ),
        .testTarget(
            name: "CodyboardDaemonTests",
            dependencies: ["CodyboardDaemon"],
            path: "Tests/CodyboardDaemonTests"
        )
    ],
    swiftLanguageModes: [.v5]
)

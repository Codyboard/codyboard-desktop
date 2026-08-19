#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
BLACKHOLE_VERSION="0.7.1"
BLACKHOLE_TAG="v$BLACKHOLE_VERSION"
BLACKHOLE_COMMIT="e2b22aaaba4e507a097131704bf96dabc004d9cf"
BUILD_ROOT="$ROOT/.build/virtual-microphone"
SOURCE_ROOT="$BUILD_ROOT/BlackHole"
OUTPUT="$ROOT/.build/CodyboardVirtualMicrophone.driver"
PATCH="$ROOT/third_party/blackhole/codyboard-virtual-microphone.patch"
PRODUCT_NAME="CodyboardVirtualMicrophone"
BUNDLE_ID="com.codyboard.VirtualMicrophone"

for command_name in git xcrun cp strip codesign plutil strings grep; do
  command -v "$command_name" >/dev/null || {
    print -u2 "Missing required command: $command_name"
    exit 1
  }
done

case "$BUILD_ROOT" in
  "$ROOT"/.build/virtual-microphone) ;;
  *) print -u2 "Refusing to clean unexpected build path: $BUILD_ROOT"; exit 1 ;;
esac
case "$OUTPUT" in
  "$ROOT"/.build/CodyboardVirtualMicrophone.driver) ;;
  *) print -u2 "Refusing to replace unexpected output path: $OUTPUT"; exit 1 ;;
esac

rm -rf -- "$BUILD_ROOT" "$OUTPUT"
mkdir -p "${BUILD_ROOT:h}" "${OUTPUT:h}"
git clone --depth 1 --branch "$BLACKHOLE_TAG" \
  https://github.com/ExistentialAudio/BlackHole.git "$SOURCE_ROOT"

[[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$BLACKHOLE_COMMIT" ]] || {
  print -u2 "Unexpected BlackHole revision"
  exit 1
}
git -C "$SOURCE_ROOT" apply --check "$PATCH"
git -C "$SOURCE_ROOT" apply "$PATCH"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
CLANG="$(xcrun --find clang)"
mkdir -p "$OUTPUT/Contents/MacOS" "$OUTPUT/Contents/Resources"
"$CLANG" \
  -std=gnu11 \
  -Os \
  -Wno-format-extra-args \
  -DDEBUG=0 \
  -DkNumber_Of_Channels=2 \
  -arch "$(uname -m)" \
  -isysroot "$SDK_PATH" \
  -mmacosx-version-min=13.0 \
  -bundle \
  -framework CoreAudio \
  -framework CoreFoundation \
  -framework Accelerate \
  "$SOURCE_ROOT/BlackHole/BlackHole.c" \
  -o "$OUTPUT/Contents/MacOS/$PRODUCT_NAME"

cp "$SOURCE_ROOT/BlackHole/BlackHole.plist" "$OUTPUT/Contents/Info.plist"
cp "$SOURCE_ROOT/LICENSE" "$OUTPUT/Contents/Resources/LICENSE-BlackHole.txt"
plutil -replace CFBundleExecutable -string "$PRODUCT_NAME" "$OUTPUT/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$OUTPUT/Contents/Info.plist"
plutil -replace CFBundleName -string "$PRODUCT_NAME" "$OUTPUT/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$BLACKHOLE_VERSION" "$OUTPUT/Contents/Info.plist"
/usr/bin/strip -S "$OUTPUT/Contents/MacOS/$PRODUCT_NAME"
codesign --force --deep --sign - --timestamp=none "$OUTPUT"

[[ "$(plutil -extract CFBundleIdentifier raw "$OUTPUT/Contents/Info.plist")" == "$BUNDLE_ID" ]]
codesign --verify --deep --strict "$OUTPUT"
strings -a "$OUTPUT/Contents/MacOS/$PRODUCT_NAME" | grep -Fq "Codyboard Virtual Microphone"
strings -a "$OUTPUT/Contents/MacOS/$PRODUCT_NAME" | grep -Fq "CodyboardVirtualMicrophone%ich_UID"

print "Built: $OUTPUT"

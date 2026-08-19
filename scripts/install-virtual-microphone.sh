#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
SOURCE="$ROOT/.build/CodyboardVirtualMicrophone.driver"
TARGET="/Library/Audio/Plug-Ins/HAL/CodyboardVirtualMicrophone.driver"
BUNDLE_ID="com.codyboard.VirtualMicrophone"

[[ -d "$SOURCE" ]] || {
  print -u2 "Build the driver first: pnpm build:virtual-mic"
  exit 1
}
[[ "$(plutil -extract CFBundleIdentifier raw "$SOURCE/Contents/Info.plist")" == "$BUNDLE_ID" ]]
codesign --verify --deep --strict "$SOURCE"

case "$TARGET" in
  /Library/Audio/Plug-Ins/HAL/CodyboardVirtualMicrophone.driver) ;;
  *) print -u2 "Refusing unexpected install target: $TARGET"; exit 1 ;;
esac

sudo rm -rf -- "$TARGET"
sudo ditto --norsrc --noextattr --noqtn --noacl "$SOURCE" "$TARGET"
sudo chown -R root:wheel "$TARGET"
sudo killall coreaudiod

print "Installed: Codyboard Virtual Microphone"

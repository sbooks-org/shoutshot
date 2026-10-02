#!/bin/sh
# Copyright (C) 2026 Simplebooks Foundation
# Copyright (C) 2026 Josh Rodd
# SPDX-License-Identifier: MIT-0
# Builds the Safari wrapper app, installs it to /Applications (NO_INSTALL=1 to
# skip) and writes dist/Shoutshot-safari.zip.
# The Xcode project references ../extension directly, so just re-run this after editing the extension.
#
# Signs with the development team set in the Xcode project, so Safari keeps the
# extension enabled. ADHOC=1 signs ad-hoc instead (no Apple ID needed, but then
# Safari only shows it while Developer → "Allow unsigned extensions" is on).
set -e
cd "$(dirname "$0")/.."
if [ -z "$DEVELOPER_DIR" ] && ! xcrun --find xcodebuild >/dev/null 2>&1; then
  for x in /Applications/Xcode.app /Applications/Xcode-beta.app; do
    [ -d "$x" ] && export DEVELOPER_DIR="$x/Contents/Developer" && break
  done
fi
if [ "$ADHOC" = 1 ]; then
  set -- CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=""
else
  set -- -allowProvisioningUpdates
fi
# "Any Mac" destination → universal binary (arm64 + x86_64), macOS 12 or later.
xcodebuild -project safari/Shoutshot/Shoutshot.xcodeproj -scheme Shoutshot -configuration Release \
  -destination 'generic/platform=macOS' -derivedDataPath safari/build "$@" build -quiet
BUILT=safari/build/Build/Products/Release/Shoutshot.app
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

# Every Shoutshot.app macOS knows about shows up as a separate entry in
# Safari's extension list, so make sure only the one in /Applications counts.
unregister() {
  pluginkit -r "$1/Contents/PlugIns/Shoutshot Extension.appex" 2>/dev/null || true
  "$LSREG" -u "$1" 2>/dev/null || true
}

mkdir -p dist
rm -f dist/Shoutshot-safari.zip
(cd "$(dirname "$BUILT")" && ditto -c -k --keepParent Shoutshot.app "$OLDPWD/dist/Shoutshot-safari.zip")
zip -qj dist/Shoutshot-safari.zip LICENSE
unregister "$BUILT"

if [ "$NO_INSTALL" != 1 ]; then
  osascript -e 'tell application "Shoutshot" to quit' >/dev/null 2>&1 || true
  sleep 1 # let it finish quitting, or the open below fails with -609
  rm -rf /Applications/Shoutshot.app
  cp -R "$BUILT" /Applications/
  open -g /Applications/Shoutshot.app # registers the extension with Safari
  echo "Installed /Applications/Shoutshot.app"
fi
rm -rf "$BUILT" # so macOS can't rediscover it as another copy
echo "Wrote dist/Shoutshot-safari.zip"

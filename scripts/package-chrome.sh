#!/bin/sh
# Copyright (C) 2026 Simplebooks Foundation
# Copyright (C) 2026 Josh Rodd
# SPDX-License-Identifier: MIT-0
# Zips the extension for sharing with Chrome/Brave/Edge users → dist/Shoutshot-chrome.zip
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/Shoutshot-chrome.zip
(cd extension && zip -qr ../dist/Shoutshot-chrome.zip . -x '.*')
zip -qj dist/Shoutshot-chrome.zip LICENSE
echo "Wrote dist/Shoutshot-chrome.zip"

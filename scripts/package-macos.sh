#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'macOS is required to build this installer.\n' >&2
  exit 1
fi

cd "$(dirname "$0")/.."
APPLE_SIGNING_IDENTITY='-' npm run tauri -- build --bundles app

version=$(node -p "require('./src-tauri/tauri.conf.json').version")
architecture=$(uname -m)
output="src-tauri/target/release/bundle/pkg/My Neighbor Pomodoro_${version}_${architecture}.pkg"
mkdir -p src-tauri/target/release/bundle/pkg
pkgbuild \
  --component 'src-tauri/target/release/bundle/macos/My Neighbor Pomodoro.app' \
  --install-location /Applications \
  --identifier com.pomodorovibe.desktop.pkg \
  --version "$version" \
  "$output"

printf 'Installer: %s\n' "$output"

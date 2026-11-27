#!/usr/bin/env bash
# Records docs/media/demo.gif: npm install, the tiny script in scripts/demo/pay.mjs,
# and its run in mock mode. Mock mode needs no keys and makes no network call,
# and the install is the packed package, offline. No gateway host is reached.
#
# Needs node, npm, rsvg-convert (librsvg), ffmpeg and the JetBrains Mono NL font (JetBrainsMonoNL Nerd Font Mono).
#
#   scripts/demo/record.sh
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"
for tool in rsvg-convert ffmpeg; do
  command -v "$tool" >/dev/null || { echo "$tool is not on PATH" >&2; exit 1; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

npm run build >/dev/null
tarball="$work/$(npm pack --silent --ignore-scripts --pack-destination "$work")"
mkdir "$work/app"
echo '{"name":"shop","private":true,"type":"module"}' >"$work/app/package.json"
cp scripts/demo/pay.mjs "$work/app/pay.mjs"

node scripts/demo/render.mjs "$work/app" "$tarball" docs/media/demo.gif
ls -l docs/media/demo.gif

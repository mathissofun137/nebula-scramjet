#!/usr/bin/env bash
# Downloads Scramjet + controller runtime into this repo (same layout as x8rr/scramjet-templates).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

V="${SCRAMJET_VERSION:-2.0.67-alpha.1}"
echo "Fetching Scramjet $V ..."

mkdir -p scramjet controller

# From x8rr/scramjet-templates (already matching layout)
BASE="https://cdn.jsdelivr.net/gh/x8rr/scramjet-templates@main/templates/html/${V}"

curl -fsSL "$BASE/scramjet/scramjet.js" -o scramjet/scramjet.js
curl -fsSL "$BASE/scramjet/scramjet.wasm" -o scramjet/scramjet.wasm
curl -fsSL "$BASE/controller/controller.api.js" -o controller/controller.api.js
curl -fsSL "$BASE/controller/controller.inject.js" -o controller/controller.inject.js
curl -fsSL "$BASE/controller/controller.sw.js" -o controller/controller.sw.js
curl -fsSL "$BASE/controller/controller-external.mjs" -o controller/controller-external.mjs

# Ensure relative paths in SW (already relative in our tree)
echo "Done. Files:"
ls -la scramjet/ controller/

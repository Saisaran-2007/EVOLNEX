#!/usr/bin/env bash
# Runs backend unit tests (no database or server needed).
# Tests are bundled with esbuild (which honours the tsconfig path aliases)
# and executed with Node's built-in test runner.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

for file in backend/tests/*.test.ts; do
  npx esbuild "$file" --bundle --platform=node --format=cjs --log-level=warning \
    --outfile="$OUT/$(basename "${file%.ts}").cjs"
done

node --test "$OUT"/*.test.cjs

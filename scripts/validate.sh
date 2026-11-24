#!/usr/bin/env bash
# EVOLNEX validation: typegen + typecheck + production build.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> next typegen"
npx next typegen

echo "==> tsc --noEmit"
npm exec tsc -- --noEmit --pretty false

echo "==> next build"
npm run build

echo "OK: validation passed."

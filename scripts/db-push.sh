#!/usr/bin/env bash
# Apply the Drizzle schema to PostgreSQL (additive; never resets data).
set -euo pipefail
cd "$(dirname "$0")/.."
npx drizzle-kit push --config drizzle.config.json

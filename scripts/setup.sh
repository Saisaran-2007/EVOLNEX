#!/usr/bin/env bash
# EVOLNEX local setup: install deps, push schema, start dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
npm install

echo "==> Pushing database schema (backend/db/schema.ts)"
npx drizzle-kit push --config drizzle.config.json

echo "==> Starting dev server (http://localhost:3000)"
npm run dev

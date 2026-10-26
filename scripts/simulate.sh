#!/usr/bin/env bash
# Bundles scripts/simulate-launch.ts for Node and runs it (mainnet simulation only, nothing is sent).
set -e
cd "$(dirname "$0")/.."
node_modules/.bin/esbuild scripts/simulate-launch.ts --bundle --platform=node --format=esm --target=node20 \
  --outfile=.cache/simulate-launch.mjs --log-level=warning \
  --banner:js="import{createRequire as __cr}from'module';import{fileURLToPath as __fu}from'url';import{dirname as __dn}from'path';const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);"
node .cache/simulate-launch.mjs "$@"

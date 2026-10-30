#!/usr/bin/env bash
set -euo pipefail

packproof_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
packproof_toolchain="$packproof_root/.local/toolchain"
packproof_bin="$packproof_toolchain/node_modules/.bin"

if [[ ! -x "$packproof_bin/node" || ! -x "$packproof_bin/pnpm" ]] ||
   [[ "$("$packproof_bin/node" --version)" != 'v24.22.2' ]] ||
   [[ "$("$packproof_bin/pnpm" --version)" != '12.16.1' ]]; then
  command -v npm >/dev/null || { echo 'npm is required to bootstrap the pinned toolchain.' >&2; exit 1; }
  mkdir -p "$packproof_toolchain"
  npm install --prefix "$packproof_toolchain" --no-package-lock --no-audit --no-fund --save-exact node@24.22.2 pnpm@12.16.1
fi

export PATH="$packproof_bin:$PATH"
[[ "$(node --version)" == 'v24.22.2' ]]
[[ "$(pnpm --version)" == '12.16.1' ]]
echo 'Ready: Node 24.22.2 and pnpm 12.16.1 installed under .local/toolchain.'
echo 'Run this in your current terminal before project commands:'
echo 'export PATH="$PWD/.local/toolchain/node_modules/.bin:$PATH"'

#!/bin/bash
# xterm.js fork build script (Linux/macOS)
# Compiles addon-webgl bundle for nshell to consume via `file:` dependency.
#
# Accepts the standard build-all.sh args (-a/-t/-o/-c) for compatibility, but
# only --clean is meaningful — xterm.js is pure JS/TS, no arch/toolchain/output
# directory concerns.

set -e

CLEAN=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        -a|--arch) shift 2 ;;       # ignored: JS is platform-independent
        -t|--toolchain) shift 2 ;;  # ignored: no native compile
        -o|--output) shift 2 ;;     # ignored: artifacts stay in lib/, consumed via file: dep
        -c|--clean) CLEAN=1; shift ;;
        *) shift ;;                  # tolerate unknown args from build-all
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Tool checks
# ---------------------------------------------------------------------------
if ! command -v npm > /dev/null 2>&1; then
    echo "[xterm.js] ERROR: npm not found in PATH"
    exit 1
fi

NODE_VERSION="$(node --version 2>/dev/null || echo unknown)"
NPM_VERSION="$(npm --version 2>/dev/null || echo unknown)"
echo "[xterm.js] Tool versions: node=$NODE_VERSION, npm=$NPM_VERSION"

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------
if [[ $CLEAN -eq 1 ]]; then
    echo "[xterm.js] Cleaning build artifacts..."
    rm -rf node_modules
    rm -rf out
    # Per-addon outputs (tsc → out/, webpack → lib/)
    for addon in addons/*/; do
        rm -rf "${addon}out" "${addon}lib"
    done
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
if [[ ! -d "node_modules" ]]; then
    echo "[xterm.js] Running npm install (this can take ~10+ minutes)..."
    npm install
fi

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
echo "[xterm.js] Compiling TypeScript (tsc -b)..."
npm run build

echo "[xterm.js] Bundling ESM artifacts (esbuild → lib/*.mjs for all packages)..."
# Required so addon-webgl's package.json:module → lib/addon-webgl.mjs resolves.
# Vite/Rollup prefer the `module` field; without this step they fail with
# "Failed to resolve entry for package @xterm/addon-webgl".
npm run esbuild-package

echo "[xterm.js] Bundling addon-webgl (webpack → lib/addon-webgl.js for UMD/CJS consumers)..."
npm run package -w @xterm/addon-webgl

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
ADDON_LIB="addons/addon-webgl/lib/addon-webgl.js"
if [[ ! -f "$ADDON_LIB" ]]; then
    echo "[xterm.js] ERROR: expected output not produced: $ADDON_LIB"
    exit 1
fi

echo "[xterm.js] Build artifacts:"
ls -la "$ADDON_LIB" "$ADDON_LIB.map" 2>/dev/null
echo "[xterm.js] Done. nshell's file: dep on @xterm/addon-webgl will pick up this build on next npm install."

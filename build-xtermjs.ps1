#!/usr/bin/env pwsh
# xterm.js fork build script (Windows)
# Compiles addon-webgl bundle for nshell to consume via `file:` dependency.
#
# Accepts the standard build-all.ps1 args for compatibility (Arch/BuildType/
# OutputDir/ToolchainRoot), but only -Clean is meaningful — xterm.js is pure
# JS/TS so arch/toolchain/output don't apply.

param(
    [Alias("a")] [string]$Arch = "x86_64",       # ignored
    [Alias("t")] [string]$ToolchainRoot = "",    # ignored
    [Alias("o")] [string]$OutputDir = "",        # ignored
    [string]$BuildType = "Release",              # ignored
    [Alias("c")] [switch]$Clean
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
Push-Location $scriptDir

try {
    # -----------------------------------------------------------------------
    # Tool checks
    # -----------------------------------------------------------------------
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Error "[xterm.js] npm not found in PATH"
        exit 1
    }

    $nodeVersion = (& node --version 2>$null)
    $npmVersion = (& npm --version 2>$null)
    Write-Host "[xterm.js] Tool versions: node=$nodeVersion, npm=$npmVersion"

    # -----------------------------------------------------------------------
    # Clean
    # -----------------------------------------------------------------------
    if ($Clean) {
        Write-Host "[xterm.js] Cleaning build artifacts..."
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue node_modules
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue out
        Get-ChildItem -Path addons -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $_.FullName "out")
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $_.FullName "lib")
        }
    }

    # -----------------------------------------------------------------------
    # Install
    # -----------------------------------------------------------------------
    # A bare Test-Path check is not enough: an interrupted install can leave
    # node_modules present but nearly empty. `npm run tsc` would then fall back
    # to a globally installed tsc (TS 7+ drops baseUrl/downlevelIteration and
    # breaks these tsconfigs). Require the packages the build actually uses.
    $requiredPackages = @(
        "node_modules/typescript/package.json",
        "node_modules/.bin/tsc",
        "node_modules/@types/node/package.json",
        "node_modules/@types/mocha/package.json",
        "node_modules/esbuild/package.json"
    )
    $needsInstall = -not (Test-Path "node_modules")
    if (-not $needsInstall) {
        foreach ($pkg in $requiredPackages) {
            if (-not (Test-Path $pkg)) { $needsInstall = $true; break }
        }
    }
    if ($needsInstall) {
        Write-Host "[xterm.js] Running npm install (this can take ~10+ minutes)..."
        # node-pty (demo/integration tests only) needs a local C++ toolchain and
        # Windows SDK. Building the addon bundles does not. If the full install
        # fails, retry without lifecycle scripts so the JS build can proceed.
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[xterm.js] npm install failed; retrying with --ignore-scripts"
            Write-Host "[xterm.js] (node-pty/demo native bits will be unavailable, build artifacts are unaffected)"
            npm install --ignore-scripts
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    }

    # Guard against a broken/partial node_modules silently falling back to a
    # globally installed tsc. The tsconfigs in this fork target TypeScript 5.x;
    # TS 6/7 removed baseUrl, downlevelIteration and moduleResolution=node, which
    # produces a wall of TS5102/TS5108/TS2688 errors that look unrelated.
    $localTscVersion = ""
    if (Test-Path "node_modules/typescript/package.json") {
        $localTscVersion = (& node -p "require('typescript/package.json').version" 2>$null)
    }
    if (-not $localTscVersion -or -not (Test-Path "node_modules/.bin/tsc")) {
        Write-Host "[xterm.js] ERROR: local TypeScript not found under node_modules."
        Write-Host "[xterm.js] Run 'npm install --ignore-scripts' in $scriptDir and retry."
        exit 1
    }
    if (-not $localTscVersion.StartsWith("5.")) {
        Write-Host "[xterm.js] ERROR: unsupported TypeScript $localTscVersion (expected 5.x)."
        Write-Host "[xterm.js] This fork's tsconfigs use baseUrl/downlevelIteration, which TS 6+ removed."
        Write-Host "[xterm.js] Run 'npm install --ignore-scripts' in $scriptDir to restore the pinned 5.5."
        exit 1
    }
    Write-Host "[xterm.js] Local TypeScript: $localTscVersion"

    # -----------------------------------------------------------------------
    # Stamp version with current commit SHA
    # -----------------------------------------------------------------------
    # Re-stamp BEFORE the build so every package.json (root + addons) carries
    # the current commit. Downstream consumers (nshell via `file:` dep) use
    # this version string as npm's cache key — without a unique stamp,
    # repeated builds at the same base version don't invalidate nshell's
    # node_modules copy.
    Write-Host "[xterm.js] Stamping package.json versions with current git SHA..."
    node "$scriptDir/scripts/stamp-version.cjs"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # -----------------------------------------------------------------------
    # Build
    # -----------------------------------------------------------------------
    Write-Host "[xterm.js] Compiling TypeScript (tsc -b)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "[xterm.js] Bundling ESM artifacts (esbuild -> lib/*.mjs for all packages)..."
    # Required so addon-webgl's package.json:module -> lib/addon-webgl.mjs resolves.
    # Vite/Rollup prefer the `module` field; without this step they fail with
    # "Failed to resolve entry for package @xterm/addon-webgl".
    npm run esbuild-package
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "[xterm.js] Bundling addon-webgl (webpack -> lib/addon-webgl.js for UMD/CJS consumers)..."
    npm run package -w @xterm/addon-webgl
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # -----------------------------------------------------------------------
    # Verify
    # -----------------------------------------------------------------------
    $addonLib = "addons/addon-webgl/lib/addon-webgl.js"
    if (-not (Test-Path $addonLib)) {
        Write-Error "[xterm.js] expected output not produced: $addonLib"
        exit 1
    }

    Write-Host "[xterm.js] Build artifacts:"
    Get-ChildItem $addonLib, "$addonLib.map" -ErrorAction SilentlyContinue
    Write-Host "[xterm.js] Done. nshell's file: dep on @xterm/addon-webgl will pick up this build on next npm install."
}
finally {
    Pop-Location
}

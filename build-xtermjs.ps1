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
    if (-not (Test-Path "node_modules")) {
        Write-Host "[xterm.js] Running npm install (this can take ~10+ minutes)..."
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

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

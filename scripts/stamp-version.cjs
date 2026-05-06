#!/usr/bin/env node
/*
 * stamp-version.cjs — write the current git short SHA into package.json versions
 *
 * Why: when nshell consumes this fork via `file:` deps, npm caches resolution by
 * version string. If two builds carry the same version (e.g. 6.0.0), npm will
 * keep the old artifacts in nshell/node_modules even after we rebuild here. By
 * suffixing every commit with a `-canvas-bg.<sha7>` pre-release identifier the
 * version becomes unique per commit and npm always re-resolves.
 *
 * The script is idempotent: if a version already carries a `-canvas-bg.<old-sha>`
 * suffix, it is stripped back to base before re-stamping with the current SHA.
 *
 * Targets:
 *   - <fork>/package.json                  (root, @xterm/xterm)
 *   - <fork>/addons/<each>/package.json    (addon-webgl, addon-fit, etc.)
 *
 * Run as part of build-xtermjs.sh BEFORE `npm run build` so all artifacts
 * (lib/xterm.mjs, addons/<each>/lib/...) inherit the stamped version.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const STAMP_TAG = 'canvas-bg';
const STAMP_RE = new RegExp(`-${STAMP_TAG}\\..*$`);

const FORK_ROOT = path.resolve(__dirname, '..');

function gitShortSha() {
  return execSync('git rev-parse --short=7 HEAD', { cwd: FORK_ROOT, encoding: 'utf8' }).trim();
}

function stampOne(pkgPath, sha) {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  if (!pkg.version) {
    console.warn(`[stamp-version] skipping ${pkgPath} - no version field`);
    return;
  }
  const base = String(pkg.version).replace(STAMP_RE, '');
  const next = `${base}-${STAMP_TAG}.${sha}`;
  if (pkg.version === next) {
    console.log(`[stamp-version] ${path.relative(FORK_ROOT, pkgPath)}: already at ${next}`);
    return;
  }
  pkg.version = next;
  const trailing = raw.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing);
  console.log(`[stamp-version] ${path.relative(FORK_ROOT, pkgPath)}: ${base} -> ${next}`);
}

function main() {
  const sha = gitShortSha();
  const targets = [path.join(FORK_ROOT, 'package.json')];

  const addonsDir = path.join(FORK_ROOT, 'addons');
  if (fs.existsSync(addonsDir)) {
    for (const entry of fs.readdirSync(addonsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const addonPkg = path.join(addonsDir, entry.name, 'package.json');
      if (fs.existsSync(addonPkg)) targets.push(addonPkg);
    }
  }

  for (const t of targets) stampOne(t, sha);
  console.log(`[stamp-version] done at SHA ${sha} (${targets.length} files)`);
}

main();

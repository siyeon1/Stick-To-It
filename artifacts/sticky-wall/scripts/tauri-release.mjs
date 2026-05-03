#!/usr/bin/env node
// Stage D one-shot Windows release pipeline.
//
// Runs from the `@workspace/sticky-wall` package root via `pnpm run
// tauri:release`. On success the bundle dir contains the three files
// that get uploaded to a GitHub Release verbatim:
//
//   1. Sticky Wall_<version>_x64-setup.exe
//   2. Sticky Wall_<version>_x64-setup.exe.sig
//   3. latest.json   (written by build-latest-json.mjs, top of cwd)
//
// Steps:
//   1. Sanity-check `TAURI_SIGNING_PRIVATE_KEY` is set (loud, early
//      failure — `tauri build` would otherwise produce a `.exe` with
//      no `.sig` next to it and the updater would silently reject it
//      forever).
//   2. `pnpm build`              — Vite production build into ../dist/public.
//   3. `tauri build --target x86_64-pc-windows-msvc` — NSIS installer
//      + .sig (because `bundle.createUpdaterArtifacts = true`).
//   4. `node scripts/build-latest-json.mjs` — emit `latest.json` next
//      to the installer using the version from tauri.conf.json.
//
// Required env:
//   TAURI_SIGNING_PRIVATE_KEY            (Ed25519 private key contents)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD   (password used at generate time)
//
// Optional CLI args (forwarded to build-latest-json.mjs):
//   --owner <github-owner>   default: "TODO-OWNER"
//   --repo  <github-repo>    default: "TODO-REPO"
//   --notes "<release notes>"   default: ""

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);

function fail(msg) {
  process.stderr.write(`\ntauri:release: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  process.stdout.write(`\n> ${cmd} ${args.join(" ")}\n`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: pkgRoot,
    shell: process.platform === "win32",
    ...opts,
  });
  if (res.status !== 0) {
    fail(`step failed: ${cmd} ${args.join(" ")} (exit ${res.status})`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

// 1. Signing-key gate.
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY is not set.\n" +
      "  PowerShell:\n" +
      "    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw sticky-wall.key\n" +
      '    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"\n' +
      "  Without it `tauri build` produces an unsigned installer that\n" +
      "  the updater will reject — refusing to continue.",
  );
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  process.stderr.write(
    "tauri:release: TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set.\n" +
      "  If your key has no password this is fine. If it does, set the\n" +
      "  env var or `tauri build` will hang waiting for stdin.\n",
  );
}

// Read the canonical version once from tauri.conf.json so the manifest
// matches the bundle filename byte-for-byte.
const tauriConfPath = join(pkgRoot, "src-tauri", "tauri.conf.json");
if (!existsSync(tauriConfPath)) fail(`missing ${tauriConfPath}`);
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
const version = tauriConf.version;
if (!version) fail("tauri.conf.json has no `version` field");

// Enforce the bump-both-versions ritual from the Stage D spec:
// `src-tauri/tauri.conf.json` and `artifacts/sticky-wall/package.json`
// MUST match. If they drift, the workspace package version (which the
// monorepo + any future publish tooling reads) lies about what the
// desktop bundle actually shipped. Hard-fail before any build runs so
// the mistake is caught in <1 second instead of after a 10-minute
// Rust compile.
const pkgJsonPath = join(pkgRoot, "package.json");
if (!existsSync(pkgJsonPath)) fail(`missing ${pkgJsonPath}`);
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
if (pkgJson.version !== version) {
  fail(
    `version mismatch — refusing to build.\n` +
      `  src-tauri/tauri.conf.json    version: ${version}\n` +
      `  artifacts/sticky-wall/package.json version: ${pkgJson.version}\n` +
      `  Bump BOTH to the same value before running tauri:release.`,
  );
}

// Cargo.toml is a third file that must also be aligned (cargo reads
// it for the binary metadata). Best-effort check — non-fatal if the
// regex misses, since `tauri build` will still error loudly on a
// genuine mismatch, but a fast pre-flight is friendlier.
const cargoTomlPath = join(pkgRoot, "src-tauri", "Cargo.toml");
if (existsSync(cargoTomlPath)) {
  const cargoToml = readFileSync(cargoTomlPath, "utf8");
  const m = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m);
  if (m && m[1] !== version) {
    fail(
      `version mismatch — refusing to build.\n` +
        `  src-tauri/tauri.conf.json version: ${version}\n` +
        `  src-tauri/Cargo.toml      version: ${m[1]}\n` +
        `  Bump Cargo.toml to ${version} as well (see DESKTOP.md "bump-both-versions ritual").`,
    );
  }
}

const owner = args.owner ?? "TODO-OWNER";
const repo = args.repo ?? "TODO-REPO";
const notes = args.notes ?? "";

process.stdout.write(
  `tauri:release: building Sticky Wall v${version} for windows-x86_64\n` +
    `  owner/repo for download URL: ${owner}/${repo}\n`,
);

// 2. Frontend build.
run("pnpm", ["run", "build"]);

// 3. Native build (NSIS + updater .sig).
run("pnpm", [
  "exec",
  "tauri",
  "build",
  "--target",
  "x86_64-pc-windows-msvc",
]);

// 4. Manifest.
const bundleDir = join(
  pkgRoot,
  "src-tauri",
  "target",
  "x86_64-pc-windows-msvc",
  "release",
  "bundle",
  "nsis",
);
const outPath = join(bundleDir, "latest.json");

run("node", [
  join(here, "build-latest-json.mjs"),
  "--bundle-dir",
  bundleDir,
  "--version",
  version,
  "--owner",
  owner,
  "--repo",
  repo,
  "--notes",
  notes,
  "--out",
  outPath,
]);

process.stdout.write(
  `\ntauri:release: done.\n` +
    `  Upload these three files to the GitHub Release tagged v${version}:\n` +
    `    1. ${join(bundleDir, `Sticky Wall_${version}_x64-setup.exe`)}\n` +
    `    2. ${join(bundleDir, `Sticky Wall_${version}_x64-setup.exe.sig`)}\n` +
    `    3. ${outPath}\n`,
);

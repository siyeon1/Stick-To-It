#!/usr/bin/env node
// Stage C release helper: emit the v2-format `latest.json` manifest
// that the Tauri updater fetches from
// `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`.
//
// Inputs (read from the Tauri bundle output dir):
//   * `Sticky Wall_<version>_x64-setup.exe`        — NSIS installer
//   * `Sticky Wall_<version>_x64-setup.exe.sig`    — minisign sig
//                                                    produced by
//                                                    `tauri build`
//                                                    when the signing
//                                                    env vars are set
//
// Output: a JSON file with shape:
//   {
//     "version": "0.0.2",
//     "notes": "...",
//     "pub_date": "2026-05-03T10:00:00Z",
//     "platforms": {
//       "windows-x86_64": {
//         "signature": "<contents of .sig file>",
//         "url": "https://github.com/<owner>/<repo>/releases/download/v0.0.2/Sticky Wall_0.0.2_x64-setup.exe"
//       }
//     }
//   }
//
// Usage:
//   node scripts/build-latest-json.mjs \
//     --bundle-dir src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis \
//     --version 0.0.2 \
//     --owner siyeonkang \
//     --repo sticky-wall \
//     --notes "Bug fixes." \
//     --out latest.json
//
// `--owner` / `--repo` build the canonical
// `releases/download/v<version>/<file>` URL. The actual upload to that
// release happens out-of-band (GitHub UI, `gh release upload`, etc.)
// per the Stage D release ritual; this script only emits the manifest.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

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

function fail(msg) {
  process.stderr.write(`build-latest-json: ${msg}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv);

const bundleDir = args["bundle-dir"];
const version = args.version;
const owner = args.owner;
const repo = args.repo;
const notes = args.notes ?? "";
const outPath = args.out ?? "latest.json";

if (!bundleDir) fail("missing --bundle-dir");
if (!version) fail("missing --version");
if (!owner) fail("missing --owner");
if (!repo) fail("missing --repo");

// Tauri's NSIS bundle filename includes a literal space in the product
// name. Match the exact Stage D bundle name so the URL we publish is
// identical to what `gh release upload` will put up.
const installerName = `Sticky Wall_${version}_x64-setup.exe`;
const sigName = `${installerName}.sig`;
const installerPath = join(bundleDir, installerName);
const sigPath = join(bundleDir, sigName);

if (!existsSync(installerPath)) fail(`installer not found: ${installerPath}`);
if (!existsSync(sigPath)) {
  fail(
    `signature not found: ${sigPath}\n` +
      `  -> did you set TAURI_SIGNING_PRIVATE_KEY (and password) before \`tauri build\`?`,
  );
}

const signature = readFileSync(sigPath, "utf8").trim();
if (!signature) fail(`signature file is empty: ${sigPath}`);

// GitHub URL-encodes the space; the updater plugin handles either, but
// percent-encoding is the canonical form on `github.com` release URLs.
const urlSafeName = encodeURIComponent(installerName);
const downloadUrl = `https://github.com/${owner}/${repo}/releases/download/v${version}/${urlSafeName}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: downloadUrl,
    },
  },
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write(
  `wrote ${outPath} for ${basename(installerName)} (windows-x86_64)\n`,
);

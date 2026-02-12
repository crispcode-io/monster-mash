#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sourceDir = path.join(repoRoot, "data", "austin");
const targetDir = path.join(repoRoot, "apps", "web", "public", "data", "austin");
const files = ["atlas-manifest-v0.json", "species-starter-40.json", "bootstrap-summary.md"];

async function main() {
  await fs.mkdir(targetDir, { recursive: true });
  for (const filename of files) {
    await fs.copyFile(path.join(sourceDir, filename), path.join(targetDir, filename));
  }
  process.stdout.write(`Synced ${files.length} files to ${targetDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

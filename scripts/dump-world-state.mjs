#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const urlArg = readArg(args, "--url");
const outArg = readArg(args, "--out");

const sourceUrl = urlArg ?? "http://localhost:8787/debug/state";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = resolve(outArg ?? `data/debug/world-state-${timestamp}.json`);

const response = await fetch(sourceUrl);
if (!response.ok) {
  console.error(`Failed to fetch debug state (${response.status} ${response.statusText}) from ${sourceUrl}`);
  process.exit(1);
}

const payload = await response.json();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const summary = {
  worldSeed: payload?.snapshot?.worldSeed ?? "unknown",
  tick: payload?.snapshot?.tick ?? 0,
  players: Object.keys(payload?.snapshot?.players ?? {}).length,
  blockDeltas: Array.isArray(payload?.blockDeltas) ? payload.blockDeltas.length : 0,
  storyBeats: Array.isArray(payload?.directiveState?.storyBeats) ? payload.directiveState.storyBeats.length : 0,
  spawnHints: Array.isArray(payload?.directiveState?.spawnHints) ? payload.directiveState.spawnHints.length : 0,
};

console.log(`Wrote world state snapshot to ${outputPath}`);
console.log(JSON.stringify(summary, null, 2));

function readArg(values, key) {
  const index = values.findIndex((value) => value === key);
  if (index < 0) {
    return null;
  }
  return values[index + 1] ?? null;
}

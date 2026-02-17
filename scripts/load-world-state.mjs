#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const urlArg = readArg(args, "--url");
const fileArg = readArg(args, "--file");

const targetUrl = urlArg ?? "http://localhost:8787/debug/load-state";
const inputPath = fileArg ? resolve(fileArg) : await resolveLatestCapturePath();

if (!inputPath) {
  console.error("No world state capture found. Pass --file <path> or create one with `pnpm game:dump-state`.");
  process.exit(1);
}

let payload = "";
try {
  payload = await readFile(inputPath, "utf8");
} catch (error) {
  console.error(`Failed to read ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

let response;
try {
  response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: payload,
  });
} catch (error) {
  console.error(`Failed to connect to ${targetUrl}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const bodyText = await response.text();
let ack = null;
try {
  ack = JSON.parse(bodyText);
} catch {
  ack = { raw: bodyText };
}

if (!response.ok) {
  console.error(`Failed to load state (${response.status} ${response.statusText}) to ${targetUrl}`);
  console.error(JSON.stringify(ack, null, 2));
  process.exit(1);
}

console.log(`Loaded world state from ${inputPath} -> ${targetUrl}`);
console.log(JSON.stringify(ack, null, 2));

function readArg(values, key) {
  const index = values.findIndex((value) => value === key);
  if (index < 0) {
    return null;
  }
  return values[index + 1] ?? null;
}

async function resolveLatestCapturePath() {
  const captureDir = resolve("data/debug");
  let entries = [];
  try {
    entries = await readdir(captureDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const captures = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("world-state-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  if (captures.length === 0) {
    return null;
  }
  return resolve(captureDir, captures[0]);
}

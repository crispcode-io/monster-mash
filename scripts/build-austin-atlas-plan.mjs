#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data", "austin");

async function main() {
  const starterPath = path.join(dataDir, "species-starter-40.json");
  const raw = await fs.readFile(starterPath, "utf-8");
  const starter = JSON.parse(raw);
  const selected = starter.species.slice(0, 12);
  const generatedAt = new Date().toISOString();

  const atlasManifest = {
    version: 1,
    atlasId: "austin-v0",
    generatedAt,
    frameSize: { width: 32, height: 32 },
    requiredAnimations: [
      "idle",
      "walk",
      "attack",
      "sleep",
      "faint",
      "hurt",
      "jump",
      "run",
    ],
    animationFrameTargets: {
      idle: 4,
      walk: 6,
      attack: 6,
      sleep: 2,
      faint: 2,
      hurt: 2,
      jump: 3,
      run: 6,
    },
    mons: selected.map((item) => ({
      monId: `austin-${item.taxonId}`,
      taxonId: item.taxonId,
      commonName: item.commonName,
      scientificName: item.scientificName,
      iconicTaxon: item.iconicTaxon,
      sourceObservations: item.observations,
      spriteSheetPath: `/atlas/austin-v0/mons/${item.taxonId}.png`,
      metadataPath: `/atlas/austin-v0/mons/${item.taxonId}.json`,
    })),
  };

  const promptQueue = selected.map((item) => ({
    monId: `austin-${item.taxonId}`,
    taxonId: item.taxonId,
    commonName: item.commonName,
    scientificName: item.scientificName,
    stylePrompt:
      "Top-down retro handheld pixel sprite, 32x32 frame grid, crisp outlines, readable silhouette, no text.",
    anatomyPrompt: `Species reference: ${item.scientificName}${item.commonName ? ` (${item.commonName})` : ""}. Keep proportions inspired by species but stylized as a friendly monster.`,
    animationPrompt:
      "Generate animations: idle(4), walk(6), attack(6), sleep(2), faint(2), hurt(2), jump(3), run(6). Keep consistent palette and silhouette across frames.",
    outputSpec:
      "Output transparent PNG sprite sheet and JSON frame map grouped by animation. Frame size 32x32.",
  }));

  await fs.writeFile(
    path.join(dataDir, "atlas-manifest-v0.json"),
    JSON.stringify(atlasManifest, null, 2) + "\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(dataDir, "atlas-generation-queue-v0.json"),
    JSON.stringify(
      {
        generatedAt,
        count: promptQueue.length,
        queue: promptQueue,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  process.stdout.write(
    [
      "Austin atlas plan generated.",
      `- manifest: ${path.join(dataDir, "atlas-manifest-v0.json")}`,
      `- queue: ${path.join(dataDir, "atlas-generation-queue-v0.json")}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "data", "austin");

const USER_AGENT = "monster-mash-prototype/0.1 (local bootstrap data fetch)";
const AUSTIN_CENTER = { lat: 30.2672, lon: -97.7431 };
const PROTOTYPE_RADIUS_KM = 35;

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const location = await fetchAustinLocation();
  const prototypeBounds = buildPrototypeBounds(location);
  const mapData = await fetchAustinMapFeatures(prototypeBounds);
  const speciesData = await fetchAustinSpecies();
  const starterSpecies = buildStarterSpecies(speciesData);

  const generatedAt = new Date().toISOString();

  await writeJson("location.json", {
    generatedAt,
    source: "OpenStreetMap Nominatim",
    location,
    prototypeBounds,
  });

  await writeJson("map-features.geojson", {
    type: "FeatureCollection",
    generatedAt,
    source: "OpenStreetMap Overpass",
    bounds: prototypeBounds,
    features: mapData.features,
    stats: mapData.stats,
  });

  await writeJson("species-top200.json", {
    generatedAt,
    source: "iNaturalist species_counts",
    center: AUSTIN_CENTER,
    radiusKm: PROTOTYPE_RADIUS_KM,
    totalResults: speciesData.totalResults,
    species: speciesData.species,
    iconicTaxaCounts: speciesData.iconicTaxaCounts,
  });

  await writeJson("species-starter-40.json", {
    generatedAt,
    source: "Derived from species-top200.json",
    targetCount: 40,
    species: starterSpecies,
  });

  await fs.writeFile(
    path.join(outputDir, "bootstrap-summary.md"),
    renderSummary({
      generatedAt,
      location,
      prototypeBounds,
      mapStats: mapData.stats,
      speciesTotal: speciesData.totalResults,
      iconicTaxaCounts: speciesData.iconicTaxaCounts,
      starterSpecies,
    }),
    "utf-8",
  );

  process.stdout.write(
    [
      "Austin bootstrap complete.",
      `- location: ${path.join(outputDir, "location.json")}`,
      `- map: ${path.join(outputDir, "map-features.geojson")}`,
      `- species: ${path.join(outputDir, "species-top200.json")}`,
      `- starter: ${path.join(outputDir, "species-starter-40.json")}`,
      `- summary: ${path.join(outputDir, "bootstrap-summary.md")}`,
    ].join("\n") + "\n",
  );
}

async function fetchAustinLocation() {
  const url =
    "https://nominatim.openstreetmap.org/search?q=Austin%2C%20Texas%2C%20United%20States&format=jsonv2&limit=1&polygon_geojson=1";
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("Nominatim returned no Austin results.");
  }

  const entry = payload[0];
  return {
    displayName: entry.display_name,
    lat: Number(entry.lat),
    lon: Number(entry.lon),
    boundingBox: entry.boundingbox?.map((value) => Number(value)) ?? null,
    osmType: entry.osm_type,
    osmId: entry.osm_id,
    geojsonType: entry.geojson?.type ?? null,
  };
}

function buildPrototypeBounds(location) {
  const lat = Number.isFinite(location.lat) ? location.lat : AUSTIN_CENTER.lat;
  const lon = Number.isFinite(location.lon) ? location.lon : AUSTIN_CENTER.lon;

  const latDelta = 0.13;
  const lonDelta = 0.16;

  return {
    south: lat - latDelta,
    west: lon - lonDelta,
    north: lat + latDelta,
    east: lon + lonDelta,
  };
}

async function fetchAustinMapFeatures(bounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const overpassQuery = `
[out:json][timeout:80];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
  way["leisure"="park"](${bbox});
  way["landuse"="forest"](${bbox});
);
out tags geom;
`.trim();

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    body: overpassQuery,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status}`);
  }

  const payload = await response.json();
  const features = [];
  const stats = {
    road: 0,
    water: 0,
    park: 0,
    forest: 0,
  };

  const maxPerCategory = 1_500;

  for (const element of payload.elements ?? []) {
    if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 2) {
      continue;
    }

    const category = classifyMapFeature(element.tags ?? {});
    if (!category) {
      continue;
    }

    if (stats[category] >= maxPerCategory) {
      continue;
    }

    const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
    const closed = isClosedRing(coordinates);
    const geometry =
      closed && category !== "road"
        ? { type: "Polygon", coordinates: [coordinates] }
        : { type: "LineString", coordinates };

    features.push({
      type: "Feature",
      properties: {
        category,
        osmId: element.id,
        tags: element.tags ?? {},
      },
      geometry,
    });

    stats[category] += 1;
  }

  return { features, stats };
}

function classifyMapFeature(tags) {
  if (tags.highway) {
    return "road";
  }
  if (tags.waterway || tags.natural === "water") {
    return "water";
  }
  if (tags.leisure === "park") {
    return "park";
  }
  if (tags.landuse === "forest") {
    return "forest";
  }
  return null;
}

function isClosedRing(coordinates) {
  if (coordinates.length < 4) {
    return false;
  }
  const [startLon, startLat] = coordinates[0];
  const [endLon, endLat] = coordinates[coordinates.length - 1];
  return startLon === endLon && startLat === endLat;
}

async function fetchAustinSpecies() {
  const species = [];
  const iconicTaxaCounts = {};
  let page = 1;
  const perPage = 200;
  let totalResults = 0;

  while (page <= 2) {
    const url = new URL("https://api.inaturalist.org/v1/observations/species_counts");
    url.searchParams.set("lat", String(AUSTIN_CENTER.lat));
    url.searchParams.set("lng", String(AUSTIN_CENTER.lon));
    url.searchParams.set("radius", String(PROTOTYPE_RADIUS_KM));
    url.searchParams.set("quality_grade", "research");
    url.searchParams.set("order_by", "observations_count");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`iNaturalist request failed: ${response.status}`);
    }

    const payload = await response.json();
    totalResults = payload.total_results ?? totalResults;

    for (const row of payload.results ?? []) {
      if (row.taxon?.rank !== "species") {
        continue;
      }

      const iconic = row.taxon?.iconic_taxon_name ?? "Unknown";
      iconicTaxaCounts[iconic] = (iconicTaxaCounts[iconic] ?? 0) + 1;

      species.push({
        observations: row.count,
        taxonId: row.taxon.id,
        scientificName: row.taxon.name,
        commonName: row.taxon.preferred_common_name ?? null,
        iconicTaxon: iconic,
        wikipediaUrl: row.taxon.wikipedia_url ?? null,
      });
    }

    if (!payload.results?.length || payload.results.length < perPage) {
      break;
    }

    page += 1;
  }

  return {
    totalResults,
    species,
    iconicTaxaCounts,
  };
}

function buildStarterSpecies(speciesData) {
  const byTaxon = new Map();
  for (const row of speciesData.species) {
    if (!byTaxon.has(row.iconicTaxon)) {
      byTaxon.set(row.iconicTaxon, []);
    }
    byTaxon.get(row.iconicTaxon).push(row);
  }

  const iconicPriority = ["Mammalia", "Aves", "Reptilia", "Amphibia", "Actinopterygii", "Insecta", "Plantae"];
  const selected = [];

  for (const iconic of iconicPriority) {
    const rows = byTaxon.get(iconic) ?? [];
    for (const row of rows.slice(0, 5)) {
      selected.push(row);
    }
  }

  const used = new Set(selected.map((row) => row.taxonId));
  const sorted = [...speciesData.species].sort((a, b) => b.observations - a.observations);
  for (const row of sorted) {
    if (selected.length >= 40) {
      break;
    }
    if (used.has(row.taxonId)) {
      continue;
    }
    selected.push(row);
    used.add(row.taxonId);
  }

  return selected.slice(0, 40);
}

function renderSummary(input) {
  const topFive = input.starterSpecies.slice(0, 5).map((row) => {
    const name = row.commonName ?? row.scientificName;
    return `- ${name} (${row.scientificName}) — ${row.observations} observations`;
  });

  return `# Austin Bootstrap Summary

- Generated at: ${input.generatedAt}
- Location: ${input.location.displayName}
- Prototype bounds:
  - south: ${input.prototypeBounds.south}
  - west: ${input.prototypeBounds.west}
  - north: ${input.prototypeBounds.north}
  - east: ${input.prototypeBounds.east}

## Map Feature Counts

- roads: ${input.mapStats.road}
- water: ${input.mapStats.water}
- parks: ${input.mapStats.park}
- forest: ${input.mapStats.forest}

## Species Pull

- Total species results reported: ${input.speciesTotal}
- Species records fetched: ${input.iconicTaxaCounts ? Object.values(input.iconicTaxaCounts).reduce((a, b) => a + b, 0) : 0}
- Starter roster size: ${input.starterSpecies.length}

### Starter Top 5

${topFive.join("\n")}
`;
}

async function writeJson(filename, payload) {
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

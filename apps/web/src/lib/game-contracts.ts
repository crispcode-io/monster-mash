export type Gender = "female" | "male" | "nonbinary";
export type Archetype = "tracker" | "keeper" | "scholar";

export interface PlayerProfile {
  id: string;
  name: string;
  gender: Gender;
  archetype: Archetype;
  createdAt: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface WorldConfig {
  worldSeed: string;
  compressionFactor: number;
  chunkSize: number;
  activeChunkRadius: number;
  startLocation: GeoPoint;
  traversalSpeedGameMps: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

export const WORLD_CONFIG: WorldConfig = {
  worldSeed: "austin-prototype-v1",
  compressionFactor: 30,
  chunkSize: 64,
  activeChunkRadius: 2,
  startLocation: { lat: 30.2672, lon: -97.7431 },
  traversalSpeedGameMps: 2,
};

export function worldToLatLon(x: number, z: number, config = WORLD_CONFIG): GeoPoint {
  const origin = config.startLocation;
  const originLatRad = toRadians(origin.lat);
  const realEastMeters = x * config.compressionFactor;
  const realNorthMeters = z * config.compressionFactor;

  const lat = origin.lat + toDegrees(realNorthMeters / EARTH_RADIUS_METERS);
  const lon =
    origin.lon +
    toDegrees(realEastMeters / (EARTH_RADIUS_METERS * Math.cos(originLatRad)));

  return { lat, lon };
}

export function latLonToWorld(lat: number, lon: number, config = WORLD_CONFIG): { x: number; z: number } {
  const origin = config.startLocation;
  const originLatRad = toRadians(origin.lat);
  const northMeters = toRadians(lat - origin.lat) * EARTH_RADIUS_METERS;
  const eastMeters =
    toRadians(lon - origin.lon) * EARTH_RADIUS_METERS * Math.cos(originLatRad);

  return {
    x: eastMeters / config.compressionFactor,
    z: northMeters / config.compressionFactor,
  };
}

export function estimateTravelHours(distanceKm: number, config = WORLD_CONFIG): number {
  const gameMeters = (distanceKm * 1_000) / config.compressionFactor;
  return gameMeters / config.traversalSpeedGameMps / 3_600;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

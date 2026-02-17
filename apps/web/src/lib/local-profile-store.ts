import {
  BodyType,
  CameraMode,
  CharacterClass,
  CharacterOrigin,
  FaceStyle,
  Gender,
  HairStyle,
  PlayerProfile,
  WorldInstance,
} from "@/lib/game-contracts";

const STORAGE_KEY = "monster-mash.player-profile.v1";
const PROFILE_EVENT = "monster-mash:profile-changed";
const LEGACY_PROFILE_ID = "legacy-profile";

const DEFAULT_ORIGIN: CharacterOrigin = "greenhollow";
const DEFAULT_CLASS: CharacterClass = "warden";
const DEFAULT_CAMERA_MODE: CameraMode = "third-person";
const DEFAULT_BODY_TYPE: BodyType = "athletic";
const DEFAULT_FACE_STYLE: FaceStyle = "wanderer";
const DEFAULT_HAIR_STYLE: HairStyle = "windswept";
const DEFAULT_ACCENT_COLOR = "#4f8f63";
const DEFAULT_WORLD: WorldInstance = {
  id: "world-austin-prototype-v1",
  seed: "austin-prototype-v1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

type ProfileListener = () => void;

export function subscribeProfileStore(listener: ProfileListener): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) {
      listener();
    }
  };

  const onCustom = (): void => {
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(PROFILE_EVENT, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PROFILE_EVENT, onCustom);
  };
}

export function getProfileSnapshot(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY);
}

export function parsePlayerProfile(raw: string | null): PlayerProfile | null {
  if (!raw) {
    return null;
  }

  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadPlayerProfile(): PlayerProfile | null {
  return parsePlayerProfile(getProfileSnapshot());
}

export function savePlayerProfile(profile: PlayerProfile): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

export function clearPlayerProfile(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

function normalizeProfile(payload: unknown): PlayerProfile | null {
  if (!isRecord(payload)) {
    return null;
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return null;
  }

  return {
    id: typeof payload.id === "string" && payload.id ? payload.id : LEGACY_PROFILE_ID,
    name,
    gender: normalizeGender(payload.gender),
    characterClass: normalizeClass(payload.characterClass, payload.archetype),
    origin: normalizeOrigin(payload.origin),
    appearance: {
      bodyType: normalizeBodyType(isRecord(payload.appearance) ? payload.appearance.bodyType : undefined),
      faceStyle: normalizeFaceStyle(isRecord(payload.appearance) ? payload.appearance.faceStyle : undefined),
      hairStyle: normalizeHairStyle(isRecord(payload.appearance) ? payload.appearance.hairStyle : undefined),
      accentColor:
        isRecord(payload.appearance) && typeof payload.appearance.accentColor === "string"
          ? payload.appearance.accentColor
          : DEFAULT_ACCENT_COLOR,
    },
    preferredCamera: normalizeCameraMode(payload.preferredCamera),
    world: normalizeWorld(payload.world, payload.createdAt),
    createdAt:
      typeof payload.createdAt === "string" && payload.createdAt
        ? payload.createdAt
        : "2026-01-01T00:00:00.000Z",
  };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function normalizeGender(value: unknown): Gender {
  return value === "female" || value === "male" || value === "nonbinary" ? value : "female";
}

function normalizeClass(value: unknown, legacyArchetype: unknown): CharacterClass {
  if (value === "warden" || value === "ranger" || value === "arcanist") {
    return value;
  }

  if (legacyArchetype === "tracker") {
    return "ranger";
  }

  if (legacyArchetype === "scholar") {
    return "arcanist";
  }

  return DEFAULT_CLASS;
}

function normalizeOrigin(value: unknown): CharacterOrigin {
  return value === "greenhollow" || value === "emberridge" || value === "stormhaven"
    ? value
    : DEFAULT_ORIGIN;
}

function normalizeBodyType(value: unknown): BodyType {
  return value === "lean" || value === "athletic" || value === "sturdy" ? value : DEFAULT_BODY_TYPE;
}

function normalizeFaceStyle(value: unknown): FaceStyle {
  return value === "veteran" || value === "noble" || value === "wanderer" ? value : DEFAULT_FACE_STYLE;
}

function normalizeHairStyle(value: unknown): HairStyle {
  return value === "braided" || value === "cropped" || value === "windswept"
    ? value
    : DEFAULT_HAIR_STYLE;
}

function normalizeCameraMode(value: unknown): CameraMode {
  return value === "first-person" || value === "third-person" ? value : DEFAULT_CAMERA_MODE;
}

function normalizeWorld(value: unknown, createdAtRaw: unknown): WorldInstance {
  const createdAt =
    typeof createdAtRaw === "string" && createdAtRaw ? createdAtRaw : DEFAULT_WORLD.createdAt;

  if (!isRecord(value)) {
    return {
      ...DEFAULT_WORLD,
      createdAt,
    };
  }

  const seed =
    typeof value.seed === "string" && value.seed.trim().length > 0
      ? value.seed.trim()
      : DEFAULT_WORLD.seed;

  const id =
    typeof value.id === "string" && value.id.trim().length > 0
      ? value.id.trim()
      : `world-${seed}`;

  const worldCreatedAt =
    typeof value.createdAt === "string" && value.createdAt.trim().length > 0
      ? value.createdAt.trim()
      : createdAt;

  return {
    id,
    seed,
    createdAt: worldCreatedAt,
  };
}

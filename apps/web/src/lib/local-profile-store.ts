import { PlayerProfile } from "@/lib/game-contracts";

const STORAGE_KEY = "monster-mash.player-profile.v1";
const PROFILE_EVENT = "monster-mash:profile-changed";

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
    return JSON.parse(raw) as PlayerProfile;
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

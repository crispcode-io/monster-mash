"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import {
  clearPlayerProfile,
  getProfileSnapshot,
  parsePlayerProfile,
  subscribeProfileStore,
} from "@/lib/local-profile-store";
import { WorldCanvas } from "@/components/WorldCanvas";

export function WorldScreen() {
  const profileSnapshot = useSyncExternalStore(
    subscribeProfileStore,
    getProfileSnapshot,
    () => null,
  );
  const profile = useMemo(() => parsePlayerProfile(profileSnapshot), [profileSnapshot]);

  if (!profile) {
    return (
      <main className="screen">
        <section className="panel dex-shell">
          <h1>No character found.</h1>
          <p className="muted">Create your profile before entering the mon field.</p>
          <div className="action-row">
            <Link className="button button-primary" href="/start">
              Create Profile
            </Link>
            <Link className="button button-secondary" href="/">
              Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="world-screen">
      <header className="world-header dex-shell">
        <div>
          <p className="eyebrow">Field Session</p>
          <h1>{profile.name}</h1>
          <p className="muted">
            {profile.characterClass} · {profile.gender} · {profile.origin}
          </p>
          <p className="muted">World: {profile.world.seed}</p>
        </div>
        <div className="action-row">
          <button
            className="button button-secondary"
            onClick={() => {
              clearPlayerProfile();
              window.location.assign("/");
            }}
          >
            Reset Save
          </button>
          <Link className="button button-secondary" href="/">
            Home
          </Link>
        </div>
      </header>

      <WorldCanvas profile={profile} />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import {
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
      <WorldCanvas profile={profile} />
    </main>
  );
}

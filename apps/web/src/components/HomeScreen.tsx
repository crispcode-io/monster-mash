"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { estimateTravelHours, WORLD_CONFIG } from "@/lib/game-contracts";
import { getProfileSnapshot, subscribeProfileStore } from "@/lib/local-profile-store";

export function HomeScreen() {
  const profileSnapshot = useSyncExternalStore(subscribeProfileStore, getProfileSnapshot, () => null);
  const hasProfile = profileSnapshot !== null;

  return (
    <main className="screen">
      <section className="panel hero-panel dex-shell">
        <p className="eyebrow">Mon Index Prototype</p>
        <h1>Auto-battle mons in a real-world-scale map.</h1>
        <p className="muted">
          Prototype focus: onboarding flow + deterministic world simulation with chunk loading.
        </p>
        <div className="dex-row">
          <span>LOCAL ENTRY</span>
          <strong>AUSTIN-001</strong>
        </div>
        <div className="dex-row">
          <span>INDEX TERM</span>
          <strong>MONS</strong>
        </div>
        <div className="action-row">
          <Link className="button button-primary" href="/start">
            New Save
          </Link>
          {hasProfile ? (
            <Link className="button button-secondary" href="/world">
              Continue
            </Link>
          ) : null}
        </div>
      </section>

      <section className="panel detail-panel dex-shell">
        <h2>Field Notes</h2>
        <ul>
          <li>World coordinates anchor to Austin ({WORLD_CONFIG.startLocation.lat}, {WORLD_CONFIG.startLocation.lon}).</li>
          <li>Traversal compression is {WORLD_CONFIG.compressionFactor}x for playable travel time.</li>
          <li>Austin to Los Angeles estimate: {estimateTravelHours(1960).toFixed(1)} in-game hours.</li>
          <li>Chunked world generation is deterministic by world seed + chunk coordinate.</li>
        </ul>
      </section>
    </main>
  );
}

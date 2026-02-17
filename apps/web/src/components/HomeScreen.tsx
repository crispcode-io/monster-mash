"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { estimateTravelHours, WORLD_CONFIG } from "@/lib/game-contracts";
import {
  getProfileSnapshot,
  parsePlayerProfile,
  subscribeProfileStore,
} from "@/lib/local-profile-store";

export function HomeScreen() {
  const profileSnapshot = useSyncExternalStore(subscribeProfileStore, getProfileSnapshot, () => null);
  const profile = useMemo(() => parsePlayerProfile(profileSnapshot), [profileSnapshot]);
  const hasProfile = profile !== null;
  const seedLabel = profile?.world.seed ?? WORLD_CONFIG.worldSeed;

  return (
    <main className="screen">
      <section className="panel hero-panel dex-shell">
        <p className="eyebrow">Monster Mash Frontier</p>
        <h1>First-person / third-person adventure MMO prototype.</h1>
        <p className="muted">
          Enter a torchlit valley, create a character, and roam a deterministic chunked world.
        </p>
        <div className="dex-row">
          <span>WORLD SEED</span>
          <strong>{seedLabel}</strong>
        </div>
        <div className="dex-row">
          <span>GEN MODE</span>
          <strong>HYBRID 2D+3D</strong>
        </div>
        <div className="action-row">
          <Link className="button button-primary" href="/start">
            Begin Journey
          </Link>
          {hasProfile ? (
            <Link className="button button-secondary" href="/world">
              Continue
            </Link>
          ) : null}
        </div>
      </section>

      <section className="panel detail-panel dex-shell">
        <h2>Prototype Notes</h2>
        <ul>
          <li>Play flow: start screen, gender select, character creator, then world entry.</li>
          <li>World coordinates anchor to Austin ({WORLD_CONFIG.startLocation.lat}, {WORLD_CONFIG.startLocation.lon}).</li>
          <li>Traversal compression is {WORLD_CONFIG.compressionFactor}x for faster play loops.</li>
          <li>Austin to Los Angeles estimate: {estimateTravelHours(1960).toFixed(1)} in-game hours.</li>
          <li>Chunked world generation is deterministic by world seed + chunk coordinate.</li>
        </ul>
      </section>
    </main>
  );
}

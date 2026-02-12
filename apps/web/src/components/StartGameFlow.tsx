"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Archetype, Gender, PlayerProfile } from "@/lib/game-contracts";
import { savePlayerProfile } from "@/lib/local-profile-store";

const archetypes: { key: Archetype; name: string; description: string }[] = [
  { key: "tracker", name: "Tracker", description: "Faster overworld traversal and scouting." },
  { key: "keeper", name: "Keeper", description: "Higher mon bond and habitat efficiency." },
  { key: "scholar", name: "Scholar", description: "Better data readouts and discovery bonuses." },
];

const genders: { key: Gender; label: string }[] = [
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "nonbinary", label: "Non-binary" },
];

export function StartGameFlow() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [archetype, setArchetype] = useState<Archetype>("tracker");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const profile: PlayerProfile = {
      id: createProfileId(),
      name: trimmedName,
      gender,
      archetype,
      createdAt: new Date().toISOString(),
    };

    savePlayerProfile(profile);
    router.push("/world");
  }

  return (
    <main className="screen">
      <section className="panel form-panel dex-shell">
        <p className="eyebrow">Start Game</p>
        <h1>Create your field profile.</h1>

        <form onSubmit={onSubmit} className="form-grid">
          <label className="field-label" htmlFor="player-name">
            Character Name
          </label>
          <input
            id="player-name"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={24}
            placeholder="Enter a name"
            required
          />

          <div className="section-label">Gender</div>
          <div className="option-row">
            {genders.map((entry) => (
              <label key={entry.key} className="radio-chip">
                <input
                  type="radio"
                  name="gender"
                  value={entry.key}
                  checked={gender === entry.key}
                  onChange={() => setGender(entry.key)}
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </div>

          <div className="section-label">Role</div>
          <div className="archetype-grid">
            {archetypes.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`archetype-card ${archetype === entry.key ? "active" : ""}`}
                onClick={() => setArchetype(entry.key)}
              >
                <strong>{entry.name}</strong>
                <span>{entry.description}</span>
              </button>
            ))}
          </div>

          <div className="action-row">
            <button className="button button-primary" type="submit">
              Enter Field
            </button>
            <Link className="button button-secondary" href="/">
              Back
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `player-${Date.now()}`;
}

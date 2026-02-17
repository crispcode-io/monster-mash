"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  BodyType,
  CameraMode,
  CharacterClass,
  CharacterOrigin,
  FaceStyle,
  Gender,
  HairStyle,
  PlayerProfile,
} from "@/lib/game-contracts";
import { savePlayerProfile } from "@/lib/local-profile-store";
import { createWorldInstance } from "@/lib/world/world-instance";

type FlowStep = "welcome" | "gender" | "character";

const classOptions: { key: CharacterClass; name: string; description: string }[] = [
  { key: "warden", name: "Warden", description: "Heavy frontline fighter with shield-based control." },
  { key: "ranger", name: "Ranger", description: "Fast pathfinder with bows, traps, and scouting boosts." },
  { key: "arcanist", name: "Arcanist", description: "Spell-focused caster with utility and burst damage." },
];

const originOptions: { key: CharacterOrigin; name: string; bonus: string }[] = [
  { key: "greenhollow", name: "Greenhollow", bonus: "Nature attunement and forage bonus." },
  { key: "emberridge", name: "Emberridge", bonus: "Crafting speed and fire resistance." },
  { key: "stormhaven", name: "Stormhaven", bonus: "Exploration and traversal momentum." },
];

const genders: { key: Gender; label: string }[] = [
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "nonbinary", label: "Non-binary" },
];

const bodyTypeOptions: { key: BodyType; label: string }[] = [
  { key: "lean", label: "Lean" },
  { key: "athletic", label: "Athletic" },
  { key: "sturdy", label: "Sturdy" },
];

const faceOptions: { key: FaceStyle; label: string }[] = [
  { key: "veteran", label: "Veteran" },
  { key: "noble", label: "Noble" },
  { key: "wanderer", label: "Wanderer" },
];

const hairOptions: { key: HairStyle; label: string }[] = [
  { key: "braided", label: "Braided" },
  { key: "cropped", label: "Cropped" },
  { key: "windswept", label: "Windswept" },
];

const cameraOptions: { key: CameraMode; label: string; detail: string }[] = [
  { key: "third-person", label: "Third Person", detail: "Best for exploration and combat readability." },
  { key: "first-person", label: "First Person", detail: "Immersive view for high-presence adventure." },
];

export function StartGameFlow() {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>("welcome");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [characterClass, setCharacterClass] = useState<CharacterClass>("warden");
  const [origin, setOrigin] = useState<CharacterOrigin>("greenhollow");
  const [bodyType, setBodyType] = useState<BodyType>("athletic");
  const [faceStyle, setFaceStyle] = useState<FaceStyle>("wanderer");
  const [hairStyle, setHairStyle] = useState<HairStyle>("windswept");
  const [preferredCamera, setPreferredCamera] = useState<CameraMode>("third-person");

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
      characterClass,
      origin,
      appearance: {
        bodyType,
        faceStyle,
        hairStyle,
        accentColor: resolveAccentColor(origin),
      },
      preferredCamera,
      world: createWorldInstance(trimmedName),
      createdAt: new Date().toISOString(),
    };

    savePlayerProfile(profile);
    router.push("/world");
  }

  return (
    <main className="screen">
      <section className="panel form-panel dex-shell">
        <p className="eyebrow">Adventure Setup</p>
        <h1>Forge your hero before entering the valley.</h1>
        <ol className="flow-progress">
          <li className={step === "welcome" ? "active" : ""}>Start</li>
          <li className={step === "gender" ? "active" : ""}>Gender</li>
          <li className={step === "character" ? "active" : ""}>Character</li>
        </ol>

        {step === "welcome" ? (
          <div className="step-shell">
            <p className="muted">
              Torchlit roads lead to a living frontier. Build a character, choose your camera style,
              and enter a persistent world tuned for MMO-scale systems.
            </p>
            <div className="action-row">
              <button className="button button-primary" type="button" onClick={() => setStep("gender")}>
                Start Adventure
              </button>
              <Link className="button button-secondary" href="/">
                Back
              </Link>
            </div>
          </div>
        ) : null}

        {step === "gender" ? (
          <div className="step-shell">
            <div className="section-label">Select Gender</div>
            <div className="option-row">
              {genders.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`choice-chip ${gender === entry.key ? "active" : ""}`}
                  onClick={() => setGender(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button className="button button-primary" type="button" onClick={() => setStep("character")}>
                Continue
              </button>
              <button className="button button-secondary" type="button" onClick={() => setStep("welcome")}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        {step === "character" ? (
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

            <div className="section-label">Class</div>
            <div className="archetype-grid">
              {classOptions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`archetype-card ${characterClass === entry.key ? "active" : ""}`}
                  onClick={() => setCharacterClass(entry.key)}
                >
                  <strong>{entry.name}</strong>
                  <span>{entry.description}</span>
                </button>
              ))}
            </div>

            <div className="section-label">Origin</div>
            <div className="archetype-grid">
              {originOptions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`archetype-card ${origin === entry.key ? "active" : ""}`}
                  onClick={() => setOrigin(entry.key)}
                >
                  <strong>{entry.name}</strong>
                  <span>{entry.bonus}</span>
                </button>
              ))}
            </div>

            <div className="section-label">Appearance</div>
            <div className="option-grid">
              <OptionGroup<BodyType>
                label="Body"
                options={bodyTypeOptions}
                value={bodyType}
                onChange={setBodyType}
              />
              <OptionGroup<FaceStyle>
                label="Face"
                options={faceOptions}
                value={faceStyle}
                onChange={setFaceStyle}
              />
              <OptionGroup<HairStyle>
                label="Hair"
                options={hairOptions}
                value={hairStyle}
                onChange={setHairStyle}
              />
            </div>

            <div className="section-label">Camera Preference</div>
            <div className="archetype-grid">
              {cameraOptions.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`archetype-card ${preferredCamera === entry.key ? "active" : ""}`}
                  onClick={() => setPreferredCamera(entry.key)}
                >
                  <strong>{entry.label}</strong>
                  <span>{entry.detail}</span>
                </button>
              ))}
            </div>

            <div className="action-row">
              <button className="button button-primary" type="submit">
                Enter World
              </button>
              <button className="button button-secondary" type="button" onClick={() => setStep("gender")}>
                Back
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

interface OptionGroupProps<T extends string> {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function OptionGroup<T extends string>({ label, options, value, onChange }: OptionGroupProps<T>) {
  return (
    <div className="option-column">
      <div className="field-label">{label}</div>
      <div className="option-row">
        {options.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`choice-chip ${value === entry.key ? "active" : ""}`}
            onClick={() => onChange(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function createProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `player-${Date.now()}`;
}

function resolveAccentColor(origin: CharacterOrigin): string {
  if (origin === "emberridge") {
    return "#b5542a";
  }

  if (origin === "stormhaven") {
    return "#3569bb";
  }

  return "#4f8f63";
}

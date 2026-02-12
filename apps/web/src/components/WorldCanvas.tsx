"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PlayerProfile, WORLD_CONFIG, worldToLatLon } from "@/lib/game-contracts";
import {
  CHUNK_GRID_CELLS,
  ChunkData,
  ChunkEntity,
  TerrainTileType,
  generateChunkData,
} from "@/lib/world/chunk-generator";

interface WorldCanvasProps {
  profile: PlayerProfile;
}

interface HudState {
  x: number;
  z: number;
  lat: number;
  lon: number;
  chunkX: number;
  chunkZ: number;
  chunkCount: number;
}

interface AtlasManifestSummary {
  atlasId: string;
  monCount: number;
}

interface SpriteTextureSet {
  playerA: THREE.CanvasTexture;
  playerB: THREE.CanvasTexture;
  npcA: THREE.CanvasTexture;
  npcB: THREE.CanvasTexture;
  monA: THREE.CanvasTexture;
  monB: THREE.CanvasTexture;
  monC: THREE.CanvasTexture;
  treeA: THREE.CanvasTexture;
  treeB: THREE.CanvasTexture;
  treeC: THREE.CanvasTexture;
}

const initialHud: HudState = {
  x: 0,
  z: 0,
  lat: WORLD_CONFIG.startLocation.lat,
  lon: WORLD_CONFIG.startLocation.lon,
  chunkX: 0,
  chunkZ: 0,
  chunkCount: 0,
};

const CAMERA_WORLD_SIZE = 24;

export function WorldCanvas({ profile }: WorldCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hud, setHud] = useState<HudState>(initialHud);
  const [atlasSummary, setAtlasSummary] = useState<AtlasManifestSummary | null>(null);
  const playerLabel = useMemo(() => profile.name, [profile.name]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/data/austin/atlas-manifest-v0.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Atlas manifest request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAtlasSummary({
          atlasId: payload.atlasId ?? "unknown",
          monCount: Array.isArray(payload.mons) ? payload.mons.length : 0,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAtlasSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#78a5de");
    scene.fog = new THREE.Fog("#78a5de", 88, 220);

    const aspect = mount.clientWidth / mount.clientHeight;
    const camera = new THREE.OrthographicCamera(
      -CAMERA_WORLD_SIZE * aspect,
      CAMERA_WORLD_SIZE * aspect,
      CAMERA_WORLD_SIZE,
      -CAMERA_WORLD_SIZE,
      0.1,
      900,
    );
    camera.position.set(0, 72, 38);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#cfdcff", 1.25));
    const sunlight = new THREE.DirectionalLight("#fff5e8", 0.62);
    sunlight.position.set(64, 140, 42);
    scene.add(sunlight);

    const worldRoot = new THREE.Group();
    scene.add(worldRoot);

    const spriteTextures = createSpriteTextureSet();
    const playerMaterial = new THREE.SpriteMaterial({ map: spriteTextures.playerA, transparent: true });
    const playerSprite = new THREE.Sprite(playerMaterial);
    playerSprite.scale.set(3.2, 3.2, 1);
    playerSprite.position.y = 1.8;
    worldRoot.add(playerSprite);

    const playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.08, 12),
      new THREE.MeshBasicMaterial({ color: "#113f5f", transparent: true, opacity: 0.35 }),
    );
    playerShadow.rotation.x = -Math.PI * 0.5;
    playerShadow.position.y = 0.04;
    worldRoot.add(playerShadow);

    const keyState = new Set<string>();
    const chunkStore = new Map<string, THREE.Group>();
    const playerPosition = new THREE.Vector3();
    const moveVector = new THREE.Vector3();
    const movementSpeed = Math.max(5.5, WORLD_CONFIG.traversalSpeedGameMps * 3);
    let activeChunkX = 0;
    let activeChunkZ = 0;
    let lastHudUpdate = 0;
    let walkClock = 0;
    let isRunning = true;
    let cachedPlayerFrame = 0;

    function chunkIndex(positionAxis: number): number {
      return Math.floor(positionAxis / WORLD_CONFIG.chunkSize);
    }

    function chunkKey(chunkX: number, chunkZ: number): string {
      return `${chunkX}:${chunkZ}`;
    }

    function disposeGroup(group: THREE.Group): void {
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
    }

    function buildChunk(chunkX: number, chunkZ: number): THREE.Group {
      const group = new THREE.Group();
      group.position.set(chunkX * WORLD_CONFIG.chunkSize, 0, chunkZ * WORLD_CONFIG.chunkSize);

      const chunkData = generateChunkData(chunkX, chunkZ);

      const groundColor = new THREE.Color().setHSL(0.31, 0.56, 0.56 + (chunkData.biomeTone * 0.08));
      const ground = new THREE.Mesh(
        makeTileGeometry(WORLD_CONFIG.chunkSize, WORLD_CONFIG.chunkSize),
        new THREE.MeshLambertMaterial({ color: groundColor }),
      );
      ground.position.y = 0;
      group.add(ground);

      addTerrainLayer(group, chunkData, "path", "#e8d18d", 0.02);
      addTerrainLayer(group, chunkData, "water", "#6aa2e8", 0.03);
      addTerrainLayer(group, chunkData, "flowers", "#d8f4b8", 0.04);

      for (const entity of chunkData.entities) {
        group.add(buildEntity(entity, spriteTextures, chunkData.tileSize));
      }

      return group;
    }

    function addTerrainLayer(
      group: THREE.Group,
      chunkData: ChunkData,
      tileType: TerrainTileType,
      color: string,
      y: number,
    ): void {
      const tiles = chunkData.terrainTiles.filter((tile) => tile.type === tileType);
      if (tiles.length === 0) {
        return;
      }

      const layer = new THREE.InstancedMesh(
        makeTileGeometry(chunkData.tileSize, chunkData.tileSize),
        new THREE.MeshLambertMaterial({ color }),
        tiles.length,
      );
      const matrix = new THREE.Matrix4();
      tiles.forEach((tile, index) => {
        matrix.makeTranslation(tile.x, y, tile.z);
        layer.setMatrixAt(index, matrix);
      });
      layer.instanceMatrix.needsUpdate = true;
      group.add(layer);
    }

    function buildEntity(
      entity: ChunkEntity,
      textures: SpriteTextureSet,
      tileSize: number,
    ): THREE.Object3D {
      if (entity.type === "fence") {
        const fence = new THREE.Mesh(
          new THREE.BoxGeometry(tileSize * 0.98, 0.6, 0.32),
          new THREE.MeshLambertMaterial({ color: "#8792ab" }),
        );
        fence.position.set(entity.x, 0.31, entity.z);
        fence.rotation.y = entity.rotation;
        return fence;
      }

      if (entity.type === "rock") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.58 * entity.scale, 0),
          new THREE.MeshLambertMaterial({ color: entity.variant === 0 ? "#766f65" : "#8a8176" }),
        );
        rock.position.set(entity.x, 0.55 * entity.scale, entity.z);
        return rock;
      }

      const spriteMap =
        entity.type === "tree"
          ? [textures.treeA, textures.treeB, textures.treeC][entity.variant % 3]
          : entity.type === "npc"
            ? [textures.npcA, textures.npcB][entity.variant % 2]
            : [textures.monA, textures.monB, textures.monC][entity.variant % 3];

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spriteMap,
          transparent: true,
          alphaTest: 0.45,
        }),
      );

      const baseScale = entity.type === "tree" ? 4.2 : entity.type === "npc" ? 2.7 : 2.2;
      sprite.scale.set(baseScale * entity.scale, baseScale * entity.scale, 1);
      sprite.position.set(entity.x, entity.type === "tree" ? 2.1 : 1.25, entity.z);
      return sprite;
    }

    function refreshChunks(): void {
      const required = new Set<string>();
      for (
        let offsetX = -WORLD_CONFIG.activeChunkRadius;
        offsetX <= WORLD_CONFIG.activeChunkRadius;
        offsetX += 1
      ) {
        for (
          let offsetZ = -WORLD_CONFIG.activeChunkRadius;
          offsetZ <= WORLD_CONFIG.activeChunkRadius;
          offsetZ += 1
        ) {
          const targetChunkX = activeChunkX + offsetX;
          const targetChunkZ = activeChunkZ + offsetZ;
          const key = chunkKey(targetChunkX, targetChunkZ);
          required.add(key);
          if (!chunkStore.has(key)) {
            const chunk = buildChunk(targetChunkX, targetChunkZ);
            chunkStore.set(key, chunk);
            worldRoot.add(chunk);
          }
        }
      }

      for (const [key, chunk] of chunkStore.entries()) {
        if (!required.has(key)) {
          worldRoot.remove(chunk);
          chunkStore.delete(key);
          disposeGroup(chunk);
        }
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      keyState.add(event.key.toLowerCase());
    }

    function onKeyUp(event: KeyboardEvent): void {
      keyState.delete(event.key.toLowerCase());
    }

    function onResize(): void {
      if (!mount) {
        return;
      }
      const nextAspect = mount.clientWidth / mount.clientHeight;
      camera.left = -CAMERA_WORLD_SIZE * nextAspect;
      camera.right = CAMERA_WORLD_SIZE * nextAspect;
      camera.top = CAMERA_WORLD_SIZE;
      camera.bottom = -CAMERA_WORLD_SIZE;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    refreshChunks();

    let previousTime = performance.now();
    function loop(timestamp: number): void {
      if (!isRunning) {
        return;
      }

      const deltaSeconds = Math.min((timestamp - previousTime) / 1000, 0.1);
      previousTime = timestamp;

      moveVector.set(0, 0, 0);
      if (keyState.has("w") || keyState.has("arrowup")) {
        moveVector.z -= 1;
      }
      if (keyState.has("s") || keyState.has("arrowdown")) {
        moveVector.z += 1;
      }
      if (keyState.has("a") || keyState.has("arrowleft")) {
        moveVector.x -= 1;
      }
      if (keyState.has("d") || keyState.has("arrowright")) {
        moveVector.x += 1;
      }

      const moving = moveVector.lengthSq() > 0;
      if (moving) {
        moveVector.normalize().multiplyScalar(movementSpeed * deltaSeconds);
        playerPosition.add(moveVector);
        walkClock += deltaSeconds;
      } else {
        walkClock = 0;
      }

      playerSprite.position.x = playerPosition.x;
      playerSprite.position.z = playerPosition.z;
      playerShadow.position.x = playerPosition.x;
      playerShadow.position.z = playerPosition.z;

      const frame = moving ? Math.floor(walkClock * 8) % 2 : 0;
      if (frame !== cachedPlayerFrame) {
        cachedPlayerFrame = frame;
        playerMaterial.map = frame === 0 ? spriteTextures.playerA : spriteTextures.playerB;
        playerMaterial.needsUpdate = true;
      }

      const nextChunkX = chunkIndex(playerPosition.x);
      const nextChunkZ = chunkIndex(playerPosition.z);
      if (nextChunkX !== activeChunkX || nextChunkZ !== activeChunkZ) {
        activeChunkX = nextChunkX;
        activeChunkZ = nextChunkZ;
        refreshChunks();
      }

      const desiredCameraX = playerPosition.x;
      const desiredCameraY = 72;
      const desiredCameraZ = playerPosition.z + 38;
      camera.position.x += (desiredCameraX - camera.position.x) * 0.09;
      camera.position.y += (desiredCameraY - camera.position.y) * 0.09;
      camera.position.z += (desiredCameraZ - camera.position.z) * 0.09;
      camera.position.x = snapToGrid(camera.position.x, 0.125);
      camera.position.z = snapToGrid(camera.position.z, 0.125);
      camera.lookAt(playerPosition.x, 0, playerPosition.z + 2);

      renderer.render(scene, camera);

      if (timestamp - lastHudUpdate > 140) {
        const geopoint = worldToLatLon(playerPosition.x, playerPosition.z);
        setHud({
          x: playerPosition.x,
          z: playerPosition.z,
          lat: geopoint.lat,
          lon: geopoint.lon,
          chunkX: activeChunkX,
          chunkZ: activeChunkZ,
          chunkCount: chunkStore.size,
        });
        lastHudUpdate = timestamp;
      }

      window.requestAnimationFrame(loop);
    }

    window.requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);

      disposeGroup(worldRoot);
      playerMaterial.dispose();
      renderer.dispose();
      disposeTextureSet(spriteTextures);
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <section className="world-container">
      <div className="world-canvas" ref={mountRef} />
      <aside className="world-hud dex-shell">
        <h2>Trainer: {playerLabel}</h2>
        <ul>
          <li>X: {hud.x.toFixed(1)}</li>
          <li>Z: {hud.z.toFixed(1)}</li>
          <li>Lat: {hud.lat.toFixed(5)}</li>
          <li>Lon: {hud.lon.toFixed(5)}</li>
          <li>
            Chunk: {hud.chunkX}, {hud.chunkZ}
          </li>
          <li>Loaded Chunks: {hud.chunkCount}</li>
          <li>Grid: {CHUNK_GRID_CELLS}x{CHUNK_GRID_CELLS} cells/chunk</li>
          {atlasSummary ? (
            <li>
              Atlas: {atlasSummary.atlasId} ({atlasSummary.monCount} mons)
            </li>
          ) : (
            <li>Atlas: not loaded</li>
          )}
        </ul>
        <p className="muted">
          Sprite mode active. Terrain + mons are deterministic by seed and chunk coordinate.
        </p>
      </aside>
    </section>
  );
}

function makeTileGeometry(width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(-Math.PI * 0.5);
  return geometry;
}

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function createSpriteTextureSet(): SpriteTextureSet {
  return {
    playerA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#d63232", "#1844ba", "#2a2a2a", 0)),
    playerB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#d63232", "#1844ba", "#2a2a2a", 1)),
    npcA: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#8c6a41", "#316b48", "#2f2f2f", 0)),
    npcB: createPixelTexture((ctx) => drawTrainerSprite(ctx, "#6c5942", "#3a4f8f", "#2f2f2f", 1)),
    monA: createPixelTexture((ctx) => drawMonSprite(ctx, "#4e7de7", "#d9ebff", "#2b3366")),
    monB: createPixelTexture((ctx) => drawMonSprite(ctx, "#f5a75a", "#fff5df", "#7a3c18")),
    monC: createPixelTexture((ctx) => drawMonSprite(ctx, "#74c46f", "#e7ffdb", "#2f5a2f")),
    treeA: createPixelTexture((ctx) => drawTreeSprite(ctx, "#3f9448", "#80cf79", "#6d4a2a")),
    treeB: createPixelTexture((ctx) => drawTreeSprite(ctx, "#2f7f52", "#63b369", "#72522f")),
    treeC: createPixelTexture((ctx) => drawTreeSprite(ctx, "#4f8d3c", "#97d673", "#805837")),
  };
}

function disposeTextureSet(textureSet: SpriteTextureSet): void {
  for (const texture of Object.values(textureSet)) {
    texture.dispose();
  }
}

function createPixelTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize canvas context for sprite texture.");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawTrainerSprite(
  ctx: CanvasRenderingContext2D,
  hatColor: string,
  bodyColor: string,
  legColor: string,
  step: 0 | 1,
): void {
  fillRect(ctx, 11, 5, 10, 4, hatColor);
  fillRect(ctx, 14, 8, 4, 3, "#f4d6b5");
  fillRect(ctx, 11, 11, 10, 7, bodyColor);
  fillRect(ctx, 10, 18, 4, 7, legColor);
  fillRect(ctx, 18, 18, 4, 7, legColor);
  if (step === 0) {
    fillRect(ctx, 10, 25, 4, 4, "#e0e0e0");
    fillRect(ctx, 18, 24, 4, 5, "#e0e0e0");
  } else {
    fillRect(ctx, 10, 24, 4, 5, "#e0e0e0");
    fillRect(ctx, 18, 25, 4, 4, "#e0e0e0");
  }
}

function drawMonSprite(
  ctx: CanvasRenderingContext2D,
  bodyColor: string,
  eyeColor: string,
  detailColor: string,
): void {
  fillRect(ctx, 9, 13, 14, 10, bodyColor);
  fillRect(ctx, 11, 10, 4, 4, bodyColor);
  fillRect(ctx, 17, 10, 4, 4, bodyColor);
  fillRect(ctx, 12, 15, 2, 2, eyeColor);
  fillRect(ctx, 18, 15, 2, 2, eyeColor);
  fillRect(ctx, 13, 20, 6, 2, detailColor);
  fillRect(ctx, 8, 23, 4, 4, detailColor);
  fillRect(ctx, 20, 23, 4, 4, detailColor);
}

function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  canopyColor: string,
  canopyHighlight: string,
  trunkColor: string,
): void {
  fillRect(ctx, 12, 20, 8, 10, trunkColor);
  fillRect(ctx, 7, 7, 18, 14, canopyColor);
  fillRect(ctx, 9, 5, 14, 6, canopyColor);
  fillRect(ctx, 9, 10, 5, 4, canopyHighlight);
  fillRect(ctx, 17, 12, 5, 4, canopyHighlight);
}

function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

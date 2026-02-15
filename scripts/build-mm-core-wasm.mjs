#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const optional = process.argv.includes("--optional");

async function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      shell: false,
    });

    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const crateDir = path.resolve("apps/mm-core-rs");
  const rustupPath = await resolveRustupPath();
  const rustcPath = rustupPath ? await rustupWhich(rustupPath, "rustc") : "";
  const toolchainCargoPath = rustcPath ? path.join(path.dirname(rustcPath), "cargo") : "";
  const preferredCargo = toolchainCargoPath || "cargo";
  const preferredEnv = rustcPath ? { RUSTC: rustcPath } : {};

  let code = await run(
    preferredCargo,
    ["build", "--release", "--target", "wasm32-unknown-unknown"],
    {
      cwd: crateDir,
      env: preferredEnv,
    },
  );

  if (code !== 0) {
    if (rustupPath) {
      await run(rustupPath, ["target", "add", "wasm32-unknown-unknown"]);
      code = await run(
        preferredCargo,
        ["build", "--release", "--target", "wasm32-unknown-unknown"],
        {
          cwd: crateDir,
          env: preferredEnv,
        },
      );
    }
  }

  if (code !== 0) {
    const message = [
      "Unable to build wasm target.",
      "Install wasm32 target (typically: `rustup target add wasm32-unknown-unknown`).",
      "If rustup is missing on Homebrew Rust, install `rustup-init` and initialize rustup.",
      "Game runtime will stay in fallback-js mode.",
    ].join(" ");
    if (optional) {
      console.warn(`[build-mm-core-wasm] ${message}`);
      return;
    }
    throw new Error(message);
  }

  const source = path.join(crateDir, "target", "wasm32-unknown-unknown", "release", "mm_core_rs.wasm");
  const destinationDir = path.resolve("apps/web/public/wasm");
  const destination = path.join(destinationDir, "mm_core_rs.wasm");
  await mkdir(destinationDir, { recursive: true });
  await copyFile(source, destination);
  console.log(`[build-mm-core-wasm] Wrote ${destination}`);
}

async function resolveRustupPath() {
  const candidates = [
    process.env.RUSTUP_BIN ?? "",
    await commandPath("rustup"),
    "/opt/homebrew/opt/rustup/bin/rustup",
    "/usr/local/opt/rustup/bin/rustup",
  ].filter(Boolean);

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runCapture(candidate, ["--version"]);
    if (result.code === 0) {
      return candidate;
    }
  }

  return "";
}

async function rustupWhich(rustupPath, tool) {
  const result = await runCapture(rustupPath, ["which", tool]);
  if (result.code !== 0) {
    return "";
  }
  return result.stdout.trim();
}

async function commandPath(command) {
  const result = await runCapture("sh", ["-lc", `command -v ${command} 2>/dev/null || true`]);
  if (result.code !== 0) {
    return "";
  }
  return result.stdout.trim();
}

async function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

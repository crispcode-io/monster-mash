#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";

const verify = process.argv.includes("--verify");

async function runOrFail(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? -1}`));
    });
  });
}

function spawnAttached(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    shell: false,
  });
}

async function main() {
  await runOrFail("node", ["./scripts/build-mm-core-wasm.mjs"]);
  await runOrFail("pnpm", ["--filter", "web", "build"]);

  if (verify) {
    await runOrFail("go", ["test", "./..."], { cwd: "apps/world-server-go" });
    await runOrFail("cargo", ["test"], { cwd: "apps/mm-core-rs" });
    await runOrFail("pnpm", ["--filter", "web", "lint"]);
    await runOrFail("pnpm", ["--filter", "web", "typecheck"]);
    await runOrFail("pnpm", ["--filter", "web", "test"]);
  }

  const serverPort = await findOpenPort(8787);
  const webPort = await findOpenPort(3100);
  console.log(`[game] World server: ws://localhost:${serverPort}/ws`);
  console.log(`[game] Web client: http://localhost:${webPort}`);

  const server = spawnAttached("go", ["run", "./cmd/world-server", "--addr", `:${serverPort}`], {
    cwd: "apps/world-server-go",
  });

  const web = spawnAttached(
    "pnpm",
    ["--filter", "web", "exec", "next", "start", "-p", String(webPort)],
    {
      env: {
        NEXT_PUBLIC_WORLD_RUNTIME_MODE: "ws",
        NEXT_PUBLIC_WORLD_RUNTIME_WS_URL: `ws://localhost:${serverPort}/ws`,
      },
    },
  );

  const shutdown = () => {
    if (!server.killed) {
      server.kill("SIGINT");
    }
    if (!web.killed) {
      web.kill("SIGINT");
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const exit = new Promise((resolve) => {
    let exited = false;
    const handleExit = (code) => {
      if (exited) {
        return;
      }
      exited = true;
      shutdown();
      resolve(code ?? 0);
    };
    server.on("exit", handleExit);
    web.on("exit", handleExit);
  });

  const code = await exit;
  process.exit(typeof code === "number" ? code : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }

  throw new Error(`Unable to find an open port near ${startPort}.`);
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

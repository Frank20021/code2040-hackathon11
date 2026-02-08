import { spawn } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

const workerPort = process.env.WRANGLER_DEV_PORT || "8787";
const workerOrigin = process.env.VITE_TTS_PROXY_TARGET || `http://127.0.0.1:${workerPort}`;
const ttsEndpoint = process.env.VITE_TTS_ENDPOINT || "/api/tts";
const frontendHost = process.env.VITE_DEV_HOST || "0.0.0.0";

let stopping = false;
const children = [];

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 1500);
}

function start() {
  console.log(`[dev:full] Starting worker on :${workerPort}`);
  console.log(`[dev:full] Frontend host: ${frontendHost}`);
  console.log(`[dev:full] Vite /api proxy target: ${workerOrigin}`);
  console.log(`[dev:full] Frontend TTS endpoint: ${ttsEndpoint}`);

  const frontend = spawn(npmCmd, ["run", "dev", "--", "--host", frontendHost], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_TTS_ENDPOINT: ttsEndpoint,
      VITE_TTS_PROXY_TARGET: workerOrigin
    }
  });

  const worker = spawn(npxCmd, ["wrangler", "dev", "--port", workerPort], {
    stdio: "inherit",
    env: process.env
  });

  children.push(frontend, worker);

  frontend.on("exit", (code) => {
    if (stopping) return;
    console.error(`[dev:full] Frontend exited (${code ?? 0}). Stopping.`);
    stopAll(code ?? 0);
  });

  worker.on("exit", (code) => {
    if (stopping) return;
    console.error(`[dev:full] Worker exited (${code ?? 0}). Stopping.`);
    stopAll(code ?? 0);
  });

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
}

start();

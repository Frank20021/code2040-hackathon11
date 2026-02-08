import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const srcDir = path.join(
  repoRoot,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm"
);

const dstDir = path.join(repoRoot, "public", "mediapipe", "wasm");

async function existsDirectory(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

if (!(await existsDirectory(srcDir))) {
  // eslint-disable-next-line no-console
  console.error(
    `MediaPipe wasm directory not found at ${srcDir}. Did you run npm install?`
  );
  process.exit(1);
}

await mkdir(dstDir, { recursive: true });

const entries = await readdir(srcDir);
const filesToCopy = entries.filter(
  (name) =>
    name.endsWith(".wasm") ||
    name.endsWith(".js") ||
    name.endsWith(".mjs") ||
    name.endsWith(".data")
);

await Promise.all(
  filesToCopy.map((name) => cp(path.join(srcDir, name), path.join(dstDir, name)))
);

// eslint-disable-next-line no-console
console.log(`Copied ${filesToCopy.length} MediaPipe wasm assets to public/mediapipe/wasm/`);

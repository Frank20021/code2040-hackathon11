#!/usr/bin/env node
/**
 * Downloads the official MediaPipe Face Landmarker .task model into
 * public/models/face_landmarker.task (required for the app to run).
 */
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { get as httpsGet } from "https";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const OUT_PATH = new URL("../public/models/face_landmarker.task", import.meta.url);

async function download() {
  await mkdir(dirname(fileURLToPath(OUT_PATH)), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = createWriteStream(fileURLToPath(OUT_PATH));
    httpsGet(MODEL_URL, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        httpsGet(res.headers.location, (r) => r.pipe(file).on("finish", resolve).on("error", reject));
        return;
      }
      res.pipe(file).on("finish", resolve).on("error", reject);
    }).on("error", reject);
  });
}

download()
  .then(() => console.log("Downloaded face_landmarker.task to public/models/"))
  .catch((err) => {
    console.error("Download failed:", err.message);
    process.exit(1);
  });

# Eye Tracking Module (Gaze Direction Tracker)

Client-only eye direction tracker built with Vite + React + TypeScript + MediaPipe FaceLandmarker. Designed to run on iPad + laptop with on-device inference (no video frames sent to a server).

**Current output classes:** `LEFT`, `RIGHT`, `CENTER` (plus `NO_FACE`, `NO_IRIS` when tracking is unavailable).

## Elder assistive focus (hackathon build)
- Full first-run onboarding flow with large text, plain language, and guided calibration.
- Elder-first interface defaults: high contrast, large touch targets, reduced-motion support.
- Guided racial-equity impact story demo (`Night-time Help Request`) with prototype metrics:
  - `timeToFirstRequestMs`
  - `selectionAttempts`
  - `recoveryPromptsShown`
  - `requestConfirmed`

## Project status (tracking)
- ✅ Live camera preview + face/iris landmarking
- ✅ Calibration flow (persisted locally)
- ✅ Smoothed gaze signal + left/right/center classification
- ✅ Optional overlay for debugging
- ✅ Full onboarding flow with local completion persistence (`eldergaze.onboarding.v1`)
- ✅ Guided impact demo flow for hackathon storytelling
- ⏳ Integration surface (exportable hook/component API)
- ⏳ Metrics & logging (FPS, dropped frames, confidence histograms)
- ⏳ Packaging (embed as widget / npm package)

## Prereqs
- Node.js + npm
- A webcam-capable browser (iPad Safari works best with the front camera)

## Setup
1. Install deps: `npm install`
2. Copy MediaPipe wasm assets into `public/` (done automatically when you run `npm run dev` or `npm run build`).
3. Download the FaceLandmarker model and place it at: `public/models/face_landmarker.task` (see `public/models/README.md`).

## Run locally
- `npm run dev`
- Open the printed URL (for iPad testing on LAN, use the `http://<your-laptop-ip>:5173` URL)
- For frontend + local Worker (`/api/tts`) together: `npm run dev:full`
  - `dev:full` now proxies `http://<vite-host>/api/*` to Wrangler (`127.0.0.1:8787`) so TTS works from LAN clients too.

## Tests
- `npm test`

## What’s in this repo
- UI entrypoint: `src/App.tsx`
- Onboarding flow + state machine: `src/features/onboarding/*`
- Impact demo + metrics reducer: `src/pages/ImpactDemo.tsx`, `src/features/impact/*`
- Camera + tracking loop: `src/components/CameraView.tsx`
- Calibration UX: `src/components/CalibrationWizard.tsx`
- Settings UX: `src/components/SettingsPanel.tsx`
- Gaze pipeline (library-style code): `src/lib/gaze/*`
- MediaPipe helpers: `src/lib/mediapipe/*`

## How the eye-tracking works (high level)
1. **Landmarks:** MediaPipe FaceLandmarker provides face + iris landmarks (client-side WASM).
2. **Feature extraction:** We compute a normalized iris position within the eye (`x`), which is robust to distance/zoom compared to pixel coordinates.
3. **Smoothing:** A short sliding window reduces jitter (see settings for window size).
4. **Calibration:** A quick flow learns a user-specific mapping from feature → gaze score and stores it locally.
5. **Classification:** The calibrated score is thresholded into `LEFT` / `CENTER` / `RIGHT` with a confidence value.

## Calibration & persistence
- Calibration is stored in local storage (so it survives refreshes and offline use).
- Profile schema lives in `src/lib/gaze/types.ts` (`CalibrationProfileV2`).

## Using the module in other code
If you want to consume the gaze output elsewhere in the app, the easiest path today is:
- Render `CameraView` and read updates via `onGazeOutput` (see `src/App.tsx` for an example).

If you want this repo to expose a cleaner “module API” (hook/component + typed events), tell me your target integration:
- “React hook (`useGazeTracker`)” vs “headless class” vs “web component”, and the output you need (left/right only, or add up/down/blinks, etc.).

## Deploy

**Option A: Cloudflare Workers (recommended — includes `/api/tts` for voice)**

1. Ensure the Face Landmarker model is present (required for build):  
   `npm run download:model`  
   (Skip if you already have `public/models/face_landmarker.task`.)
2. Build: `npm run build`
3. Log in to Cloudflare (first time only): `npx wrangler login`
4. Deploy: `npx wrangler deploy`

After deploy, Wrangler prints your live URL (e.g. `https://gaze-direction-tracker.<your-subdomain>.workers.dev`).

**Option B: Cloudflare Pages (static only, no TTS API)**

- In the Cloudflare dashboard: Pages → Create project → Connect Git (or direct upload).
- Build command: `npm run build`
- Output directory: `dist`  
  Run `npm run download:model` before building if the model is not in the repo.

---

## Cloudflare deployment (Workers Static Assets)
This project builds a static site to `dist/`. You can deploy it to Cloudflare Workers with static assets.

1. Build: `npm run build`
2. Deploy: `npx wrangler deploy`

Notes:
- Camera access requires HTTPS. Cloudflare provides HTTPS automatically.
- For SPA navigation fallback, this repo includes `wrangler.toml` with `not_found_handling = "single-page-application"`.

### TTS (Together AI + Kokoro, OpenAI/OpenRouter fallback)
`Demo` announces selections via Worker endpoint `POST /api/tts`.

Provider behavior:
- If `TOGETHER_API_KEY` is set, Worker uses Together TTS first (`/v1/audio/speech`).
- If Together fails or is not configured and `OPENAI_API_KEY` exists, Worker falls back to OpenAI TTS.
- If both Together and OpenAI fail or are not configured and `OPENROUTER_API_KEY` exists, Worker falls back to OpenRouter TTS.

Configure secrets/vars before deploy:

1. Preferred: `npx wrangler secret put TOGETHER_API_KEY`
2. Optional Together vars:
   - `TOGETHER_TTS_MODEL` (default: `hexgrad/Kokoro-82M`)
   - `TOGETHER_TTS_VOICE` (default: `af_alloy`)
   - `TOGETHER_TTS_FORMAT` (default: `wav`)
3. Optional OpenAI fallback: `npx wrangler secret put OPENAI_API_KEY`
4. Optional OpenAI vars:
   - `OPENAI_TTS_MODEL` (default: `gpt-4o-mini-tts`)
   - `OPENAI_TTS_VOICE` (default: `alloy`)
   - `OPENAI_TTS_FORMAT` (default: `mp3`)
   - `OPENAI_TRANSCRIBE_MODEL` (default: `whisper-1`)
5. Optional OpenRouter fallback: `npx wrangler secret put OPENROUTER_API_KEY`
6. Optional OpenRouter vars:
   - `OPENROUTER_TTS_MODEL` (default: `openai/gpt-audio-mini`)
   - `OPENROUTER_TTS_VOICE` (default: `alloy`)
   - `OPENROUTER_TTS_FORMAT` (default: `wav`)
   - `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` (for OpenRouter attribution headers)

Transcription (Whisper):
- Worker exposes `POST /api/transcribe` (multipart/form-data with `audio` file) and forwards to OpenAI transcription API.
- Requires `OPENAI_API_KEY`.

Notes:
- If `/api/tts` is unavailable or errors, no speech is played.
- `npm run dev:full` uses a Vite `/api` proxy by default. If you run frontend separately, set `VITE_TTS_ENDPOINT` to your API host.
- You can force provider routing from frontend with `VITE_TTS_PROVIDER=together` (or `openai` / `openrouter`).
- For OpenRouter `openai/gpt-audio-mini`, Worker uses streaming `pcm16` internally and returns `audio/wav`.

Generate and save a TTS example file:
- `npm run tts:example`
- Output: `dev-dist/tts-openrouter-example.wav` (with `openai/gpt-audio-mini`)
- Optional custom text: `npm run tts:example -- \"Your custom sentence\"`

## Cloudflare deployment (Pages)
Cloudflare Pages is usually the simplest option for a static Vite app.

- Build command: `npm run build`
- Output directory: `dist`

Offline/PWA:
- Load the app once while online so the service worker can cache the model/wasm assets, then it can run offline.

## Notes / constraints
- Camera permissions: iOS Safari requires a user gesture and works best over HTTPS.
- Lighting matters: poor lighting commonly produces `NO_IRIS`.

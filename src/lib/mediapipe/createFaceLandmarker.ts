import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const OFFICIAL_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function createFaceLandmarker() {
  // FilesetResolver appends filenames to this base; avoid trailing slash to prevent `//` URLs.
  const wasmBase = `${import.meta.env.BASE_URL}mediapipe/wasm`;
  const vision = await FilesetResolver.forVisionTasks(wasmBase);

  // Use official model URL so the app works when deployed (model is not in the repo).
  // Local file at public/models/face_landmarker.task is optional (e.g. for offline dev).
  const modelAssetPath = OFFICIAL_MODEL_URL;

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath
    },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
    runningMode: "VIDEO",
    numFaces: 3
  });
}

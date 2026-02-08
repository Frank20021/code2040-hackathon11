import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export async function createFaceLandmarker() {
  // FilesetResolver appends filenames to this base; avoid trailing slash to prevent `//` URLs.
  const wasmBase = `${import.meta.env.BASE_URL}mediapipe/wasm`;
  const vision = await FilesetResolver.forVisionTasks(wasmBase);

  const modelAssetPath = `${import.meta.env.BASE_URL}models/face_landmarker.task`;

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

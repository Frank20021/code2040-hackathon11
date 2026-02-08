import { clamp } from "./stats";
import type { CalibrationProfile, GazeDirection, GazeFeatures } from "./types";

export function classifyDirection(params: {
  features: GazeFeatures;
  calibration: CalibrationProfile;
}): { direction: GazeDirection; confidence: number } {
  const { x } = params.features;
  const { regression, deadzoneScore } = params.calibration;

  const score = regression.w * x + regression.b;
  const absScore = Math.abs(score);

  if (absScore <= deadzoneScore) {
    return { direction: "CENTER", confidence: 0.5 };
  }

  const confidence = clamp((absScore - deadzoneScore) / (1 - deadzoneScore), 0, 1);
  return { direction: score < 0 ? "LEFT" : "RIGHT", confidence };
}

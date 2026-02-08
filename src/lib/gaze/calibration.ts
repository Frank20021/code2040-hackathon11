import { clamp, mad, median } from "./stats";
import type { CalibrationProfileV2, GazeDirection, GazeFeatures } from "./types";

export type CalibrationStep = "CENTER" | "LEFT" | "RIGHT";

export type CalibrationSample = Pick<GazeFeatures, "x" | "y">;

export type CalibrationPointDef = {
  pointId: string;
  classLabel: CalibrationStep;
  label: string;
  hint: string;
  xPct: number;
  yPct: number;
};

export type ValidationPointDef = {
  pointId: string;
  expected: CalibrationStep;
  label: string;
  xPct: number;
  yPct: number;
};

export const CALIBRATION_POINTS: CalibrationPointDef[] = [
  {
    pointId: "center-mid",
    classLabel: "CENTER",
    label: "Center",
    hint: "Look at the center dot.",
    xPct: 50,
    yPct: 50
  },
  {
    pointId: "left-mid",
    classLabel: "LEFT",
    label: "Left",
    hint: "Move eyes left (not your head).",
    xPct: 18,
    yPct: 50
  },
  {
    pointId: "right-mid",
    classLabel: "RIGHT",
    label: "Right",
    hint: "Move eyes right (not your head).",
    xPct: 82,
    yPct: 50
  },
  {
    pointId: "left-top",
    classLabel: "LEFT",
    label: "Left Top",
    hint: "Look at the top-left dot.",
    xPct: 18,
    yPct: 28
  },
  {
    pointId: "center-top",
    classLabel: "CENTER",
    label: "Center Top",
    hint: "Look at the top-center dot.",
    xPct: 50,
    yPct: 28
  },
  {
    pointId: "right-top",
    classLabel: "RIGHT",
    label: "Right Top",
    hint: "Look at the top-right dot.",
    xPct: 82,
    yPct: 28
  },
  {
    pointId: "right-bottom",
    classLabel: "RIGHT",
    label: "Right Bottom",
    hint: "Look at the bottom-right dot.",
    xPct: 82,
    yPct: 72
  },
  {
    pointId: "center-bottom",
    classLabel: "CENTER",
    label: "Center Bottom",
    hint: "Look at the bottom-center dot.",
    xPct: 50,
    yPct: 72
  },
  {
    pointId: "left-bottom",
    classLabel: "LEFT",
    label: "Left Bottom",
    hint: "Look at the bottom-left dot.",
    xPct: 18,
    yPct: 72
  }
];

export const VALIDATION_POINTS: ValidationPointDef[] = [
  {
    pointId: "validation-left",
    expected: "LEFT",
    label: "Validation Left",
    xPct: 30,
    yPct: 40
  },
  {
    pointId: "validation-center",
    expected: "CENTER",
    label: "Validation Center",
    xPct: 50,
    yPct: 60
  },
  {
    pointId: "validation-right",
    expected: "RIGHT",
    label: "Validation Right",
    xPct: 70,
    yPct: 40
  }
];

export type PointQualityMetrics = {
  sampleCount: number;
  stddevX: number;
  stddevY: number;
};

export type PointQualityResult = {
  accepted: boolean;
  reason: "LOW_SAMPLE_COUNT" | "JITTER_X" | "JITTER_Y" | "OK";
  metrics: PointQualityMetrics;
};

function isFiniteCalibrationSample(sample: CalibrationSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) / values.length;
  return Math.sqrt(variance);
}

export function evaluatePointQuality(
  samples: CalibrationSample[],
  thresholds?: {
    minSamples?: number;
    maxStddevX?: number;
    maxStddevY?: number;
  }
): PointQualityResult {
  const minSamples = thresholds?.minSamples ?? 20;
  const maxStddevX = thresholds?.maxStddevX ?? 0.03;
  const maxStddevY = thresholds?.maxStddevY ?? 0.04;

  const finiteSamples = samples.filter(isFiniteCalibrationSample);
  const xs = finiteSamples.map((sample) => sample.x);
  const ys = finiteSamples.map((sample) => sample.y);

  const metrics: PointQualityMetrics = {
    sampleCount: finiteSamples.length,
    stddevX: standardDeviation(xs),
    stddevY: standardDeviation(ys)
  };

  if (metrics.sampleCount < minSamples) {
    return { accepted: false, reason: "LOW_SAMPLE_COUNT", metrics };
  }
  if (metrics.stddevX > maxStddevX) {
    return { accepted: false, reason: "JITTER_X", metrics };
  }
  if (metrics.stddevY > maxStddevY) {
    return { accepted: false, reason: "JITTER_Y", metrics };
  }

  return { accepted: true, reason: "OK", metrics };
}

export function trimOutliersByMad(
  samples: CalibrationSample[],
  multiplier = 2.5
): CalibrationSample[] {
  const finiteSamples = samples.filter(isFiniteCalibrationSample);
  if (finiteSamples.length === 0) return [];

  const xs = finiteSamples.map((sample) => sample.x);
  const center = median(xs);
  const spread = mad(xs, center);
  const tolerance = Math.max(multiplier * spread, 1e-4);

  return finiteSamples.filter((sample) => Math.abs(sample.x - center) <= tolerance);
}

export function buildCalibrationProfile(params: {
  center: CalibrationSample[];
  left: CalibrationSample[];
  right: CalibrationSample[];
  deadzoneMultiplier: number;
  lambda?: number;
}): CalibrationProfileV2 {
  const lambda = params.lambda ?? 0.25;
  const left = params.left.filter(isFiniteCalibrationSample);
  const center = params.center.filter(isFiniteCalibrationSample);
  const right = params.right.filter(isFiniteCalibrationSample);

  const xs: number[] = [];
  const ys: number[] = [];

  for (const s of left) {
    xs.push(s.x);
    ys.push(-1);
  }
  for (const s of center) {
    xs.push(s.x);
    ys.push(0);
  }
  for (const s of right) {
    xs.push(s.x);
    ys.push(1);
  }

  const n = xs.length;
  const xBar = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const yBar = ys.reduce((a, b) => a + b, 0) / Math.max(1, n);

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xBar;
    const dy = ys[i] - yBar;
    sxx += dx * dx;
    sxy += dx * dy;
  }

  // Ridge regression: w = sxy / (sxx + lambda), b = yBar - w*xBar
  const w = sxy / (sxx + lambda);
  const b = yBar - w * xBar;

  // Derive deadzone from CENTER score spread.
  const centerScores = center.map((s) => w * s.x + b);
  const centerMadScore = mad(centerScores, median(centerScores));
  const epsilon = 0.05;
  const deadzoneScore = clamp(
    Math.max(epsilon, params.deadzoneMultiplier * 2 * centerMadScore),
    0.05,
    0.9
  );

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    regression: { w, b, lambda },
    deadzoneScore
  };
}

export type BuildProfileFromPointsResult =
  | {
      ok: true;
      profile: CalibrationProfileV2;
      bucketCounts: Record<CalibrationStep, number>;
      pointCounts: Record<string, number>;
    }
  | {
      ok: false;
      reason: "INSUFFICIENT_CLEAN_SAMPLES";
      bucketCounts: Record<CalibrationStep, number>;
      pointCounts: Record<string, number>;
    };

export function buildCalibrationProfileFromPointSamples(params: {
  pointSamples: Record<string, CalibrationSample[]>;
  points?: CalibrationPointDef[];
  deadzoneMultiplier: number;
  lambda?: number;
  minSamplesPerBucket?: number;
}): BuildProfileFromPointsResult {
  const points = params.points ?? CALIBRATION_POINTS;
  const minSamplesPerBucket = params.minSamplesPerBucket ?? 25;

  const bucketed: Record<CalibrationStep, CalibrationSample[]> = {
    LEFT: [],
    CENTER: [],
    RIGHT: []
  };

  const pointCounts: Record<string, number> = {};

  for (const point of points) {
    const rawSamples = params.pointSamples[point.pointId] ?? [];
    const cleaned = trimOutliersByMad(rawSamples);
    bucketed[point.classLabel].push(...cleaned);
    pointCounts[point.pointId] = cleaned.length;
  }

  const bucketCounts: Record<CalibrationStep, number> = {
    LEFT: bucketed.LEFT.length,
    CENTER: bucketed.CENTER.length,
    RIGHT: bucketed.RIGHT.length
  };

  if (
    bucketCounts.LEFT < minSamplesPerBucket ||
    bucketCounts.CENTER < minSamplesPerBucket ||
    bucketCounts.RIGHT < minSamplesPerBucket
  ) {
    return {
      ok: false,
      reason: "INSUFFICIENT_CLEAN_SAMPLES",
      bucketCounts,
      pointCounts
    };
  }

  const profile = buildCalibrationProfile({
    center: bucketed.CENTER,
    left: bucketed.LEFT,
    right: bucketed.RIGHT,
    deadzoneMultiplier: params.deadzoneMultiplier,
    lambda: params.lambda
  });

  return {
    ok: true,
    profile,
    bucketCounts,
    pointCounts
  };
}

export type ValidationFrame = {
  pointId: string;
  expected: CalibrationStep;
  predicted: GazeDirection;
};

export type ValidationMetrics = {
  passed: boolean;
  frameCount: number;
  centerFrameCount: number;
  overallAccuracy: number;
  centerAccuracy: number;
};

export function evaluateValidationFrames(
  frames: ValidationFrame[],
  options?: {
    centerPointId?: string;
    minOverallAccuracy?: number;
    minCenterAccuracy?: number;
  }
): ValidationMetrics {
  const centerPointId = options?.centerPointId ?? "validation-center";
  const minOverallAccuracy = options?.minOverallAccuracy ?? 0.8;
  const minCenterAccuracy = options?.minCenterAccuracy ?? 0.7;

  if (frames.length === 0) {
    return {
      passed: false,
      frameCount: 0,
      centerFrameCount: 0,
      overallAccuracy: 0,
      centerAccuracy: 0
    };
  }

  let correct = 0;
  let centerCorrect = 0;
  let centerTotal = 0;

  for (const frame of frames) {
    if (frame.predicted === frame.expected) correct += 1;
    if (frame.pointId === centerPointId) {
      centerTotal += 1;
      if (frame.predicted === "CENTER") centerCorrect += 1;
    }
  }

  const overallAccuracy = correct / frames.length;
  const centerAccuracy = centerTotal > 0 ? centerCorrect / centerTotal : 0;
  const passed =
    overallAccuracy >= minOverallAccuracy &&
    centerAccuracy >= minCenterAccuracy;

  return {
    passed,
    frameCount: frames.length,
    centerFrameCount: centerTotal,
    overallAccuracy,
    centerAccuracy
  };
}

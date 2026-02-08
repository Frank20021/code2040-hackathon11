import type { EyeFeatures, GazeFeatures, Landmark, Point2 } from "./types";

const RIGHT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 362;
const LEFT_EYE_INNER = 263;

const RIGHT_UPPER_LID = 159;
const RIGHT_LOWER_LID = 145;
const LEFT_UPPER_LID = 386;
const LEFT_LOWER_LID = 374;

function avgPoint(points: Landmark[]): Point2 {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function leftRight(a: Point2, b: Point2) {
  return a.x <= b.x
    ? { leftCorner: a, rightCorner: b }
    : { leftCorner: b, rightCorner: a };
}

function upperLower(a: Point2, b: Point2) {
  return a.y <= b.y
    ? { upperLid: a, lowerLid: b }
    : { upperLid: b, lowerLid: a };
}

function safeRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-6) {
    return 0.5;
  }
  return numerator / denominator;
}

function buildEyeFeatures(params: {
  iris: Point2;
  cornerA: Point2;
  cornerB: Point2;
  lidA: Point2;
  lidB: Point2;
}): EyeFeatures {
  const { leftCorner, rightCorner } = leftRight(params.cornerA, params.cornerB);
  const { upperLid, lowerLid } = upperLower(params.lidA, params.lidB);

  const xRatio = safeRatio(params.iris.x - leftCorner.x, rightCorner.x - leftCorner.x);
  const yRatio = safeRatio(params.iris.y - upperLid.y, lowerLid.y - upperLid.y);

  return {
    iris: params.iris,
    xRatio,
    yRatio,
    leftCorner,
    rightCorner,
    upperLid,
    lowerLid
  };
}

export function extractGazeFeatures(landmarks: Landmark[]): {
  ok: true;
  hasIris: true;
  features: GazeFeatures;
} | {
  ok: true;
  hasIris: false;
  features: GazeFeatures;
} {
  const base: GazeFeatures = { x: 0.5, y: 0.5 };

  if (landmarks.length < 468) {
    return { ok: true, hasIris: false, features: base };
  }

  const hasIris = landmarks.length >= 478;
  const irisPoints = hasIris ? landmarks.slice(-10) : [];

  const rightIris = hasIris ? avgPoint(irisPoints.slice(0, 5)) : undefined;
  const leftIris = hasIris ? avgPoint(irisPoints.slice(5, 10)) : undefined;

  const rightCorners = [landmarks[RIGHT_EYE_OUTER], landmarks[RIGHT_EYE_INNER]] as const;
  const leftCorners = [landmarks[LEFT_EYE_OUTER], landmarks[LEFT_EYE_INNER]] as const;

  const rightLids = [landmarks[RIGHT_UPPER_LID], landmarks[RIGHT_LOWER_LID]] as const;
  const leftLids = [landmarks[LEFT_UPPER_LID], landmarks[LEFT_LOWER_LID]] as const;

  if (!hasIris || !rightIris || !leftIris) {
    const x = 0.5;
    const y = 0.5;
    return { ok: true, hasIris: false, features: { ...base, x, y } };
  }

  const rightEye = buildEyeFeatures({
    iris: rightIris,
    cornerA: { x: rightCorners[0].x, y: rightCorners[0].y },
    cornerB: { x: rightCorners[1].x, y: rightCorners[1].y },
    lidA: { x: rightLids[0].x, y: rightLids[0].y },
    lidB: { x: rightLids[1].x, y: rightLids[1].y }
  });

  const leftEye = buildEyeFeatures({
    iris: leftIris,
    cornerA: { x: leftCorners[0].x, y: leftCorners[0].y },
    cornerB: { x: leftCorners[1].x, y: leftCorners[1].y },
    lidA: { x: leftLids[0].x, y: leftLids[0].y },
    lidB: { x: leftLids[1].x, y: leftLids[1].y }
  });

  return {
    ok: true,
    hasIris: true,
    features: {
      x: (rightEye.xRatio + leftEye.xRatio) / 2,
      y: (rightEye.yRatio + leftEye.yRatio) / 2,
      rightEye,
      leftEye
    }
  };
}


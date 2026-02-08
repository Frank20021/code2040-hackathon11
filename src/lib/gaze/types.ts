export type GazeDirection =
  | "LEFT"
  | "RIGHT"
  | "CENTER"
  | "NO_FACE"
  | "NO_IRIS";

export type Point2 = { x: number; y: number };
export type Landmark = { x: number; y: number; z?: number };

export type EyeFeatures = {
  iris: Point2;
  xRatio: number;
  yRatio: number;
  leftCorner: Point2;
  rightCorner: Point2;
  upperLid: Point2;
  lowerLid: Point2;
};

export type GazeFeatures = {
  x: number;
  y: number;
  leftEye?: EyeFeatures;
  rightEye?: EyeFeatures;
};

export type CalibrationProfileV1 = {
  version: 1;
  createdAt: string;
  xCenter: number;
  yCenter: number;
  deadzoneX: number;
  deadzoneY: number;
  thresholds: {
    xLeft: number;
    xRight: number;
    yUp: number;
    yDown: number;
  };
};

export type CalibrationProfileV2 = {
  version: 2;
  createdAt: string;
  /**
   * Regression score: score = w * x + b
   * Targets during calibration:
   * - LEFT = -1
   * - CENTER = 0
   * - RIGHT = +1
   */
  regression: { w: number; b: number; lambda: number };
  /**
   * Score deadzone for CENTER classification (e.g. 0.25).
   */
  deadzoneScore: number;
};

export type CalibrationProfile = CalibrationProfileV2;

export type GazeOutput = {
  direction: GazeDirection;
  confidence: number;
  features?: GazeFeatures;
};

import { describe, expect, it } from "vitest";
import {
  buildCalibrationProfile,
  buildCalibrationProfileFromPointSamples,
  CALIBRATION_POINTS,
  evaluatePointQuality,
  trimOutliersByMad
} from "../calibration";

describe("calibration points", () => {
  it("defines exactly 9 unique calibration points with all 3 class labels", () => {
    expect(CALIBRATION_POINTS).toHaveLength(9);

    const pointIds = new Set(CALIBRATION_POINTS.map((point) => point.pointId));
    expect(pointIds.size).toBe(9);

    const labels = new Set(CALIBRATION_POINTS.map((point) => point.classLabel));
    expect(labels).toEqual(new Set(["LEFT", "CENTER", "RIGHT"]));
  });
});

describe("evaluatePointQuality", () => {
  it("accepts stable points and rejects jittery or low-sample points", () => {
    const stable = Array.from({ length: 24 }, (_, i) => ({
      x: 0.5 + (i % 2 === 0 ? 0.004 : -0.004),
      y: 0.5 + (i % 2 === 0 ? 0.006 : -0.006)
    }));
    const jitteryX = Array.from({ length: 24 }, (_, i) => ({
      x: 0.5 + (i % 2 === 0 ? 0.08 : -0.08),
      y: 0.5
    }));
    const lowSample = Array.from({ length: 8 }, () => ({ x: 0.5, y: 0.5 }));

    expect(evaluatePointQuality(stable).accepted).toBe(true);
    expect(evaluatePointQuality(jitteryX).reason).toBe("JITTER_X");
    expect(evaluatePointQuality(lowSample).reason).toBe("LOW_SAMPLE_COUNT");
  });

  it("ignores non-finite samples", () => {
    const noisy = [
      ...Array.from({ length: 24 }, (_, i) => ({
        x: 0.5 + (i % 2 === 0 ? 0.004 : -0.004),
        y: 0.5 + (i % 2 === 0 ? 0.006 : -0.006)
      })),
      { x: Number.NaN, y: 0.5 },
      { x: 0.5, y: Number.POSITIVE_INFINITY }
    ];

    expect(evaluatePointQuality(noisy).accepted).toBe(true);
  });
});

describe("trimOutliersByMad", () => {
  it("removes x outliers while preserving inlier samples", () => {
    const samples = [
      ...Array.from({ length: 30 }, (_, i) => ({
        x: 0.35 + (i % 3) * 0.001,
        y: 0.5
      })),
      { x: 0.02, y: 0.5 },
      { x: 0.95, y: 0.5 }
    ];

    const cleaned = trimOutliersByMad(samples);

    expect(cleaned.length).toBeLessThan(samples.length);
    expect(cleaned.every((sample) => sample.x > 0.2 && sample.x < 0.6)).toBe(true);
  });
});

describe("buildCalibrationProfile", () => {
  it("produces deterministic thresholds and deadzones", () => {
    const profile = buildCalibrationProfile({
      center: Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.5 })),
      left: Array.from({ length: 20 }, () => ({ x: 0.35, y: 0.5 })),
      right: Array.from({ length: 20 }, () => ({ x: 0.65, y: 0.5 })),
      deadzoneMultiplier: 2
    });

    expect(profile.version).toBe(2);
    expect(profile.regression.w).toBeGreaterThan(0);
    expect(profile.deadzoneScore).toBeGreaterThan(0);
  });
});

describe("buildCalibrationProfileFromPointSamples", () => {
  it("builds a profile from cleaned pooled 9-point samples", () => {
    const pointSamples = Object.fromEntries(
      CALIBRATION_POINTS.map((point) => {
        const base =
          point.classLabel === "LEFT"
            ? 0.35
            : point.classLabel === "CENTER"
              ? 0.5
              : 0.65;

        const samples = Array.from({ length: 30 }, (_, i) => ({
          x: base + (i % 2 === 0 ? 0.006 : -0.006),
          y: 0.5 + (i % 2 === 0 ? 0.004 : -0.004)
        }));

        // Inject one obvious outlier per point to verify trimming.
        samples.push({ x: base + 0.35, y: 0.5 });

        return [point.pointId, samples];
      })
    );

    const result = buildCalibrationProfileFromPointSamples({
      pointSamples,
      deadzoneMultiplier: 2
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bucketCounts.LEFT).toBeGreaterThanOrEqual(25);
    expect(result.bucketCounts.CENTER).toBeGreaterThanOrEqual(25);
    expect(result.bucketCounts.RIGHT).toBeGreaterThanOrEqual(25);
    expect(result.profile.version).toBe(2);
  });

  it("fails when pooled cleaned samples are below minimums", () => {
    const pointSamples = Object.fromEntries(
      CALIBRATION_POINTS.map((point) => [
        point.pointId,
        Array.from({ length: 5 }, () => ({ x: 0.5, y: 0.5 }))
      ])
    );

    const result = buildCalibrationProfileFromPointSamples({
      pointSamples,
      deadzoneMultiplier: 2
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("INSUFFICIENT_CLEAN_SAMPLES");
  });

  it("filters non-finite point samples before building", () => {
    const pointSamples = Object.fromEntries(
      CALIBRATION_POINTS.map((point) => {
        const base =
          point.classLabel === "LEFT"
            ? 0.35
            : point.classLabel === "CENTER"
              ? 0.5
              : 0.65;

        const samples = Array.from({ length: 30 }, (_, i) => ({
          x: base + (i % 2 === 0 ? 0.006 : -0.006),
          y: 0.5 + (i % 2 === 0 ? 0.004 : -0.004)
        }));

        samples.push({ x: Number.NaN, y: 0.5 });
        samples.push({ x: 0.5, y: Number.NaN });

        return [point.pointId, samples];
      })
    );

    const result = buildCalibrationProfileFromPointSamples({
      pointSamples,
      deadzoneMultiplier: 2
    });

    expect(result.ok).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { applyPointResult, createCalibrationQueue } from "../calibrationSession";

describe("calibrationSession queue", () => {
  it("keeps queue unchanged on accepted point", () => {
    const state = createCalibrationQueue(["a", "b"], 4);

    const next = applyPointResult(state, {
      pointId: "a",
      isRetry: false,
      accepted: true
    });

    expect(next.queue).toHaveLength(2);
    expect(next.retryCount).toBe(0);
    expect(next.failedPointIds.size).toBe(0);
  });

  it("schedules one retry for failed first-pass points", () => {
    const state = createCalibrationQueue(["a", "b"], 4);

    const next = applyPointResult(state, {
      pointId: "a",
      isRetry: false,
      accepted: false
    });

    expect(next.retryCount).toBe(1);
    expect(next.queue).toHaveLength(3);
    expect(next.queue[2]).toEqual({ pointId: "a", isRetry: true });
  });

  it("marks failed after retry attempt", () => {
    const initial = createCalibrationQueue(["a"], 4);
    const withRetry = applyPointResult(initial, {
      pointId: "a",
      isRetry: false,
      accepted: false
    });

    const failed = applyPointResult(withRetry, {
      pointId: "a",
      isRetry: true,
      accepted: false
    });

    expect(failed.failedPointIds.has("a")).toBe(true);
  });

  it("marks failed when retry cap is exhausted", () => {
    const exhausted = createCalibrationQueue(["a", "b", "c", "d", "e"], 0);

    const next = applyPointResult(exhausted, {
      pointId: "a",
      isRetry: false,
      accepted: false
    });

    expect(next.failedPointIds.has("a")).toBe(true);
    expect(next.retryCount).toBe(0);
    expect(next.queue).toHaveLength(5);
  });
});

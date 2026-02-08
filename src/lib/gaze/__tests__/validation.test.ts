import { describe, expect, it } from "vitest";
import { evaluateValidationFrames } from "../calibration";

describe("evaluateValidationFrames", () => {
  it("passes when overall and center thresholds are met", () => {
    const frames = [
      { pointId: "validation-left", expected: "LEFT" as const, predicted: "LEFT" as const },
      { pointId: "validation-left", expected: "LEFT" as const, predicted: "LEFT" as const },
      { pointId: "validation-center", expected: "CENTER" as const, predicted: "CENTER" as const },
      { pointId: "validation-center", expected: "CENTER" as const, predicted: "CENTER" as const },
      { pointId: "validation-right", expected: "RIGHT" as const, predicted: "RIGHT" as const }
    ];

    const result = evaluateValidationFrames(frames);

    expect(result.passed).toBe(true);
    expect(result.overallAccuracy).toBe(1);
    expect(result.centerAccuracy).toBe(1);
  });

  it("fails when center accuracy is below threshold", () => {
    const frames = [
      { pointId: "validation-left", expected: "LEFT" as const, predicted: "LEFT" as const },
      { pointId: "validation-center", expected: "CENTER" as const, predicted: "LEFT" as const },
      { pointId: "validation-center", expected: "CENTER" as const, predicted: "RIGHT" as const },
      { pointId: "validation-right", expected: "RIGHT" as const, predicted: "RIGHT" as const },
      { pointId: "validation-right", expected: "RIGHT" as const, predicted: "RIGHT" as const }
    ];

    const result = evaluateValidationFrames(frames);

    expect(result.passed).toBe(false);
    expect(result.centerAccuracy).toBe(0);
  });
});

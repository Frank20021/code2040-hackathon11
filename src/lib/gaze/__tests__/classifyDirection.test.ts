import { describe, expect, it } from "vitest";
import { classifyDirection } from "../classifyDirection";
import type { CalibrationProfileV2 } from "../types";

const calibration: CalibrationProfileV2 = {
  version: 2,
  createdAt: "2020-01-01T00:00:00.000Z",
  regression: { w: 4, b: -2, lambda: 0.25 }, // score = 4x - 2 => x=0.5 => 0
  deadzoneScore: 0.15
};

describe("classifyDirection", () => {
  it("returns CENTER within deadzone", () => {
    const out = classifyDirection({ features: { x: 0.52, y: 0.48 }, calibration });
    expect(out.direction).toBe("CENTER");
  });

  it("classifies strong horizontal movement", () => {
    const out = classifyDirection({ features: { x: 0.35, y: 0.5 }, calibration });
    expect(out.direction).toBe("LEFT");
  });

  it("classifies right movement", () => {
    const out = classifyDirection({ features: { x: 0.7, y: 0.5 }, calibration });
    expect(out.direction).toBe("RIGHT");
  });
});

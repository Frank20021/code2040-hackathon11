import { describe, expect, it } from "vitest";
import { createSmoother, majorityVote } from "../smoothing";
import type { GazeDirection } from "../types";

describe("majorityVote", () => {
  it("returns last label on empty tie", () => {
    const labels: GazeDirection[] = ["LEFT", "RIGHT"];
    expect(majorityVote(labels)).toBe("RIGHT");
  });
});

describe("createSmoother", () => {
  it("keeps a fixed window and returns majority", () => {
    const s = createSmoother(3);
    expect(s.push("LEFT")).toBe("LEFT");
    expect(s.push("RIGHT")).toBe("RIGHT");
    expect(s.push("RIGHT")).toBe("RIGHT");
    expect(s.push("LEFT")).toBe("RIGHT"); // window: RIGHT,RIGHT,LEFT
  });
});


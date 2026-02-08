import { describe, expect, it } from "vitest";
import {
  appendAndGetDominantIntentDirection,
  dominantIntentDirection,
  type IntentSample
} from "../intentFilter";

describe("dominantIntentDirection", () => {
  it("returns the most frequent direction", () => {
    expect(dominantIntentDirection(["LEFT", "LEFT", "RIGHT"])).toBe("LEFT");
  });

  it("breaks ties by most recent direction", () => {
    expect(dominantIntentDirection(["LEFT", "RIGHT"])).toBe("RIGHT");
  });
});

describe("appendAndGetDominantIntentDirection", () => {
  it("keeps dominant direction despite a brief glitch", () => {
    const samples: IntentSample[] = [];
    let dominant: "LEFT" | "RIGHT" | "CENTER" | "NONE" = "NONE";

    for (let i = 0; i < 20; i += 1) {
      dominant = appendAndGetDominantIntentDirection({
        samples,
        nextDirection: "LEFT",
        nowMs: i * 100,
        windowMs: 2000
      });
    }

    dominant = appendAndGetDominantIntentDirection({
      samples,
      nextDirection: "NONE",
      nowMs: 2001,
      windowMs: 2000
    });

    expect(dominant).toBe("LEFT");
  });

  it("forgets stale samples outside the averaging window", () => {
    const samples: IntentSample[] = [];

    appendAndGetDominantIntentDirection({
      samples,
      nextDirection: "LEFT",
      nowMs: 0,
      windowMs: 300
    });
    appendAndGetDominantIntentDirection({
      samples,
      nextDirection: "LEFT",
      nowMs: 100,
      windowMs: 300
    });

    const dominant = appendAndGetDominantIntentDirection({
      samples,
      nextDirection: "RIGHT",
      nowMs: 450,
      windowMs: 300
    });

    expect(dominant).toBe("RIGHT");
  });
});

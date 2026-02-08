import { describe, expect, it } from "vitest";
import {
  createInitialImpactMetricsState,
  reduceImpactMetrics
} from "../metrics";

describe("impact metrics reducer", () => {
  it("tracks selection attempts and recovery prompts", () => {
    let state = createInitialImpactMetricsState();
    state = reduceImpactMetrics(state, { type: "demo_started", atMs: 1000 });
    state = reduceImpactMetrics(state, {
      type: "selection_attempt",
      atMs: 1200,
      side: "left"
    });
    state = reduceImpactMetrics(state, {
      type: "recovery_prompt",
      atMs: 1300,
      reason: "no_face"
    });
    expect(state.summary.selectionAttempts).toBe(1);
    expect(state.summary.recoveryPromptsShown).toBe(1);
  });

  it("records time to first confirmed request", () => {
    let state = createInitialImpactMetricsState();
    state = reduceImpactMetrics(state, { type: "demo_started", atMs: 1000 });
    state = reduceImpactMetrics(state, {
      type: "request_confirmed",
      atMs: 4500,
      actionId: "nurse"
    });
    expect(state.summary.requestConfirmed).toBe(true);
    expect(state.summary.timeToFirstRequestMs).toBe(3500);
  });
});

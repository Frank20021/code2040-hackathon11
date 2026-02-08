import type { DemoMetricEvent, ImpactSummary } from "./types";

export type ImpactMetricsState = {
  startedAtMs: number | null;
  summary: ImpactSummary;
};

export function createInitialImpactMetricsState(): ImpactMetricsState {
  return {
    startedAtMs: null,
    summary: {
      timeToFirstRequestMs: null,
      selectionAttempts: 0,
      recoveryPromptsShown: 0,
      requestConfirmed: false
    }
  };
}

export function reduceImpactMetrics(
  state: ImpactMetricsState,
  event: DemoMetricEvent
): ImpactMetricsState {
  if (event.type === "demo_started") {
    return {
      startedAtMs: event.atMs,
      summary: {
        timeToFirstRequestMs: null,
        selectionAttempts: 0,
        recoveryPromptsShown: 0,
        requestConfirmed: false
      }
    };
  }

  if (event.type === "selection_attempt") {
    return {
      ...state,
      summary: {
        ...state.summary,
        selectionAttempts: state.summary.selectionAttempts + 1
      }
    };
  }

  if (event.type === "recovery_prompt") {
    return {
      ...state,
      summary: {
        ...state.summary,
        recoveryPromptsShown: state.summary.recoveryPromptsShown + 1
      }
    };
  }

  if (event.type === "request_confirmed") {
    const timeToFirstRequestMs =
      state.summary.timeToFirstRequestMs === null && state.startedAtMs !== null
        ? Math.max(0, event.atMs - state.startedAtMs)
        : state.summary.timeToFirstRequestMs;
    return {
      ...state,
      summary: {
        ...state.summary,
        timeToFirstRequestMs,
        requestConfirmed: true
      }
    };
  }

  return state;
}

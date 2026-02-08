export type DemoScenario = "default" | "impact_night_request";

export type DemoMetricEvent =
  | { type: "demo_started"; atMs: number }
  | { type: "selection_attempt"; atMs: number; side: "left" | "right" }
  | { type: "recovery_prompt"; atMs: number; reason: "no_face" | "no_iris" }
  | { type: "request_confirmed"; atMs: number; actionId: string };

export type ImpactSummary = {
  timeToFirstRequestMs: number | null;
  selectionAttempts: number;
  recoveryPromptsShown: number;
  requestConfirmed: boolean;
};

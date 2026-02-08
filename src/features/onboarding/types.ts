export const ONBOARDING_STORAGE_KEY = "eldergaze.onboarding.v1";
export const ONBOARDING_SCHEMA_VERSION = 1;

export const ONBOARDING_STEPS = [
  "welcome",
  "readiness",
  "permissions",
  "eye-training",
  "calibration",
  "validation",
  "impact-summary",
  "complete"
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type OnboardingPersistedState = {
  version: number;
  completedAt: string;
  caregiverAssist: boolean;
  onboardingDurationMs: number;
};

export type OnboardingState = {
  step: OnboardingStepId;
  stepIndex: number;
  startedAtMs: number;
  caregiverAssist: boolean;
  calibrationCompleted: boolean;
  completed: boolean;
};

export type OnboardingCompletion = {
  caregiverAssist: boolean;
  onboardingDurationMs: number;
};

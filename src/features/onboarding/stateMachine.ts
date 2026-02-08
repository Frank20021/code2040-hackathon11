import { ONBOARDING_STEPS, type OnboardingState } from "./types";

export function createInitialOnboardingState(options?: {
  caregiverAssist?: boolean;
  calibrationCompleted?: boolean;
  nowMs?: number;
}): OnboardingState {
  return {
    step: ONBOARDING_STEPS[0],
    stepIndex: 0,
    startedAtMs: options?.nowMs ?? Date.now(),
    caregiverAssist: options?.caregiverAssist ?? false,
    calibrationCompleted: options?.calibrationCompleted ?? false,
    completed: false
  };
}

export function isStepCompleteAllowed(state: OnboardingState): boolean {
  if (state.step === "calibration") return state.calibrationCompleted;
  if (state.step === "validation") return state.calibrationCompleted;
  return true;
}

export function nextOnboardingStep(state: OnboardingState): OnboardingState {
  if (!isStepCompleteAllowed(state)) return state;
  const nextIndex = Math.min(state.stepIndex + 1, ONBOARDING_STEPS.length - 1);
  const nextStep = ONBOARDING_STEPS[nextIndex];
  return {
    ...state,
    stepIndex: nextIndex,
    step: nextStep,
    completed: nextStep === "complete"
  };
}

export function previousOnboardingStep(state: OnboardingState): OnboardingState {
  const nextIndex = Math.max(0, state.stepIndex - 1);
  return {
    ...state,
    stepIndex: nextIndex,
    step: ONBOARDING_STEPS[nextIndex],
    completed: false
  };
}

export function setOnboardingCaregiverAssist(
  state: OnboardingState,
  caregiverAssist: boolean
): OnboardingState {
  return { ...state, caregiverAssist };
}

export function setOnboardingCalibrationCompleted(
  state: OnboardingState,
  calibrationCompleted: boolean
): OnboardingState {
  return { ...state, calibrationCompleted };
}

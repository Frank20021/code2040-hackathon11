import { describe, expect, it } from "vitest";
import {
  createInitialOnboardingState,
  isStepCompleteAllowed,
  nextOnboardingStep,
  previousOnboardingStep,
  setOnboardingCalibrationCompleted,
  setOnboardingCaregiverAssist
} from "../stateMachine";

describe("onboarding state machine", () => {
  it("walks through steps in sequence", () => {
    let state = createInitialOnboardingState({ nowMs: 1000 });
    expect(state.step).toBe("welcome");
    state = nextOnboardingStep(state);
    expect(state.step).toBe("readiness");
    state = nextOnboardingStep(state);
    expect(state.step).toBe("permissions");
  });

  it("does not advance from calibration until calibration is complete", () => {
    let state = createInitialOnboardingState();
    state = nextOnboardingStep(state); // readiness
    state = nextOnboardingStep(state); // permissions
    state = nextOnboardingStep(state); // eye-training
    state = nextOnboardingStep(state); // calibration
    expect(state.step).toBe("calibration");
    expect(isStepCompleteAllowed(state)).toBe(false);
    expect(nextOnboardingStep(state).step).toBe("calibration");
    state = setOnboardingCalibrationCompleted(state, true);
    expect(isStepCompleteAllowed(state)).toBe(true);
    expect(nextOnboardingStep(state).step).toBe("validation");
  });

  it("supports moving backward", () => {
    let state = createInitialOnboardingState();
    state = nextOnboardingStep(state); // readiness
    expect(previousOnboardingStep(state).step).toBe("welcome");
  });

  it("stores caregiver assist preference", () => {
    const state = createInitialOnboardingState();
    expect(setOnboardingCaregiverAssist(state, true).caregiverAssist).toBe(true);
  });
});

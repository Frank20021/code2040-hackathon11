import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingFromStorage,
  loadOnboardingFromStorage,
  saveOnboardingToStorage
} from "../storage";
import { ONBOARDING_STORAGE_KEY } from "../types";

function createWindowMock() {
  const storage = new Map<string, string>();
  return {
    localStorage: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      }
    }
  } as unknown as Window;
}

describe("onboarding storage", () => {
  const originalWindow = globalThis.window;

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: createWindowMock()
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  });

  it("saves and loads onboarding completion payload", () => {
    const saved = saveOnboardingToStorage({
      version: 1,
      completedAt: "2026-02-08T00:00:00.000Z",
      caregiverAssist: true,
      onboardingDurationMs: 42000
    });

    expect(saved).toBe(true);
    expect(loadOnboardingFromStorage()).toEqual({
      version: 1,
      completedAt: "2026-02-08T00:00:00.000Z",
      caregiverAssist: true,
      onboardingDurationMs: 42000
    });
  });

  it("returns null for mismatched schema version", () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        version: 999,
        completedAt: "2026-02-08T00:00:00.000Z",
        caregiverAssist: false,
        onboardingDurationMs: 1000
      })
    );
    expect(loadOnboardingFromStorage()).toBeNull();
  });

  it("clears saved onboarding payload", () => {
    saveOnboardingToStorage({
      version: 1,
      completedAt: "2026-02-08T00:00:00.000Z",
      caregiverAssist: false,
      onboardingDurationMs: 5000
    });
    expect(clearOnboardingFromStorage()).toBe(true);
    expect(loadOnboardingFromStorage()).toBeNull();
  });
});

import {
  ONBOARDING_SCHEMA_VERSION,
  ONBOARDING_STORAGE_KEY,
  type OnboardingPersistedState
} from "./types";

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

export function loadOnboardingFromStorage(): OnboardingPersistedState | null {
  const win = safeWindow();
  if (!win) return null;

  try {
    const raw = win.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingPersistedState>;
    if (!parsed || parsed.version !== ONBOARDING_SCHEMA_VERSION) return null;
    if (typeof parsed.completedAt !== "string") return null;
    if (typeof parsed.caregiverAssist !== "boolean") return null;
    if (typeof parsed.onboardingDurationMs !== "number") return null;
    return {
      version: ONBOARDING_SCHEMA_VERSION,
      completedAt: parsed.completedAt,
      caregiverAssist: parsed.caregiverAssist,
      onboardingDurationMs: parsed.onboardingDurationMs
    };
  } catch {
    return null;
  }
}

export function saveOnboardingToStorage(state: OnboardingPersistedState): boolean {
  const win = safeWindow();
  if (!win) return false;

  try {
    win.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearOnboardingFromStorage(): boolean {
  const win = safeWindow();
  if (!win) return false;

  try {
    win.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

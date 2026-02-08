import type { CalibrationProfile } from "./types";

const STORAGE_KEY = "gaze_calibration_v2";
const STORAGE_BACKUP_KEY = "gaze_calibration_v2_backup";
const ATTEMPT_STORAGE_KEY = "gaze_calibration_attempt_v1";
const ATTEMPT_BACKUP_KEY = "gaze_calibration_attempt_v1_backup";

export type CalibrationAttemptRecordV1 = {
  version: 1;
  attemptedAt: string;
  status: "SUCCESS" | "FAILED";
  reason: string;
  profile?: CalibrationProfile;
  pointSampleCounts: Record<string, number>;
  retryCount: number;
  failedPointIds: string[];
  bucketCounts?: {
    LEFT: number;
    CENTER: number;
    RIGHT: number;
  };
  validation?: {
    passed: boolean;
    overallAccuracy: number;
    centerAccuracy: number;
    frameCount: number;
    centerFrameCount: number;
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isValidProfile(profile: unknown): profile is CalibrationProfile {
  if (!profile || typeof profile !== "object") return false;

  const candidate = profile as Partial<CalibrationProfile> & {
    regression?: Partial<CalibrationProfile["regression"]>;
  };

  if (candidate.version !== 2) return false;
  if (typeof candidate.createdAt !== "string" || candidate.createdAt.length === 0) return false;
  if (!candidate.regression || typeof candidate.regression !== "object") return false;
  if (!isFiniteNumber(candidate.regression.w)) return false;
  if (!isFiniteNumber(candidate.regression.b)) return false;
  if (!isFiniteNumber(candidate.regression.lambda)) return false;
  if (!isFiniteNumber(candidate.deadzoneScore)) return false;

  return true;
}

function loadFromKey(key: string): CalibrationProfile | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isValidAttemptRecord(value: unknown): value is CalibrationAttemptRecordV1 {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.attemptedAt !== "string" || value.attemptedAt.length === 0) return false;
  if (value.status !== "SUCCESS" && value.status !== "FAILED") return false;
  if (typeof value.reason !== "string" || value.reason.length === 0) return false;
  if (value.profile !== undefined && !isValidProfile(value.profile)) return false;
  if (!isRecord(value.pointSampleCounts)) return false;
  if (!isNonNegativeFiniteNumber(value.retryCount)) return false;
  if (!Array.isArray(value.failedPointIds)) return false;
  if (value.failedPointIds.some((item) => typeof item !== "string")) return false;

  for (const item of Object.values(value.pointSampleCounts)) {
    if (!isNonNegativeFiniteNumber(item)) return false;
  }

  if (value.bucketCounts !== undefined) {
    if (!isRecord(value.bucketCounts)) return false;
    if (!isNonNegativeFiniteNumber(value.bucketCounts.LEFT)) return false;
    if (!isNonNegativeFiniteNumber(value.bucketCounts.CENTER)) return false;
    if (!isNonNegativeFiniteNumber(value.bucketCounts.RIGHT)) return false;
  }

  if (value.validation !== undefined) {
    if (!isRecord(value.validation)) return false;
    if (typeof value.validation.passed !== "boolean") return false;
    if (!isFiniteNumber(value.validation.overallAccuracy)) return false;
    if (!isFiniteNumber(value.validation.centerAccuracy)) return false;
    if (!isNonNegativeFiniteNumber(value.validation.frameCount)) return false;
    if (!isNonNegativeFiniteNumber(value.validation.centerFrameCount)) return false;
  }

  return true;
}

function loadAttemptFromKey(key: string): CalibrationAttemptRecordV1 | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidAttemptRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadCalibrationFromStorage(): CalibrationProfile | null {
  try {
    const primary = loadFromKey(STORAGE_KEY);
    if (primary) return primary;

    const backup = loadFromKey(STORAGE_BACKUP_KEY);
    if (backup) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
      } catch {
        // Recovery write is best-effort.
      }
      return backup;
    }
  } catch {
    // Continue to attempt fallback.
  }

  try {
    const attemptPrimary = loadAttemptFromKey(ATTEMPT_STORAGE_KEY);
    const attemptBackup = loadAttemptFromKey(ATTEMPT_BACKUP_KEY);
    const attemptProfile = attemptPrimary?.profile ?? attemptBackup?.profile ?? null;
    if (!attemptProfile || !isValidProfile(attemptProfile)) return null;

    try {
      const serialized = JSON.stringify(attemptProfile);
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_BACKUP_KEY, serialized);
    } catch {
      // Recovery write is best-effort.
    }

    return attemptProfile;
  } catch {
    return null;
  }
}

export function saveCalibrationToStorage(profile: CalibrationProfile): boolean {
  if (!isValidProfile(profile)) return false;

  const serialized = JSON.stringify(profile);
  let wrotePrimary = false;
  let wroteBackup = false;

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    wrotePrimary = true;
  } catch {
    // Continue and try backup key.
  }

  try {
    localStorage.setItem(STORAGE_BACKUP_KEY, serialized);
    wroteBackup = true;
  } catch {
    // Nothing else to do.
  }

  return wrotePrimary || wroteBackup;
}

export function loadCalibrationAttemptFromStorage(): CalibrationAttemptRecordV1 | null {
  try {
    const primary = loadAttemptFromKey(ATTEMPT_STORAGE_KEY);
    if (primary) return primary;

    const backup = loadAttemptFromKey(ATTEMPT_BACKUP_KEY);
    if (!backup) return null;

    try {
      localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(backup));
    } catch {
      // Recovery write is best-effort.
    }
    return backup;
  } catch {
    return null;
  }
}

export function saveCalibrationAttemptToStorage(
  attempt: CalibrationAttemptRecordV1
): boolean {
  if (!isValidAttemptRecord(attempt)) return false;

  const serialized = JSON.stringify(attempt);
  let wrotePrimary = false;
  let wroteBackup = false;

  try {
    localStorage.setItem(ATTEMPT_STORAGE_KEY, serialized);
    wrotePrimary = true;
  } catch {
    // Continue and try backup key.
  }

  try {
    localStorage.setItem(ATTEMPT_BACKUP_KEY, serialized);
    wroteBackup = true;
  } catch {
    // Nothing else to do.
  }

  return wrotePrimary || wroteBackup;
}

export function clearCalibrationFromStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_BACKUP_KEY);
  localStorage.removeItem(ATTEMPT_STORAGE_KEY);
  localStorage.removeItem(ATTEMPT_BACKUP_KEY);
}

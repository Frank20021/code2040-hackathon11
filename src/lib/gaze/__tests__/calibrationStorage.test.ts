import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCalibrationFromStorage,
  loadCalibrationAttemptFromStorage,
  loadCalibrationFromStorage,
  saveCalibrationAttemptToStorage,
  saveCalibrationToStorage
} from "../calibrationStorage";
import type { CalibrationProfile } from "../types";

const PRIMARY_KEY = "gaze_calibration_v2";
const BACKUP_KEY = "gaze_calibration_v2_backup";
const ATTEMPT_PRIMARY_KEY = "gaze_calibration_attempt_v1";
const ATTEMPT_BACKUP_KEY = "gaze_calibration_attempt_v1_backup";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  private failingKeys = new Set<string>();

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failingKeys.has(key)) {
      throw new Error(`setItem failed for ${key}`);
    }
    this.data.set(key, String(value));
  }

  failOnKey(key: string): void {
    this.failingKeys.add(key);
  }

  failOnKeys(keys: string[]): void {
    for (const key of keys) this.failingKeys.add(key);
  }
}

const validProfile: CalibrationProfile = {
  version: 2,
  createdAt: "2026-02-08T20:00:00.000Z",
  regression: { w: 1.25, b: -0.15, lambda: 0.1 },
  deadzoneScore: 0.22
};

const validAttempt = {
  version: 1 as const,
  attemptedAt: "2026-02-08T20:01:00.000Z",
  status: "FAILED" as const,
  reason: "POINT_QUALITY_FAILED",
  profile: validProfile,
  pointSampleCounts: { "center-mid": 20, "left-mid": 18 },
  retryCount: 1,
  failedPointIds: ["left-mid"],
  bucketCounts: {
    LEFT: 10,
    CENTER: 18,
    RIGHT: 12
  },
  validation: {
    passed: false,
    overallAccuracy: 0.61,
    centerAccuracy: 0.54,
    frameCount: 120,
    centerFrameCount: 40
  }
};

describe("calibrationStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true
    });
  });

  it("loads from primary key when valid", () => {
    storage.setItem(PRIMARY_KEY, JSON.stringify(validProfile));

    expect(loadCalibrationFromStorage()).toEqual(validProfile);
  });

  it("falls back to backup when primary is invalid and restores primary", () => {
    storage.setItem(PRIMARY_KEY, "{ bad json");
    storage.setItem(BACKUP_KEY, JSON.stringify(validProfile));

    expect(loadCalibrationFromStorage()).toEqual(validProfile);
    expect(storage.getItem(PRIMARY_KEY)).toEqual(JSON.stringify(validProfile));
  });

  it("returns null when no valid primary or backup exists", () => {
    storage.setItem(PRIMARY_KEY, "{ bad json");
    storage.setItem(BACKUP_KEY, JSON.stringify({ version: 1 }));

    expect(loadCalibrationFromStorage()).toBeNull();
  });

  it("saves to primary and backup keys", () => {
    expect(saveCalibrationToStorage(validProfile)).toBe(true);
    expect(storage.getItem(PRIMARY_KEY)).toEqual(JSON.stringify(validProfile));
    expect(storage.getItem(BACKUP_KEY)).toEqual(JSON.stringify(validProfile));
  });

  it("returns true when primary write fails but backup succeeds", () => {
    storage.failOnKey(PRIMARY_KEY);

    expect(saveCalibrationToStorage(validProfile)).toBe(true);
    expect(storage.getItem(PRIMARY_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toEqual(JSON.stringify(validProfile));
  });

  it("returns false when both writes fail", () => {
    storage.failOnKeys([PRIMARY_KEY, BACKUP_KEY]);

    expect(saveCalibrationToStorage(validProfile)).toBe(false);
  });

  it("clears both keys", () => {
    storage.setItem(PRIMARY_KEY, JSON.stringify(validProfile));
    storage.setItem(BACKUP_KEY, JSON.stringify(validProfile));
    storage.setItem(ATTEMPT_PRIMARY_KEY, JSON.stringify(validAttempt));
    storage.setItem(ATTEMPT_BACKUP_KEY, JSON.stringify(validAttempt));

    clearCalibrationFromStorage();

    expect(storage.getItem(PRIMARY_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
    expect(storage.getItem(ATTEMPT_PRIMARY_KEY)).toBeNull();
    expect(storage.getItem(ATTEMPT_BACKUP_KEY)).toBeNull();
  });

  it("saves and loads calibration attempt records", () => {
    expect(saveCalibrationAttemptToStorage(validAttempt)).toBe(true);
    expect(storage.getItem(ATTEMPT_PRIMARY_KEY)).toEqual(JSON.stringify(validAttempt));
    expect(storage.getItem(ATTEMPT_BACKUP_KEY)).toEqual(JSON.stringify(validAttempt));
    expect(loadCalibrationAttemptFromStorage()).toEqual(validAttempt);
  });

  it("recovers attempt from backup when primary is invalid", () => {
    storage.setItem(ATTEMPT_PRIMARY_KEY, "{ bad json");
    storage.setItem(ATTEMPT_BACKUP_KEY, JSON.stringify(validAttempt));

    expect(loadCalibrationAttemptFromStorage()).toEqual(validAttempt);
    expect(storage.getItem(ATTEMPT_PRIMARY_KEY)).toEqual(JSON.stringify(validAttempt));
  });

  it("loads calibration profile from attempt fallback when profile keys are missing", () => {
    storage.setItem(ATTEMPT_PRIMARY_KEY, JSON.stringify(validAttempt));

    expect(loadCalibrationFromStorage()).toEqual(validProfile);
    expect(storage.getItem(PRIMARY_KEY)).toEqual(JSON.stringify(validProfile));
  });
});

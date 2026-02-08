import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyPointResult, createCalibrationQueue } from "@/components/calibrationSession";
import {
  buildCalibrationProfile,
  buildCalibrationProfileFromPointSamples,
  CALIBRATION_POINTS,
  evaluatePointQuality,
  evaluateValidationFrames,
  type CalibrationSample,
  type ValidationFrame,
  VALIDATION_POINTS
} from "@/lib/gaze/calibration";
import {
  clearCalibrationFromStorage,
  saveCalibrationAttemptToStorage,
  saveCalibrationToStorage
} from "@/lib/gaze/calibrationStorage";
import { classifyDirection } from "@/lib/gaze/classifyDirection";
import type { CalibrationProfile, GazeFeatures } from "@/lib/gaze/types";
import { announceGuidance, stopVoiceAnnouncements } from "@/lib/voice/ttsClient";

export type WizardStatus = "IDLE" | "RUNNING" | "VALIDATING" | "DONE" | "FAILED";
type StageLabel = "Idle" | "Collecting" | "Retrying" | "Validating";

type ActiveDot = {
  label: string;
  hint: string;
  xPct: number;
  yPct: number;
};

const COUNTDOWN_MS = 1000;
const CALIBRATION_COLLECTION_MS = 1200;
const VALIDATION_COLLECTION_MS = 800;
const SAMPLE_INTERVAL_MS = 40;
const MAX_RETRIES = 4;

const CALIBRATION_POINT_BY_ID = new Map(
  CALIBRATION_POINTS.map((point) => [point.pointId, point])
);

function createEmptyPointSamples() {
  return Object.fromEntries(
    CALIBRATION_POINTS.map((point) => [point.pointId, [] as CalibrationSample[]])
  );
}

function pickXY(features: GazeFeatures | null) {
  if (!features) return null;
  if (!Number.isFinite(features.x) || !Number.isFinite(features.y)) return null;
  return { x: features.x, y: features.y };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function promptForCalibrationPoint(label: string, isRetry: boolean) {
  const direction = label.toLowerCase().replace(/\s+/g, " ");
  if (isRetry) {
    return `Retry. Look ${direction}.`;
  }
  return `Look ${direction}.`;
}

function promptForValidationPoint(label: string) {
  const direction = label.replace(/^Validation\s+/i, "").toLowerCase();
  return `Validation. Look ${direction}.`;
}

function getPointSampleCounts(pointSamples: Record<string, CalibrationSample[]>) {
  return Object.fromEntries(
    CALIBRATION_POINTS.map((point) => [point.pointId, pointSamples[point.pointId]?.length ?? 0])
  );
}

export default function CalibrationWizard(props: {
  calibration: CalibrationProfile | null;
  deadzoneMultiplier: number;
  hasFace: boolean;
  hasIris: boolean;
  latestFeatures: GazeFeatures | null;
  onCalibration: (profile: CalibrationProfile | null) => void;
  onStatusChange?: (status: WizardStatus) => void;
}) {
  const [status, setStatus] = useState<WizardStatus>("IDLE");
  const [stageLabel, setStageLabel] = useState<StageLabel>("Idle");
  const [basePointProgress, setBasePointProgress] = useState(0);
  const [validationIndex, setValidationIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeDot, setActiveDot] = useState<ActiveDot | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);

  const liveRef = useRef<{
    canCollect: boolean;
    features: GazeFeatures | null;
  }>({ canCollect: false, features: null });
  const runTokenRef = useRef(0);
  const samplesRef = useRef<Record<string, CalibrationSample[]>>(createEmptyPointSamples());

  const isRunning = status === "RUNNING" || status === "VALIDATING";
  const canCollect = props.hasFace && props.hasIris && !!pickXY(props.latestFeatures);

  useEffect(() => {
    props.onStatusChange?.(status);
  }, [props.onStatusChange, status]);

  useEffect(() => {
    liveRef.current = { canCollect, features: props.latestFeatures };
  }, [canCollect, props.latestFeatures]);

  useEffect(() => {
    if (!isRunning) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isRunning]);

  useEffect(() => {
    return () => {
      runTokenRef.current += 1;
      stopVoiceAnnouncements();
    };
  }, []);

  const waitWithCancel = async (runToken: number, ms: number) => {
    const startedAt = performance.now();
    while (runTokenRef.current === runToken && performance.now() - startedAt < ms) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(50);
    }
  };

  const collectSamples = async (
    runToken: number,
    durationMs: number
  ): Promise<CalibrationSample[]> => {
    const samples: CalibrationSample[] = [];

    const timer = window.setInterval(() => {
      if (runTokenRef.current !== runToken) return;
      const { canCollect: liveCanCollect, features } = liveRef.current;
      if (!liveCanCollect) return;
      const xy = pickXY(features);
      if (!xy) return;
      samples.push(xy);
    }, SAMPLE_INTERVAL_MS);

    const start = performance.now();
    while (runTokenRef.current === runToken && performance.now() - start < durationMs) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(50);
    }

    window.clearInterval(timer);
    return samples;
  };

  const runWizard = async (runToken: number) => {
    let queueState = createCalibrationQueue(
      CALIBRATION_POINTS.map((point) => point.pointId),
      MAX_RETRIES
    );

    let baseProcessed = 0;
    let index = 0;

    while (runTokenRef.current === runToken && index < queueState.queue.length) {
      const item = queueState.queue[index];
      const point = CALIBRATION_POINT_BY_ID.get(item.pointId);
      if (!point) {
        index += 1;
        continue;
      }

      if (!item.isRetry) {
        baseProcessed += 1;
        setBasePointProgress(baseProcessed);
      }

      setStatus("RUNNING");
      setStageLabel(item.isRetry ? "Retrying" : "Collecting");
      setActiveDot({
        label: point.label,
        hint: point.hint,
        xPct: point.xPct,
        yPct: point.yPct
      });
      void announceGuidance(promptForCalibrationPoint(point.label, item.isRetry));

      setCountdown(1);
      await waitWithCancel(runToken, COUNTDOWN_MS);
      if (runTokenRef.current !== runToken) return;
      setCountdown(null);

      const samples = await collectSamples(runToken, CALIBRATION_COLLECTION_MS);
      if (runTokenRef.current !== runToken) return;

      const quality = evaluatePointQuality(samples);
      // Keep latest samples for each point so failed runs are still persisted for diagnostics.
      samplesRef.current[item.pointId] = samples;

      queueState = applyPointResult(queueState, {
        pointId: item.pointId,
        isRetry: item.isRetry,
        accepted: quality.accepted
      });
      setRetryCount(queueState.retryCount);
      index += 1;
    }

    if (runTokenRef.current !== runToken) return;

    const buildResult = buildCalibrationProfileFromPointSamples({
      pointSamples: samplesRef.current,
      deadzoneMultiplier: props.deadzoneMultiplier,
      minSamplesPerBucket: 0
    });
    const profile = buildResult.ok
      ? buildResult.profile
      : buildCalibrationProfile({
          center: [],
          left: [],
          right: [],
          deadzoneMultiplier: props.deadzoneMultiplier
        });
    const bucketCounts = buildResult.ok
      ? buildResult.bucketCounts
      : {
          LEFT: 0,
          CENTER: 0,
          RIGHT: 0
        };

    setStatus("VALIDATING");
    setStageLabel("Validating");
    setValidationIndex(0);

    const validationFrames: ValidationFrame[] = [];

    for (let i = 0; i < VALIDATION_POINTS.length; i++) {
      if (runTokenRef.current !== runToken) return;

      const point = VALIDATION_POINTS[i];
      setValidationIndex(i + 1);
      setActiveDot({
        label: point.label,
        hint: "Validation check: keep head still and look at the dot.",
        xPct: point.xPct,
        yPct: point.yPct
      });
      void announceGuidance(promptForValidationPoint(point.label));

      const samples = await collectSamples(runToken, VALIDATION_COLLECTION_MS);
      if (runTokenRef.current !== runToken) return;

      for (const sample of samples) {
        const classified = classifyDirection({
          features: { x: sample.x, y: sample.y },
          calibration: profile
        });

        validationFrames.push({
          pointId: point.pointId,
          expected: point.expected,
          predicted: classified.direction
        });
      }
    }

    const validation = evaluateValidationFrames(validationFrames, {
      centerPointId: "validation-center",
      minOverallAccuracy: 0.8,
      minCenterAccuracy: 0.7
    });

    if (!validation.passed) {
      const saved = saveCalibrationToStorage(profile);
      const savedAttempt = saveCalibrationAttemptToStorage({
        version: 1,
        attemptedAt: new Date().toISOString(),
        status: "FAILED",
        reason: "VALIDATION_FAILED",
        profile,
        pointSampleCounts: getPointSampleCounts(samplesRef.current),
        retryCount: queueState.retryCount,
        failedPointIds: Array.from(queueState.failedPointIds),
        bucketCounts,
        validation: {
          passed: validation.passed,
          overallAccuracy: validation.overallAccuracy,
          centerAccuracy: validation.centerAccuracy,
          frameCount: validation.frameCount,
          centerFrameCount: validation.centerFrameCount
        }
      });
      if (!saved && !savedAttempt) {
        setStorageWarning(
          "Calibration quality was low and saving profile/run details failed. Check browser storage settings."
        );
      } else if (!saved) {
        setStorageWarning(
          "Calibration quality was low and profile save failed. Check browser storage settings."
        );
      } else if (!savedAttempt) {
        setStorageWarning(
          "Calibration quality was low. Profile saved, but saving run details failed."
        );
      } else {
        setStorageWarning(
          "Calibration saved with low quality. Rerun is recommended for better accuracy."
        );
      }
      setStatus("DONE");
      setStageLabel("Idle");
      setCountdown(null);
      setActiveDot(null);
      setFailureMessage(
        `Calibration quality low (${Math.round(validation.overallAccuracy * 100)}% overall, ${Math.round(validation.centerAccuracy * 100)}% center). Rerun recommended.`
      );
      props.onCalibration(profile);
      void announceGuidance(
        "Calibration saved, but quality was low. Please rerun in better lighting."
      );
      return;
    }

    const saved = saveCalibrationToStorage(profile);
    const savedAttempt = saveCalibrationAttemptToStorage({
      version: 1,
      attemptedAt: new Date().toISOString(),
      status: "SUCCESS",
      reason: "OK",
      profile,
      pointSampleCounts: getPointSampleCounts(samplesRef.current),
      retryCount: queueState.retryCount,
      failedPointIds: Array.from(queueState.failedPointIds),
      bucketCounts,
      validation: {
        passed: validation.passed,
        overallAccuracy: validation.overallAccuracy,
        centerAccuracy: validation.centerAccuracy,
        frameCount: validation.frameCount,
        centerFrameCount: validation.centerFrameCount
      }
    });
    if (!saved && !savedAttempt) {
      setStorageWarning(
        "Calibration completed, but saving profile and run details to local storage failed."
      );
    } else if (!saved) {
      setStorageWarning(
        "Calibration completed, but saving profile to local storage failed. Check browser storage settings."
      );
    } else if (!savedAttempt) {
      setStorageWarning(
        "Calibration completed, but saving run details to local storage failed."
      );
    } else {
      setStorageWarning(null);
    }
    setFailureMessage(null);
    props.onCalibration(profile);
    setStatus("DONE");
    setStageLabel("Idle");
    setActiveDot(null);
    setCountdown(null);
    void announceGuidance("Calibration complete.");
  };

  const startWizard = () => {
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;

    samplesRef.current = createEmptyPointSamples();
    setStorageWarning(null);
    setFailureMessage(null);
    setBasePointProgress(0);
    setValidationIndex(0);
    setRetryCount(0);
    setCountdown(null);
    setActiveDot(null);
    setStatus("RUNNING");
    setStageLabel("Collecting");
    void announceGuidance("Calibration started. Keep your head still and follow each dot.");

    void runWizard(runToken);
  };

  const cancelWizard = () => {
    runTokenRef.current += 1;
    setStatus("IDLE");
    setStageLabel("Idle");
    setCountdown(null);
    setActiveDot(null);
    setValidationIndex(0);
    stopVoiceAnnouncements();
  };

  const reset = () => {
    cancelWizard();
    clearCalibrationFromStorage();
    samplesRef.current = createEmptyPointSamples();
    setStorageWarning(null);
    setFailureMessage(null);
    setBasePointProgress(0);
    setRetryCount(0);
    props.onCalibration(null);
  };

  const statusLine = useMemo(() => {
    if (status === "RUNNING") {
      const shownPoint = Math.max(1, Math.min(basePointProgress, CALIBRATION_POINTS.length));
      return `Point ${shownPoint}/${CALIBRATION_POINTS.length} • ${stageLabel}`;
    }
    if (status === "VALIDATING") {
      return `Validation ${Math.max(validationIndex, 1)}/${VALIDATION_POINTS.length} • ${stageLabel}`;
    }
    if (status === "FAILED") {
      return "Calibration failed";
    }
    if (status === "DONE") {
      return "Calibration completed.";
    }
    return "Run calibration for stable LEFT/RIGHT/CENTER.";
  }, [basePointProgress, stageLabel, status, validationIndex]);

  return (
    <>
      {isRunning && activeDot && (
        <div className="fixed inset-0 z-50">
          <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-3 border-b border-white/20 bg-black/30 p-3 backdrop-blur-[2px]">
            <div className="flex flex-col">
              <div className="text-base font-medium text-white">
                {status === "VALIDATING"
                  ? `Validating — ${validationIndex}/${VALIDATION_POINTS.length}`
                  : `Calibrating — Point ${Math.max(basePointProgress, 1)}/${CALIBRATION_POINTS.length}`} {" "}
                <span className="text-white/80">({stageLabel})</span>
              </div>
              <div className="text-sm text-white/85">{activeDot.hint}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-white/85">
                {canCollect ? "Tracking OK" : "Need face + iris"}
              </div>
              <Button variant="outline" onClick={cancelWizard}>
                Cancel
              </Button>
            </div>
          </div>

          <div className="absolute inset-0">
            <div className="pointer-events-none absolute inset-0 bg-black/25" />
            <div
              className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_0_16px_rgba(52,211,153,0.24)]"
              style={{ left: `${activeDot.xPct}%`, top: `${activeDot.yPct}%` }}
            />
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white">
                {countdown}
              </div>
            )}

            <div className="absolute bottom-5 left-1/2 w-[min(640px,92vw)] -translate-x-1/2 rounded-xl border border-white/20 bg-black/30 p-4 text-center backdrop-blur-[2px]">
              <div className="text-base text-white">
                Keep your head still; move only your eyes.
              </div>
              <div className="mt-1 text-sm text-white/85">
                Tip: sit closer and increase lighting for better iris detection.
              </div>
              <div className="mt-2 text-xs text-white/80">
                9 points + adaptive retries, then quick validation.
              </div>
              <div className="mt-2 text-xs text-white/80">
                Retry {retryCount}/{MAX_RETRIES}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Calibration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-base text-foreground">
              <div className="font-medium">
                {props.calibration ? "Calibrated" : "Not calibrated"}
              </div>
              <div className="mt-1 text-sm text-muted">{statusLine}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={startWizard} disabled={!canCollect || isRunning}>
                {isRunning ? "Running..." : "Start"}
              </Button>
              <Button variant="outline" onClick={reset} disabled={isRunning}>
                Reset
              </Button>
            </div>
          </div>

          {!canCollect && (
            <div className="rounded-md border border-border bg-cardStrong p-3 text-sm text-muted">
              Need camera running + face + iris landmarks to calibrate.
            </div>
          )}

          {failureMessage && (
            <div className="rounded-md border border-danger bg-cardStrong p-3 text-sm text-foreground">
              {failureMessage}
            </div>
          )}

          {storageWarning && (
            <div className="rounded-md border border-warning bg-cardStrong p-3 text-sm text-foreground">
              {storageWarning}
            </div>
          )}

          <div className="rounded-md border border-border bg-cardStrong p-3 text-sm text-muted">
            Calibration runs in a full-screen live camera view with debug overlay and voice guidance enabled.
          </div>

          {props.calibration && (
            <div className="text-sm text-muted">
              Saved in localStorage ({new Date(props.calibration.createdAt).toLocaleString()}).
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

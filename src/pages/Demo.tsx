import { useEffect, useMemo, useRef, useState } from "react";
import CameraView, { type CameraStatus } from "@/components/CameraView";
import type { FacingMode } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import type { CalibrationProfile, GazeOutput } from "@/lib/gaze/types";
import {
  appendAndGetDominantIntentDirection,
  type IntentSample,
  type IntentDirection
} from "@/lib/gaze/intentFilter";
import { announceSelection } from "@/lib/voice/ttsClient";
import type { DemoMetricEvent, DemoScenario } from "@/features/impact/types";

type DemoAction = {
  id: string;
  label: string;
  emoji: string;
  hint: string;
};

type DemoScreen = "home" | "choose" | "sent";
type Side = "left" | "right";
type DirectionInput = IntentDirection;
type PendingAction = "select_left" | "select_right" | "confirm_send" | "next_pair";

const ACTIONS: DemoAction[] = [
  { id: "water", label: "Water", emoji: "💧", hint: "I need a drink" },
  { id: "nurse", label: "Call nurse", emoji: "🧑‍⚕️", hint: "Please come help" },
  { id: "pain", label: "Pain", emoji: "😖", hint: "I am in pain" },
  { id: "bathroom", label: "Bathroom", emoji: "🚻", hint: "I need the bathroom" },
  { id: "reposition", label: "Reposition", emoji: "🛏️", hint: "Help me change position" },
  { id: "hot", label: "Too hot", emoji: "🥵", hint: "It feels too warm" }
];

const PAIRS: [DemoAction, DemoAction][] = [
  [ACTIONS[0], ACTIONS[1]],
  [ACTIONS[2], ACTIONS[3]],
  [ACTIONS[4], ACTIONS[5]]
];

const ACTION_SPEECH_LABEL: Record<DemoAction["id"], string> = {
  water: "Water",
  nurse: "Nurse",
  pain: "Pain",
  bathroom: "Bathroom",
  reposition: "Reposition",
  hot: "Hot"
};

const HOME_AUTO_MS = 1500;
const SENT_AUTO_MS = 2000;
const STABILITY_MS = 250;
const SELECT_DWELL_MS = 3750;
const CENTER_NEXT_DWELL_MS = 2750;
const CENTER_CONFIRM_DWELL_MS = 2750;
const ACTION_LOCKOUT_MS = 350;
const MIN_SIDE_CONFIDENCE = 0.45;
const DIRECTION_AVERAGE_WINDOW_MS = 2000;

function actionForDirection(direction: DirectionInput, selectedSide: Side | null): PendingAction | null {
  if (direction === "LEFT") return selectedSide === "left" ? null : "select_left";
  if (direction === "RIGHT") return selectedSide === "right" ? null : "select_right";
  if (direction === "CENTER") return selectedSide ? "confirm_send" : "next_pair";
  return null;
}

function dwellMsForAction(action: PendingAction): number {
  if (action === "select_left" || action === "select_right") return SELECT_DWELL_MS;
  if (action === "next_pair") return CENTER_NEXT_DWELL_MS;
  return CENTER_CONFIRM_DWELL_MS;
}

export default function Demo(props: {
  onExit: () => void;
  calibration: CalibrationProfile | null;
  facingMode: FacingMode;
  smoothingWindow: number;
  deadzoneMultiplier: number;
  scenario?: DemoScenario;
  onMetricEvent?: (event: DemoMetricEvent) => void;
}) {
  const [demoRunning, setDemoRunning] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [screen, setScreen] = useState<DemoScreen>("home");
  const [pairIndex, setPairIndex] = useState(0);
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [sentAction, setSentAction] = useState<DemoAction | null>(null);

  const [gazeOutput, setGazeOutput] = useState<GazeOutput>({
    direction: "NO_FACE",
    confidence: 0
  });
  const [trackingFlags, setTrackingFlags] = useState({
    hasFace: false,
    hasIris: false
  });
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("STOPPED");
  const [debugDirection, setDebugDirection] = useState<DirectionInput>("NONE");
  const [averagedDirection, setAveragedDirection] = useState<DirectionInput>("NONE");
  const directionHistoryRef = useRef<IntentSample[]>([]);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  const [pendingProgress, setPendingProgress] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [requireNeutral, setRequireNeutral] = useState(false);
  const startedRef = useRef(false);
  const recoveryReasonRef = useRef<"no_face" | "no_iris" | null>(null);
  const scenario: DemoScenario = props.scenario ?? "default";

  const pair = PAIRS[pairIndex];
  const selectedAction = selectedSide === "left" ? pair[0] : selectedSide === "right" ? pair[1] : null;

  const centerProgress =
    pendingAction === "confirm_send" || pendingAction === "next_pair" ? pendingProgress : 0;
  const centerSelecting = pendingAction === "confirm_send" || pendingAction === "next_pair";
  const leftProgress = pendingAction === "select_left" ? pendingProgress : 0;
  const rightProgress = pendingAction === "select_right" ? pendingProgress : 0;

  const modelDirection = useMemo<DirectionInput>(() => {
    if (!demoRunning) return "NONE";
    if (!props.calibration || cameraStatus !== "RUNNING") return "NONE";
    if (!trackingFlags.hasFace || !trackingFlags.hasIris) return "NONE";

    if (gazeOutput.direction === "LEFT" || gazeOutput.direction === "RIGHT") {
      return gazeOutput.confidence >= MIN_SIDE_CONFIDENCE ? gazeOutput.direction : "NONE";
    }

    if (gazeOutput.direction === "CENTER") return "CENTER";
    return "NONE";
  }, [
    cameraStatus,
    demoRunning,
    gazeOutput.confidence,
    gazeOutput.direction,
    props.calibration,
    trackingFlags.hasFace,
    trackingFlags.hasIris
  ]);

  useEffect(() => {
    if (!demoRunning || screen !== "choose") {
      directionHistoryRef.current = [];
      setAveragedDirection("NONE");
      return;
    }

    const dominantDirection = appendAndGetDominantIntentDirection({
      samples: directionHistoryRef.current,
      nextDirection: modelDirection,
      nowMs: performance.now(),
      windowMs: DIRECTION_AVERAGE_WINDOW_MS
    });

    setAveragedDirection(dominantDirection);
  }, [demoRunning, modelDirection, screen]);

  const activeDirection = debugDirection !== "NONE" ? debugDirection : averagedDirection;

  const statusText = useMemo<string | null>(() => {
    if (!demoRunning) return "Demo paused. Press Start Demo.";
    if (!props.calibration) return "Calibration required. Use the calibration screen first.";
    if (cameraStatus === "STARTING") return "Starting camera...";
    if (cameraStatus === "NO_CAMERA") return "Camera permission is required.";
    if (cameraStatus === "MODEL_ERROR") return "Vision model failed to load.";
    if (cameraStatus === "STOPPED") return "Starting tracking...";
    if (!trackingFlags.hasFace) return "Position your face in view.";
    if (!trackingFlags.hasIris) return "Eyes not detected. Increase lighting or move closer.";
    return null;
  }, [
    cameraStatus,
    demoRunning,
    props.calibration,
    trackingFlags.hasFace,
    trackingFlags.hasIris
  ]);

  const chooseHeading = useMemo(() => {
    if (selectedAction) {
      return `${selectedAction.emoji} ${selectedAction.label} selected`;
    }
    return "Look left or right";
  }, [selectedAction]);

  const showLoadingRing = useMemo(() => {
    if (!demoRunning) return false;
    if (!props.calibration) return false;
    if (cameraStatus === "STARTING" || cameraStatus === "STOPPED") return true;
    if (cameraStatus === "RUNNING" && (!trackingFlags.hasFace || !trackingFlags.hasIris)) return true;
    return false;
  }, [cameraStatus, demoRunning, props.calibration, trackingFlags.hasFace, trackingFlags.hasIris]);

  const resetPending = () => {
    setPendingAction(null);
    setPendingStartedAt(null);
    setPendingProgress(0);
  };

  const announceIfEnabled = (message: string) => {
    if (!voiceEnabled) return;
    void announceSelection(message);
  };

  const actionSpeechLabel = (action: DemoAction) => {
    return ACTION_SPEECH_LABEL[action.id] ?? action.label;
  };

  const selectionSpeech = (action: DemoAction) => {
    return `${actionSpeechLabel(action)} selected`;
  };

  const confirmationSpeech = (action: DemoAction) => {
    return `Confirmed. Sending ${action.label.toLowerCase()} request.`;
  };

  const goToChoose = (nextPair: boolean) => {
    setScreen("choose");
    setSelectedSide(null);
    resetPending();
    if (nextPair) setPairIndex((v) => (v + 1) % PAIRS.length);
  };

  const sendSelection = () => {
    if (!selectedAction) return;
    setSentAction(selectedAction);
    setScreen("sent");
    announceIfEnabled(confirmationSpeech(selectedAction));
    props.onMetricEvent?.({
      type: "request_confirmed",
      atMs: performance.now(),
      actionId: selectedAction.id
    });
    resetPending();
    setCooldownUntil(performance.now() + ACTION_LOCKOUT_MS);
    setRequireNeutral(true);
  };

  const commitAction = (action: PendingAction) => {
    if (action === "select_left") {
      setSelectedSide("left");
      announceIfEnabled(selectionSpeech(pair[0]));
      props.onMetricEvent?.({
        type: "selection_attempt",
        side: "left",
        atMs: performance.now()
      });
    } else if (action === "select_right") {
      setSelectedSide("right");
      announceIfEnabled(selectionSpeech(pair[1]));
      props.onMetricEvent?.({
        type: "selection_attempt",
        side: "right",
        atMs: performance.now()
      });
    } else if (action === "next_pair") {
      setPairIndex((v) => (v + 1) % PAIRS.length);
      setSelectedSide(null);
    } else if (action === "confirm_send") {
      sendSelection();
    }
    resetPending();
    setCooldownUntil(performance.now() + ACTION_LOCKOUT_MS);
    setRequireNeutral(true);
  };

  useEffect(() => {
    if (!demoRunning) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    props.onMetricEvent?.({ type: "demo_started", atMs: performance.now() });
  }, [demoRunning, props.onMetricEvent]);

  useEffect(() => {
    if (!demoRunning) {
      recoveryReasonRef.current = null;
      return;
    }

    let reason: "no_face" | "no_iris" | null = null;
    if (cameraStatus === "RUNNING") {
      if (!trackingFlags.hasFace) reason = "no_face";
      else if (!trackingFlags.hasIris) reason = "no_iris";
    }

    if (reason && recoveryReasonRef.current !== reason) {
      props.onMetricEvent?.({
        type: "recovery_prompt",
        atMs: performance.now(),
        reason
      });
    }
    recoveryReasonRef.current = reason;
  }, [
    cameraStatus,
    demoRunning,
    props.onMetricEvent,
    trackingFlags.hasFace,
    trackingFlags.hasIris
  ]);

  useEffect(() => {
    if (!demoRunning) return;
    if (screen !== "home") return;
    const timer = window.setTimeout(() => {
      goToChoose(false);
    }, HOME_AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [demoRunning, screen]);

  useEffect(() => {
    if (!demoRunning) return;
    if (screen !== "sent") return;
    const timer = window.setTimeout(() => {
      goToChoose(true);
    }, SENT_AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [demoRunning, screen]);

  useEffect(() => {
    if (!demoRunning) return;
    if (screen !== "choose") return;
    const timer = window.setInterval(() => {
      const now = performance.now();

      if (now < cooldownUntil) return;

      if (requireNeutral) {
        if (activeDirection === "NONE") {
          setRequireNeutral(false);
        } else {
          if (pendingAction !== null || pendingStartedAt !== null || pendingProgress !== 0) {
            resetPending();
          }
          return;
        }
      }

      const nextAction = actionForDirection(activeDirection, selectedSide);
      if (!nextAction) {
        if (pendingAction !== null || pendingStartedAt !== null || pendingProgress !== 0) {
          resetPending();
        }
        return;
      }

      if (pendingAction !== nextAction) {
        setPendingAction(nextAction);
        setPendingStartedAt(now);
        setPendingProgress(0);
        return;
      }

      if (pendingStartedAt === null) {
        setPendingStartedAt(now);
        setPendingProgress(0);
        return;
      }

      const elapsed = now - pendingStartedAt;
      const stableElapsed = elapsed - STABILITY_MS;
      if (stableElapsed <= 0) {
        if (pendingProgress !== 0) setPendingProgress(0);
        return;
      }

      const progress = Math.min(1, stableElapsed / dwellMsForAction(nextAction));
      setPendingProgress(progress);

      if (progress >= 1) {
        commitAction(nextAction);
      }
    }, 16);

    return () => window.clearInterval(timer);
  }, [
    activeDirection,
    cooldownUntil,
    demoRunning,
    pendingAction,
    pendingProgress,
    pendingStartedAt,
    requireNeutral,
    screen,
    selectedSide
  ]);

  const stopDemo = () => {
    setDemoRunning(false);
    setScreen("home");
    setSelectedSide(null);
    setSentAction(null);
    setDebugDirection("NONE");
    setRequireNeutral(false);
    setCooldownUntil(0);
    directionHistoryRef.current = [];
    setAveragedDirection("NONE");
    resetPending();
  };

  const startDemo = () => {
    setDemoRunning(true);
    setScreen("home");
    setSelectedSide(null);
    setSentAction(null);
    setDebugDirection("NONE");
    setRequireNeutral(false);
    setCooldownUntil(0);
    directionHistoryRef.current = [];
    setAveragedDirection("NONE");
    resetPending();
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const toDirection = (key: string): DirectionInput | null => {
      if (key === "ArrowLeft") return "LEFT";
      if (key === "ArrowRight") return "RIGHT";
      if (key === "ArrowUp") return "CENTER";
      return null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key === "Escape") {
        event.preventDefault();
        props.onExit();
        return;
      }

      const direction = toDirection(event.key);
      if (!direction) return;

      event.preventDefault();
      setDebugDirection(direction);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const direction = toDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      setDebugDirection((prev) => (prev === direction ? "NONE" : prev));
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [props.onExit]);

  const centerRingStyle = useMemo(() => {
    return {
      background: `conic-gradient(from -90deg, rgb(5 150 105) ${centerProgress * 360}deg, transparent 0deg)`,
      WebkitMask:
        "radial-gradient(farthest-side, transparent calc(100% - 6px), black calc(100% - 5px))",
      mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), black calc(100% - 5px))"
    };
  }, [centerProgress]);

  const centerGlowStyle = useMemo(() => {
    if (!centerSelecting) return undefined;
    return {
      boxShadow: `0 0 ${12 + centerProgress * 20}px rgba(5, 150, 105, ${0.2 + centerProgress * 0.45})`
    };
  }, [centerProgress, centerSelecting]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-50 text-slate-900">
      {demoRunning && (
        <CameraView
          calibration={props.calibration}
          deadzoneMultiplier={props.deadzoneMultiplier}
          facingMode={props.facingMode}
          smoothingWindow={props.smoothingWindow}
          showOverlay={false}
          autoStart
          hideUi
          onStatusChange={setCameraStatus}
          onGazeOutput={setGazeOutput}
          onTracking={(payload) =>
            setTrackingFlags({
              hasFace: payload.hasFace,
              hasIris: payload.hasIris
            })
          }
        />
      )}
      <div className="flex h-full w-full flex-col px-2 py-2 sm:px-3 sm:py-3">
        {scenario === "impact_night_request" && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-slate-800">
            Scenario: night-time help request in an under-resourced care setting.
          </div>
        )}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm text-slate-700">Eye Communication Demo</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={demoRunning ? "secondary" : "default"}
              onClick={demoRunning ? stopDemo : startDemo}
            >
              {demoRunning ? "Stop Demo" : "Start Demo"}
            </Button>
            <Button
              size="sm"
              variant={voiceEnabled ? "secondary" : "outline"}
              onClick={() => setVoiceEnabled((enabled) => !enabled)}
            >
              Voice {voiceEnabled ? "On" : "Off"}
            </Button>
            <Button size="sm" onClick={props.onExit}>
              Calibration
            </Button>
          </div>
        </div>
        {statusText && (
          <div className="mb-2 flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg text-slate-900">
            {showLoadingRing && (
              <div className="size-7 animate-spin rounded-full border-[3px] border-slate-300 border-t-emerald-600" />
            )}
            <span>{statusText}</span>
          </div>
        )}

        {screen === "home" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-[clamp(2.75rem,7vh,5.5rem)] font-bold tracking-tight">What do you need?</h1>
            <p className="text-[clamp(1.3rem,2.9vh,2.4rem)] text-slate-700">
              Look LEFT or RIGHT to choose. Look CENTER to send.
            </p>
            {scenario === "impact_night_request" && (
              <p className="text-[clamp(1rem,2.1vh,1.4rem)] text-slate-700">
                Goal: equal response speed regardless of race or facility resources.
              </p>
            )}
          </div>
        )}

        {screen === "choose" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 text-center">
              <h2 className="font-semibold" style={{ fontSize: "clamp(2.8rem, 6vh, 5.5rem)" }}>
                {chooseHeading}
              </h2>
            </div>

            <div
              className="grid min-h-0 flex-1 gap-2"
              style={{ gridTemplateColumns: "minmax(0, 35fr) minmax(0, 30fr) minmax(0, 35fr)" }}
            >
              {(() => {
                const item = pair[0];
                const selected = selectedSide === "left";
                const selecting = pendingAction === "select_left";
                const progress = leftProgress;
                const ringStyle = {
                  background: `conic-gradient(from -90deg, rgb(14 165 233) ${progress * 360}deg, rgb(226 232 240) 0deg)`
                };
                const glowStyle = selecting
                  ? {
                      boxShadow: `0 0 ${12 + progress * 18}px rgba(14, 165, 233, ${0.2 + progress * 0.45})`
                    }
                  : undefined;
                return (
                  <div
                    className={`relative flex h-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 px-3 py-3 text-center transition sm:px-4 sm:py-4 ${
                      selected
                        ? "border-emerald-700 bg-emerald-100 ring-4 ring-emerald-300"
                        : "border-slate-300 bg-white"
                    }`}
                    style={glowStyle}
                    onPointerDown={import.meta.env.DEV ? () => setDebugDirection("LEFT") : undefined}
                    onPointerUp={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
                    onPointerLeave={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
                  >
                    {selecting && (
                      <div
                        className="pointer-events-none absolute inset-0 z-0 rounded-3xl p-[6px]"
                        style={ringStyle}
                      >
                        <div
                          className={`h-full w-full rounded-[calc(1.5rem-6px)] ${
                            selected ? "bg-emerald-100" : "bg-white"
                          }`}
                        />
                      </div>
                    )}
                    <div className="relative z-10">
                      <div className="leading-none" style={{ fontSize: "clamp(7rem, 18vh, 12rem)" }}>
                        {item.emoji}
                      </div>
                      <div className="mt-2 font-semibold leading-tight" style={{ fontSize: "clamp(3.2rem, 7vh, 6rem)" }}>
                        {item.label}
                      </div>
                      <div className="mt-1 text-slate-700" style={{ fontSize: "clamp(1.8rem, 3.8vh, 3rem)" }}>
                        {item.hint}
                      </div>
                      <div className="mt-2 uppercase tracking-wider text-slate-600" style={{ fontSize: "clamp(1rem, 2.2vh, 1.6rem)" }}>
                        LEFT option
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div
                className="relative flex h-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-300 bg-white px-3 py-3 text-center sm:px-4 sm:py-4"
                onPointerDown={import.meta.env.DEV ? () => setDebugDirection("CENTER") : undefined}
                onPointerUp={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
                onPointerLeave={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
              >
                <div
                  className="relative grid place-items-center rounded-full p-[6px] transition-[box-shadow] duration-150 ease-linear"
                  style={{
                    ...(centerGlowStyle ?? {}),
                    width: "clamp(12rem, 26vh, 17rem)",
                    height: "clamp(12rem, 26vh, 17rem)"
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-full border-[6px] border-slate-300" />
                  {centerSelecting && (
                    <div className="pointer-events-none absolute inset-0 rounded-full" style={centerRingStyle} />
                  )}
                  {showLoadingRing && (
                    <div className="pointer-events-none absolute inset-0 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-600" />
                  )}
                  <div className="relative z-10 grid size-full place-items-center rounded-full bg-white text-center">
                    <div className="uppercase tracking-widest text-slate-700" style={{ fontSize: "clamp(1rem, 2vh, 1.5rem)" }}>
                      CENTER
                    </div>
                    <div className="font-semibold" style={{ fontSize: "clamp(2rem, 4vh, 3rem)" }}>
                      {selectedAction ? "Send" : "Next"}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-slate-700" style={{ fontSize: "clamp(1.5rem, 3vh, 2.2rem)" }}>
                  {selectedAction ? "Hold center to send selected request." : "Hold center to move to next pair."}
                </p>
              </div>

              {(() => {
                const item = pair[1];
                const selected = selectedSide === "right";
                const selecting = pendingAction === "select_right";
                const progress = rightProgress;
                const ringStyle = {
                  background: `conic-gradient(from -90deg, rgb(14 165 233) ${progress * 360}deg, rgb(226 232 240) 0deg)`
                };
                const glowStyle = selecting
                  ? {
                      boxShadow: `0 0 ${12 + progress * 18}px rgba(14, 165, 233, ${0.2 + progress * 0.45})`
                    }
                  : undefined;
                return (
                  <div
                    className={`relative flex h-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 px-3 py-3 text-center transition sm:px-4 sm:py-4 ${
                      selected
                        ? "border-emerald-700 bg-emerald-100 ring-4 ring-emerald-300"
                        : "border-slate-300 bg-white"
                    }`}
                    style={glowStyle}
                    onPointerDown={import.meta.env.DEV ? () => setDebugDirection("RIGHT") : undefined}
                    onPointerUp={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
                    onPointerLeave={import.meta.env.DEV ? () => setDebugDirection("NONE") : undefined}
                  >
                    {selecting && (
                      <div
                        className="pointer-events-none absolute inset-0 z-0 rounded-3xl p-[6px]"
                        style={ringStyle}
                      >
                        <div
                          className={`h-full w-full rounded-[calc(1.5rem-6px)] ${
                            selected ? "bg-emerald-100" : "bg-white"
                          }`}
                        />
                      </div>
                    )}
                    <div className="relative z-10">
                      <div className="leading-none" style={{ fontSize: "clamp(7rem, 18vh, 12rem)" }}>
                        {item.emoji}
                      </div>
                      <div className="mt-2 font-semibold leading-tight" style={{ fontSize: "clamp(3.2rem, 7vh, 6rem)" }}>
                        {item.label}
                      </div>
                      <div className="mt-1 text-slate-700" style={{ fontSize: "clamp(1.8rem, 3.8vh, 3rem)" }}>
                        {item.hint}
                      </div>
                      <div className="mt-2 uppercase tracking-wider text-slate-600" style={{ fontSize: "clamp(1rem, 2.2vh, 1.6rem)" }}>
                        RIGHT option
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {screen === "sent" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-[clamp(2.4rem,5.8vh,4.8rem)] font-semibold text-emerald-700">Request sent</h2>
            <p className="text-[clamp(2.1rem,5.2vh,3.8rem)]">
              {sentAction?.emoji} {sentAction?.label}
            </p>
            <p className="text-[clamp(1.2rem,2.6vh,1.7rem)] text-slate-700">Preparing next options...</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import CameraView, { type CameraStatus } from "@/components/CameraView";
import CalibrationWizard from "@/components/CalibrationWizard";
import type { SettingsState } from "@/components/SettingsPanel";
import Alert from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import Progress from "@/components/ui/progress";
import ScreenHeader from "@/components/ui/screen-header";
import Stepper from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import type { CalibrationProfile, GazeFeatures, GazeOutput } from "@/lib/gaze/types";
import {
  createInitialOnboardingState,
  isStepCompleteAllowed,
  nextOnboardingStep,
  previousOnboardingStep,
  setOnboardingCalibrationCompleted,
  setOnboardingCaregiverAssist
} from "./stateMachine";
import type { OnboardingCompletion, OnboardingState, OnboardingStepId } from "./types";

const STEP_LABELS: Record<OnboardingStepId, string> = {
  welcome: "Welcome",
  readiness: "Readiness",
  permissions: "Permissions",
  "eye-training": "Eye training",
  calibration: "Calibration",
  validation: "Validation",
  "impact-summary": "Impact",
  complete: "Complete"
};

type Props = {
  calibration: CalibrationProfile | null;
  settings: SettingsState;
  onCalibration: (profile: CalibrationProfile | null) => void;
  onFinish: (completion: OnboardingCompletion) => void;
  onSkip: () => void;
  onStartImpactDemo: () => void;
  allowSkip: boolean;
};

function primaryLabel(step: OnboardingStepId, calibrationDone: boolean) {
  if (step === "welcome") return "Start setup";
  if (step === "readiness") return "Continue";
  if (step === "permissions") return "I understand";
  if (step === "eye-training") return "Continue to calibration";
  if (step === "calibration") return calibrationDone ? "Continue" : "Finish calibration first";
  if (step === "validation") return "Continue";
  if (step === "impact-summary") return "I am ready";
  return "Go to workspace";
}

export default function OnboardingFlow(props: Props) {
  const [state, setState] = useState<OnboardingState>(() =>
    createInitialOnboardingState({
      calibrationCompleted: Boolean(props.calibration)
    })
  );
  const [cameraCheckEnabled, setCameraCheckEnabled] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("STOPPED");
  const [wizardStatus, setWizardStatus] = useState<
    "IDLE" | "RUNNING" | "VALIDATING" | "DONE" | "FAILED"
  >("IDLE");
  const [latestFeatures, setLatestFeatures] = useState<GazeFeatures | null>(null);
  const [trackingFlags, setTrackingFlags] = useState({
    hasFace: false,
    hasIris: false
  });
  const [latestOutput, setLatestOutput] = useState<GazeOutput>({
    direction: "NO_FACE",
    confidence: 0
  });
  const calibrationRunning = wizardStatus === "RUNNING" || wizardStatus === "VALIDATING";

  useEffect(() => {
    const complete = Boolean(props.calibration);
    setState((current) => setOnboardingCalibrationCompleted(current, complete));
  }, [props.calibration]);

  const canMoveForward = isStepCompleteAllowed(state);
  const completionPct = Math.round((state.stepIndex / 7) * 100);
  const stepNames = useMemo(
    () => [
      STEP_LABELS.welcome,
      STEP_LABELS.readiness,
      STEP_LABELS.permissions,
      STEP_LABELS["eye-training"],
      STEP_LABELS.calibration,
      STEP_LABELS.validation,
      STEP_LABELS["impact-summary"],
      STEP_LABELS.complete
    ],
    []
  );

  const onPrimary = () => {
    if (state.step === "complete") {
      props.onFinish({
        caregiverAssist: state.caregiverAssist,
        onboardingDurationMs: Date.now() - state.startedAtMs
      });
      return;
    }
    if (state.step === "calibration" && !state.calibrationCompleted) return;
    setState((current) => nextOnboardingStep(current));
  };

  const onBack = () => {
    if (state.stepIndex === 0) return;
    setState((current) => previousOnboardingStep(current));
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7">
      <ScreenHeader
        title="Welcome to Hands-Free Care Requests"
        subtitle="This setup is made for elders. Large text, clear steps, and calm guidance."
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{STEP_LABELS[state.step]}</CardTitle>
            <div className="text-sm font-semibold text-muted">{completionPct}% complete</div>
          </div>
          <Progress value={completionPct} />
          <Stepper steps={stepNames} activeStep={state.stepIndex} />
        </CardHeader>
        <CardContent className="space-y-4">
          {state.step === "welcome" && (
            <>
              <Alert tone="info" title="Goal">
                Use your eyes to request help quickly, even if speaking is hard.
              </Alert>
              <Field
                label="Caregiver assist mode"
                description="Turn this on if a caregiver is helping with setup."
                control={
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                    <div className="text-sm text-muted">
                      {state.caregiverAssist ? "Caregiver mode is on." : "Caregiver mode is off."}
                    </div>
                    <Switch
                      checked={state.caregiverAssist}
                      onCheckedChange={(checked) =>
                        setState((current) => setOnboardingCaregiverAssist(current, checked))
                      }
                    />
                  </div>
                }
              />
            </>
          )}

          {state.step === "readiness" && (
            <>
              <Alert tone="success" title="Before we begin">
                Sit in front of the screen, keep light on your face, and keep your head still.
              </Alert>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-xl font-semibold">1. Lighting</div>
                    <p className="text-sm text-muted">Use bright, even light on your face.</p>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-xl font-semibold">2. Position</div>
                    <p className="text-sm text-muted">Keep your face centered in the camera view.</p>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-xl font-semibold">3. Comfort</div>
                    <p className="text-sm text-muted">Move only your eyes during calibration.</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {state.step === "permissions" && (
            <>
              <Alert title="Camera permission needed">
                Press "Start camera check", then allow camera access in the browser prompt.
              </Alert>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setCameraCheckEnabled(true)}>Start camera check</Button>
                {cameraCheckEnabled && (
                  <div className="text-sm text-muted">Status: {cameraStatus}</div>
                )}
              </div>
              {cameraCheckEnabled && (
                <CameraView
                  calibration={props.calibration}
                  deadzoneMultiplier={props.settings.deadzoneMultiplier}
                  facingMode={props.settings.facingMode}
                  smoothingWindow={props.settings.smoothingWindow}
                  showOverlay={false}
                  autoStart
                  onStatusChange={setCameraStatus}
                  onGazeOutput={setLatestOutput}
                  onTracking={(payload) => {
                    setLatestFeatures(payload.features ?? null);
                    setTrackingFlags({ hasFace: payload.hasFace, hasIris: payload.hasIris });
                  }}
                />
              )}
              {cameraCheckEnabled && (
                <Alert tone={cameraStatus === "RUNNING" ? "success" : "warning"}>
                  {cameraStatus === "RUNNING"
                    ? "Camera is active. You can continue."
                    : "If camera does not start, check browser permissions and refresh once."}
                </Alert>
              )}
            </>
          )}

          {state.step === "eye-training" && (
            <>
              <Alert title="Practice eye controls">
                Look left or right to choose an option. Look center to confirm.
              </Alert>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-4xl leading-none">⬅</div>
                    <div className="mt-2 text-lg font-semibold">Look left</div>
                    <p className="text-sm text-muted">Select the left option.</p>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-4xl leading-none">➡</div>
                    <div className="mt-2 text-lg font-semibold">Look right</div>
                    <p className="text-sm text-muted">Select the right option.</p>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-4xl leading-none">⦿</div>
                    <div className="mt-2 text-lg font-semibold">Look center</div>
                    <p className="text-sm text-muted">Confirm your request.</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {state.step === "calibration" && (
            <>
              <Alert title="Calibration is required">
                Keep your head still and follow the moving dot. This takes around one minute.
              </Alert>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CameraView
                  calibration={props.calibration}
                  deadzoneMultiplier={props.settings.deadzoneMultiplier}
                  facingMode={props.settings.facingMode}
                  smoothingWindow={props.settings.smoothingWindow}
                  showOverlay={true}
                  presentation={calibrationRunning ? "viewport" : "card"}
                  viewportClassName={calibrationRunning ? "fixed inset-0 z-40" : undefined}
                  onGazeOutput={setLatestOutput}
                  onTracking={(payload) => {
                    setLatestFeatures(payload.features ?? null);
                    setTrackingFlags({ hasFace: payload.hasFace, hasIris: payload.hasIris });
                  }}
                />
                <CalibrationWizard
                  calibration={props.calibration}
                  deadzoneMultiplier={props.settings.deadzoneMultiplier}
                  hasFace={trackingFlags.hasFace}
                  hasIris={trackingFlags.hasIris}
                  latestFeatures={latestFeatures}
                  onCalibration={(profile) => {
                    props.onCalibration(profile);
                    setState((current) =>
                      setOnboardingCalibrationCompleted(current, Boolean(profile))
                    );
                  }}
                  onStatusChange={setWizardStatus}
                />
              </div>
              <Alert tone={state.calibrationCompleted ? "success" : "warning"}>
                {state.calibrationCompleted
                  ? "Calibration complete. You can continue."
                  : "Calibration not complete yet. Press Start and finish all points."}
              </Alert>
            </>
          )}

          {state.step === "validation" && (
            <>
              <Alert title="Quick quality check">
                You are ready if your face and eyes are tracked and the gaze output responds.
              </Alert>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-sm font-semibold text-muted">Tracking</div>
                    <div className="mt-2 text-xl font-semibold">
                      {trackingFlags.hasFace && trackingFlags.hasIris ? "Ready" : "Needs attention"}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-sm font-semibold text-muted">Last direction</div>
                    <div className="mt-2 text-xl font-semibold">{latestOutput.direction}</div>
                  </CardContent>
                </Card>
                <Card className="bg-cardStrong">
                  <CardContent className="pt-5">
                    <div className="text-sm font-semibold text-muted">Calibration status</div>
                    <div className="mt-2 text-xl font-semibold">
                      {state.calibrationCompleted ? "Completed" : wizardStatus}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {!state.calibrationCompleted && (
                <Alert tone="warning">
                  Go back to calibration and complete setup before moving on.
                </Alert>
              )}
            </>
          )}

          {state.step === "impact-summary" && (
            <>
              <Alert tone="info" title="Why this matters">
                This app is built so every elder can be heard quickly, including people in
                under-resourced settings.
              </Alert>
              <Card className="bg-cardStrong">
                <CardContent className="pt-5">
                  <ul className="list-disc space-y-2 pl-5 text-base text-foreground">
                    <li>Hands-free request support for speech or mobility limitations.</li>
                    <li>Simple, large interface for low-friction daily use.</li>
                    <li>Same request speed and dignity regardless of race or facility resources.</li>
                  </ul>
                  <div className="mt-4">
                    <Button variant="secondary" onClick={props.onStartImpactDemo}>
                      Run guided impact demo now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {state.step === "complete" && (
            <>
              <Alert tone="success" title="Setup complete">
                You are ready to use gaze-based communication.
              </Alert>
              <Card className="bg-cardStrong">
                <CardContent className="pt-5 text-base">
                  <p className="text-foreground">
                    You can start the communication demo now. You can also redo onboarding anytime.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
            <div className="flex gap-2">
              {state.stepIndex > 0 && (
                <Button variant="outline" onClick={onBack}>
                  Back
                </Button>
              )}
              {props.allowSkip && state.step !== "complete" && (
                <Button variant="ghost" onClick={props.onSkip}>
                  Skip onboarding
                </Button>
              )}
            </div>
            <Button onClick={onPrimary} disabled={!canMoveForward && state.step !== "complete"}>
              {primaryLabel(state.step, state.calibrationCompleted)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

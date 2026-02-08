import { useMemo, useState } from "react";
import type { FacingMode } from "@/components/SettingsPanel";
import Alert from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ScreenHeader from "@/components/ui/screen-header";
import {
  createInitialImpactMetricsState,
  reduceImpactMetrics,
  type ImpactMetricsState
} from "@/features/impact/metrics";
import type { DemoMetricEvent } from "@/features/impact/types";
import type { CalibrationProfile } from "@/lib/gaze/types";
import Demo from "./Demo";

type ScriptStep = "problem" | "baseline" | "onboarding" | "live" | "summary";

export default function ImpactDemo(props: {
  calibration: CalibrationProfile | null;
  facingMode: FacingMode;
  smoothingWindow: number;
  deadzoneMultiplier: number;
  onExit: () => void;
}) {
  const [step, setStep] = useState<ScriptStep>("problem");
  const [metricsState, setMetricsState] = useState<ImpactMetricsState>(
    createInitialImpactMetricsState()
  );

  const summary = metricsState.summary;
  const formattedTime = useMemo(() => {
    if (summary.timeToFirstRequestMs === null) return "Not recorded";
    return `${(summary.timeToFirstRequestMs / 1000).toFixed(1)}s`;
  }, [summary.timeToFirstRequestMs]);

  const onMetricEvent = (event: DemoMetricEvent) => {
    setMetricsState((current) => reduceImpactMetrics(current, event));
    if (event.type === "request_confirmed") {
      setStep("summary");
    }
  };

  if (step === "live") {
    return (
      <Demo
        calibration={props.calibration}
        deadzoneMultiplier={props.deadzoneMultiplier}
        facingMode={props.facingMode}
        smoothingWindow={props.smoothingWindow}
        scenario="impact_night_request"
        onMetricEvent={onMetricEvent}
        onExit={() => setStep("summary")}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <ScreenHeader
        title="Impact Story"
        subtitle="Night-time help request demo, framed around racial equity in access to care."
        rightSlot={<Button onClick={props.onExit}>Back to workspace</Button>}
      />

      {step === "problem" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Problem framing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert tone="warning" title="Care gap">
              Many elders in under-resourced facilities struggle to request help quickly.
            </Alert>
            <p className="text-base text-muted">
              This includes communities affected by racial inequity in care access and response
              times.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setStep("baseline")}>Next: baseline failure</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "baseline" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Baseline limitation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert tone="danger" title="Without this tool">
              Weak voice, no nearby call button, and delayed support can leave elders unheard.
            </Alert>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("problem")}>
                Back
              </Button>
              <Button onClick={() => setStep("onboarding")}>Next: what this app changes</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "onboarding" && (
        <Card>
          <CardHeader>
            <CardTitle>3. Onboarding recap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert tone="success" title="Elder-first setup">
              Large text, simple prompts, gaze training, and calibration make the tool usable in
              minutes.
            </Alert>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted">
              <li>Hands-free interaction for speech or mobility limitations.</li>
              <li>On-device processing for privacy and low infrastructure cost.</li>
              <li>Designed for clear recovery when face or eye tracking is lost.</li>
            </ul>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("baseline")}>
                Back
              </Button>
              <Button
                onClick={() => {
                  setMetricsState(createInitialImpactMetricsState());
                  setStep("live");
                }}
              >
                Start live scenario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "summary" && (
        <Card>
          <CardHeader>
            <CardTitle>4. Equity impact summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert tone="info" title="Prototype outcome">
              Same request speed and dignity regardless of race or facility resources.
            </Alert>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="bg-cardStrong">
                <CardContent className="pt-5">
                  <div className="text-sm text-muted">Time to first request</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{formattedTime}</div>
                </CardContent>
              </Card>
              <Card className="bg-cardStrong">
                <CardContent className="pt-5">
                  <div className="text-sm text-muted">Selection attempts</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {summary.selectionAttempts}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-cardStrong">
                <CardContent className="pt-5">
                  <div className="text-sm text-muted">Recovery prompts shown</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {summary.recoveryPromptsShown}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="text-base text-muted">
              Request confirmed: {summary.requestConfirmed ? "Yes" : "No"}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("onboarding")}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMetricsState(createInitialImpactMetricsState());
                    setStep("live");
                  }}
                >
                  Replay live scenario
                </Button>
                <Button onClick={props.onExit}>Finish</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

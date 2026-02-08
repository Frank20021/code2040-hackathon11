import { useMemo, useState } from "react";
import CameraView from "@/components/CameraView";
import CalibrationWizard, { type WizardStatus } from "@/components/CalibrationWizard";
import SettingsPanel, { type SettingsState } from "@/components/SettingsPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ScreenHeader from "@/components/ui/screen-header";
import type { GazeOutput } from "@/lib/gaze/types";
import { loadCalibrationFromStorage } from "@/lib/gaze/calibrationStorage";
import type { GazeFeatures } from "@/lib/gaze/types";
import Demo from "@/pages/Demo";

type AppMode = "workspace" | "demo";

export default function App() {
  const [mode, setMode] = useState<AppMode>("workspace");
  const [gazeOutput, setGazeOutput] = useState<GazeOutput>({
    direction: "NO_FACE",
    confidence: 0
  });

  const [settings, setSettings] = useState<SettingsState>({
    facingMode: "user",
    smoothingWindow: 7,
    deadzoneMultiplier: 2,
    showOverlay: true
  });

  const initialCalibration = useMemo(() => loadCalibrationFromStorage(), []);
  const [calibration, setCalibration] = useState(initialCalibration);
  const [latestFeatures, setLatestFeatures] = useState<GazeFeatures | null>(null);
  const [trackingFlags, setTrackingFlags] = useState<{
    hasFace: boolean;
    hasIris: boolean;
  }>({ hasFace: false, hasIris: false });
  const [wizardStatus, setWizardStatus] = useState<WizardStatus>("IDLE");
  const calibrationRunning = wizardStatus === "RUNNING" || wizardStatus === "VALIDATING";

  if (mode === "demo") {
    return (
      <Demo
        calibration={calibration}
        deadzoneMultiplier={settings.deadzoneMultiplier}
        facingMode={settings.facingMode}
        onExit={() => setMode("workspace")}
        smoothingWindow={settings.smoothingWindow}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <ScreenHeader
        title="Elder Assistive Communication"
        subtitle="2-minute setup and demo."
        rightSlot={
          <Button variant="secondary" size="sm" onClick={() => setMode("demo")}>
            Open Demo
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CameraView
          calibration={calibration}
          deadzoneMultiplier={settings.deadzoneMultiplier}
          facingMode={settings.facingMode}
          presentation={calibrationRunning ? "viewport" : "card"}
          viewportClassName={calibrationRunning ? "fixed inset-0 z-40" : undefined}
          onGazeOutput={setGazeOutput}
          onTracking={(payload) => {
            setLatestFeatures(payload.features ?? null);
            setTrackingFlags({ hasFace: payload.hasFace, hasIris: payload.hasIris });
          }}
          showOverlay={settings.showOverlay || calibrationRunning}
          smoothingWindow={settings.smoothingWindow}
        />

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Output</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <div className="text-4xl font-bold tracking-wide">
                  {gazeOutput.direction}
                </div>
                <div className="text-base text-muted">
                  {(gazeOutput.confidence * 100).toFixed(0)}%
                </div>
              </div>
              <div className="h-3 w-full overflow-hidden rounded bg-cardStrong">
                <div
                  className="h-full bg-primary transition-all duration-base ease-standard"
                  style={{ width: `${Math.round(gazeOutput.confidence * 100)}%` }}
                />
              </div>
              {gazeOutput.direction === "NO_IRIS" && (
                <p className="text-base text-warning">
                  Iris landmarks not available. Improve lighting and move closer
                  to the camera.
                </p>
              )}
            </CardContent>
          </Card>

          <CalibrationWizard
            calibration={calibration}
            deadzoneMultiplier={settings.deadzoneMultiplier}
            hasFace={trackingFlags.hasFace}
            hasIris={trackingFlags.hasIris}
            latestFeatures={latestFeatures}
            onCalibration={setCalibration}
            onStatusChange={setWizardStatus}
          />

          <SettingsPanel settings={settings} onChange={setSettings} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { FacingMode } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classifyDirection } from "@/lib/gaze/classifyDirection";
import { extractGazeFeatures } from "@/lib/gaze/extractGazeFeatures";
import { majorityVote } from "@/lib/gaze/smoothing";
import type { CalibrationProfile, GazeDirection, GazeFeatures, GazeOutput, Landmark } from "@/lib/gaze/types";
import { createFaceLandmarker } from "@/lib/mediapipe/createFaceLandmarker";
import { selectLargestFace } from "@/lib/mediapipe/selectFace";
import GazeOverlayCanvas from "./GazeOverlayCanvas";

export type CameraStatus =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "NO_CAMERA"
  | "MODEL_ERROR";

export default function CameraView(props: {
  calibration: CalibrationProfile | null;
  deadzoneMultiplier: number;
  facingMode: FacingMode;
  smoothingWindow: number;
  showOverlay: boolean;
  autoStart?: boolean;
  hideUi?: boolean;
  presentation?: "card" | "viewport";
  viewportClassName?: string;
  onStatusChange?: (status: CameraStatus) => void;
  onGazeOutput: (output: GazeOutput) => void;
  onTracking: (payload: { hasFace: boolean; hasIris: boolean; features?: GazeFeatures }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("STOPPED");
  const [cameraFacing, setCameraFacing] = useState<FacingMode>(props.facingMode);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(Boolean(props.autoStart));
  const streamRef = useRef<MediaStream | null>(null);

  const [latestLandmarks, setLatestLandmarks] = useState<Landmark[] | null>(null);
  const [latestFeatures, setLatestFeatures] = useState<GazeFeatures | null>(null);

  const liveRef = useRef<{
    calibration: CalibrationProfile | null;
    smoothingWindow: number;
    showOverlay: boolean;
    onGazeOutput: (output: GazeOutput) => void;
    onTracking: (payload: { hasFace: boolean; hasIris: boolean; features?: GazeFeatures }) => void;
  }>({
    calibration: props.calibration,
    smoothingWindow: props.smoothingWindow,
    showOverlay: props.showOverlay,
    onGazeOutput: props.onGazeOutput,
    onTracking: props.onTracking
  });

  const smoothWindowRef = useRef<GazeDirection[]>([]);

  useEffect(() => {
    setCameraFacing(props.facingMode);
  }, [props.facingMode]);

  useEffect(() => {
    liveRef.current = {
      calibration: props.calibration,
      smoothingWindow: props.smoothingWindow,
      showOverlay: props.showOverlay,
      onGazeOutput: props.onGazeOutput,
      onTracking: props.onTracking
    };
  }, [props.calibration, props.onGazeOutput, props.onTracking, props.showOverlay, props.smoothingWindow]);

  useEffect(() => {
    // Reset smoothing when window size changes.
    smoothWindowRef.current = [];
  }, [props.smoothingWindow]);

  useEffect(() => {
    if (!isActive) setStatus("STOPPED");
  }, [isActive]);

  useEffect(() => {
    if (props.autoStart) setIsActive(true);
  }, [props.autoStart]);

  useEffect(() => {
    props.onStatusChange?.(status);
  }, [props.onStatusChange, status]);

  useEffect(() => {
    if (!isActive) return;

    let stream: MediaStream | null = null;
    let cancelled = false;
    let raf = 0;
    let faceLandmarker: Awaited<ReturnType<typeof createFaceLandmarker>> | null = null;

    async function start() {
      setStatus("STARTING");
      setModelError(null);

      try {
        faceLandmarker = await createFaceLandmarker();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setModelError(message);
          setStatus("MODEL_ERROR");
        }
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing }
        });
        streamRef.current = stream;
      } catch (e) {
        if (!cancelled) setStatus("NO_CAMERA");
        return;
      }

      if (cancelled) return;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      if (cancelled) return;
      setStatus("RUNNING");

      const loop = () => {
        if (cancelled || !videoRef.current || !faceLandmarker) return;
        const videoEl = videoRef.current;
        const { calibration, smoothingWindow, showOverlay, onGazeOutput, onTracking } = liveRef.current;

        if (videoEl.readyState >= 2) {
          const result = faceLandmarker.detectForVideo(videoEl, performance.now());

          const faces = (result.faceLandmarks ?? []) as unknown as Landmark[][];
          const selected = selectLargestFace(faces);
          if (!selected) {
            if (showOverlay) {
              setLatestLandmarks(null);
              setLatestFeatures(null);
            }
            smoothWindowRef.current = [];
            onTracking({ hasFace: false, hasIris: false });
            onGazeOutput({ direction: "NO_FACE", confidence: 0 });
          } else {
            const extracted = extractGazeFeatures(selected);
            if (showOverlay) {
              setLatestLandmarks(selected);
              setLatestFeatures(extracted.features);
            }
            onTracking({
              hasFace: true,
              hasIris: extracted.hasIris,
              features: extracted.features
            });

            if (!extracted.hasIris) {
              smoothWindowRef.current = [];
              onGazeOutput({
                direction: "NO_IRIS",
                confidence: 0,
                features: extracted.features
              });
            } else if (!calibration) {
              smoothWindowRef.current = [];
              onGazeOutput({
                direction: "CENTER",
                confidence: 0,
                features: extracted.features
              });
            } else {
              const classified = classifyDirection({
                features: extracted.features,
                calibration
              });
              const window = smoothWindowRef.current;
              window.push(classified.direction);
              while (window.length > Math.max(1, Math.floor(smoothingWindow))) window.shift();
              const smoothed = majorityVote(window);
              onGazeOutput({
                direction: smoothed,
                confidence: classified.confidence,
                features: extracted.features
              });
            }
          }
        }

        raf = requestAnimationFrame(loop);
      };

      raf = requestAnimationFrame(loop);
    }

    void start();

    return () => {
      cancelled = true;
      smoothWindowRef.current = [];
      if (raf) cancelAnimationFrame(raf);
      const activeStream = streamRef.current ?? stream;
      if (activeStream) {
        for (const track of activeStream.getTracks()) track.stop();
      }
      streamRef.current = null;
      if (faceLandmarker) faceLandmarker.close();
    };
  }, [cameraFacing, isActive]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject === stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      // Ignore interrupted play attempts when layout switches during calibration.
    });
  }, [isActive, props.presentation, props.viewportClassName]);

  const canRun = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  if (props.hideUi) {
    return (
      <div className="sr-only" aria-hidden>
        <video
          ref={videoRef}
          className="h-px w-px opacity-0"
          muted
          playsInline
        />
      </div>
    );
  }

  if (props.presentation === "viewport") {
    return (
      <div className={cn("relative aspect-video w-full overflow-hidden bg-black", props.viewportClassName)}>
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
        />
        {props.showOverlay && (
          <GazeOverlayCanvas landmarks={latestLandmarks} features={latestFeatures} />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-base text-muted">
            Status:{" "}
            <span className="font-semibold text-foreground">
              {status === "RUNNING" && !props.calibration ? "CALIBRATE" : status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                value={cameraFacing}
                onValueChange={(value) => setCameraFacing(value as FacingMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Front (user)</SelectItem>
                  <SelectItem value="environment">Back (environment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={isActive ? "secondary" : "default"}
              onClick={() => setIsActive((v) => !v)}
              disabled={!canRun}
            >
              {isActive ? "Stop" : "Start"}
            </Button>
          </div>
        </div>

        {status === "MODEL_ERROR" && (
          <div className="rounded-md border border-warning/50 bg-warning/15 p-3 text-base text-foreground">
            <div className="font-medium">Model load error</div>
            <div className="mt-1 text-sm text-muted">
              Make sure `public/models/face_landmarker.task` exists.
            </div>
            {modelError && (
              <pre className="mt-2 whitespace-pre-wrap rounded bg-cardStrong p-2 text-xs text-foreground">
                {modelError}
              </pre>
            )}
          </div>
        )}

        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
          />
          {props.showOverlay && (
            <GazeOverlayCanvas landmarks={latestLandmarks} features={latestFeatures} />
          )}
        </div>

        <div className="text-sm text-muted">
          Tip: Use bright, even lighting and keep your face centered.
        </div>
      </CardContent>
    </Card>
  );
}

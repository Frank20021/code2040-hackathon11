import { useEffect, useRef } from "react";
import type { GazeFeatures, Landmark } from "@/lib/gaze/types";

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export default function GazeOverlayCanvas({
  landmarks,
  features
}: {
  landmarks: Landmark[] | null;
  features: GazeFeatures | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const { width, height } = parent.getBoundingClientRect();
    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    // Quick landmarks (sample every ~10 points to keep it light).
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < landmarks.length; i += 10) {
      const p = landmarks[i];
      drawPoint(ctx, p.x * canvas.width, p.y * canvas.height, 1.3, "rgba(255,255,255,0.35)");
    }

    if (!features?.leftEye || !features?.rightEye) return;

    const pts = [
      features.leftEye.leftCorner,
      features.leftEye.rightCorner,
      features.leftEye.upperLid,
      features.leftEye.lowerLid,
      features.leftEye.iris,
      features.rightEye.leftCorner,
      features.rightEye.rightCorner,
      features.rightEye.upperLid,
      features.rightEye.lowerLid,
      features.rightEye.iris
    ];

    for (const p of pts) {
      drawPoint(ctx, p.x * canvas.width, p.y * canvas.height, 4.5, "rgba(74, 255, 176, 0.98)");
    }
  }, [features, landmarks]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

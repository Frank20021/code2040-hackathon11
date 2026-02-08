import type { Landmark } from "@/lib/gaze/types";

export function selectLargestFace(faces: Landmark[][]): Landmark[] | null {
  if (faces.length === 0) return null;

  let best = faces[0];
  let bestArea = -1;

  for (const face of faces) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of face) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }

  return best;
}


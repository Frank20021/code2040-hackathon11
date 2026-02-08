import type { GazeDirection } from "./types";

export function majorityVote(labels: GazeDirection[]): GazeDirection {
  if (labels.length === 0) return "NO_FACE";

  const counts = new Map<GazeDirection, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);

  let best: GazeDirection = labels[labels.length - 1];
  let bestCount = -1;

  for (const [label, count] of counts.entries()) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
      continue;
    }
    if (count === bestCount) {
      const bestIdx = labels.lastIndexOf(best);
      const labelIdx = labels.lastIndexOf(label);
      if (labelIdx > bestIdx) best = label;
    }
  }

  return best;
}

export function createSmoother(windowSize: number) {
  const window: GazeDirection[] = [];
  const max = Math.max(1, Math.floor(windowSize));

  return {
    push(label: GazeDirection) {
      window.push(label);
      while (window.length > max) window.shift();
      return majorityVote(window);
    },
    reset() {
      window.length = 0;
    }
  };
}


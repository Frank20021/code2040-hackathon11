export type IntentDirection = "LEFT" | "RIGHT" | "CENTER" | "NONE";

export type IntentSample = {
  atMs: number;
  direction: IntentDirection;
};

export function dominantIntentDirection(directions: IntentDirection[]): IntentDirection {
  if (directions.length === 0) return "NONE";

  const counts = new Map<IntentDirection, number>();
  for (const direction of directions) {
    counts.set(direction, (counts.get(direction) ?? 0) + 1);
  }

  let best: IntentDirection = directions[directions.length - 1];
  let bestCount = -1;

  for (const [direction, count] of counts.entries()) {
    if (count > bestCount) {
      best = direction;
      bestCount = count;
      continue;
    }

    if (count === bestCount) {
      const bestIdx = directions.lastIndexOf(best);
      const directionIdx = directions.lastIndexOf(direction);
      if (directionIdx > bestIdx) best = direction;
    }
  }

  return best;
}

export function appendAndGetDominantIntentDirection(params: {
  samples: IntentSample[];
  nextDirection: IntentDirection;
  nowMs: number;
  windowMs: number;
}): IntentDirection {
  const { samples, nextDirection, nowMs } = params;
  const windowMs = Math.max(1, Math.floor(params.windowMs));
  const cutoff = nowMs - windowMs;

  samples.push({ atMs: nowMs, direction: nextDirection });
  while (samples.length > 0 && samples[0].atMs < cutoff) {
    samples.shift();
  }

  return dominantIntentDirection(samples.map((sample) => sample.direction));
}

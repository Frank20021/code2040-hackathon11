export type CalibrationQueueItem = {
  pointId: string;
  isRetry: boolean;
};

export type CalibrationQueueState = {
  queue: CalibrationQueueItem[];
  retryCount: number;
  maxRetries: number;
  scheduledRetryPointIds: Set<string>;
  failedPointIds: Set<string>;
};

export function createCalibrationQueue(
  pointIds: string[],
  maxRetries: number
): CalibrationQueueState {
  return {
    queue: pointIds.map((pointId) => ({ pointId, isRetry: false })),
    retryCount: 0,
    maxRetries,
    scheduledRetryPointIds: new Set<string>(),
    failedPointIds: new Set<string>()
  };
}

export function applyPointResult(
  state: CalibrationQueueState,
  params: {
    pointId: string;
    isRetry: boolean;
    accepted: boolean;
  }
): CalibrationQueueState {
  const queue = [...state.queue];
  const scheduledRetryPointIds = new Set(state.scheduledRetryPointIds);
  const failedPointIds = new Set(state.failedPointIds);
  let retryCount = state.retryCount;

  if (params.accepted) {
    failedPointIds.delete(params.pointId);
    return {
      ...state,
      queue,
      retryCount,
      scheduledRetryPointIds,
      failedPointIds
    };
  }

  const retryAlreadyScheduled = scheduledRetryPointIds.has(params.pointId);
  const canScheduleRetry =
    !params.isRetry &&
    !retryAlreadyScheduled &&
    retryCount < state.maxRetries;

  if (canScheduleRetry) {
    retryCount += 1;
    scheduledRetryPointIds.add(params.pointId);
    queue.push({ pointId: params.pointId, isRetry: true });
  } else {
    failedPointIds.add(params.pointId);
  }

  return {
    ...state,
    queue,
    retryCount,
    scheduledRetryPointIds,
    failedPointIds
  };
}

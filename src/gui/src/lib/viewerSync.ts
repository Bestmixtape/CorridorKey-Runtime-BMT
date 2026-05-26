export interface MediaSyncSnapshot {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
}

export interface MediaSyncAction {
  currentTime: number | null;
  paused: boolean | null;
  playbackRate: number | null;
}

export interface MediaSyncOptions {
  timeToleranceSeconds?: number;
  playbackRateTolerance?: number;
}

const DEFAULT_TIME_TOLERANCE_SECONDS = 0.08;
const DEFAULT_PLAYBACK_RATE_TOLERANCE = 0.01;

export function mediaSyncAction(
  anchor: MediaSyncSnapshot,
  follower: MediaSyncSnapshot,
  options: MediaSyncOptions = {}
): MediaSyncAction {
  const timeToleranceSeconds = options.timeToleranceSeconds ?? DEFAULT_TIME_TOLERANCE_SECONDS;
  const playbackRateTolerance = options.playbackRateTolerance ?? DEFAULT_PLAYBACK_RATE_TOLERANCE;
  const targetTime = synchronizedMediaTime(anchor, follower);
  const targetPlaybackRate = Number.isFinite(anchor.playbackRate) && anchor.playbackRate > 0
    ? anchor.playbackRate
    : null;

  return {
    currentTime: targetTime !== null && Math.abs(follower.currentTime - targetTime) > timeToleranceSeconds
      ? targetTime
      : null,
    paused: anchor.paused === follower.paused ? null : anchor.paused,
    playbackRate: targetPlaybackRate !== null &&
      Math.abs(follower.playbackRate - targetPlaybackRate) > playbackRateTolerance
      ? targetPlaybackRate
      : null
  };
}

export function synchronizedMediaTime(
  anchor: Pick<MediaSyncSnapshot, "currentTime" | "duration">,
  follower: Pick<MediaSyncSnapshot, "duration">
): number | null {
  if (!Number.isFinite(anchor.currentTime) || anchor.currentTime < 0) {
    return null;
  }

  if (hasUsableDuration(anchor.duration) && hasUsableDuration(follower.duration)) {
    const progress = anchor.currentTime / anchor.duration;
    return clamp(progress * follower.duration, 0, follower.duration);
  }

  if (hasUsableDuration(follower.duration)) {
    return clamp(anchor.currentTime, 0, follower.duration);
  }

  return anchor.currentTime;
}

function hasUsableDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

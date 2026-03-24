import { LoopHit, Pattern, SongStep } from '../types';

export interface RecordingTake {
  patternId: string;
  pass: number;
  startedAt: number;
  hitIds: string[];
}

export function createRecordingTake(patternId: string, pass: number, startedAt: number): RecordingTake {
  return { patternId, pass, startedAt, hitIds: [] };
}

export function appendHitToTake(take: RecordingTake, hitId: string): RecordingTake {
  return { ...take, hitIds: [...take.hitIds, hitId] };
}

export function removeTakeFromPatterns(patterns: Pattern[], take: RecordingTake): Pattern[] {
  const hitIds = new Set(take.hitIds);
  return patterns.map((pattern) => pattern.id !== take.patternId
    ? pattern
    : { ...pattern, hits: pattern.hits.filter((hit) => !hitIds.has(hit.id)) });
}

export function resolveRecordingTargetPatternId(
  isSongMode: boolean,
  currentPatternId: string,
  arrangementBanks: SongStep[][],
  activeArrIdx: number,
  currentSongStepIdx: number
): string | null {
  if (!isSongMode) {
    return currentPatternId;
  }

  const step = arrangementBanks[activeArrIdx]?.[currentSongStepIdx];
  return step?.armedPatternId ?? null;
}

export function quantizeBeatOffset(rawBeatOffset: number, quantizeMode: 'none' | '1/8' | '1/16', maxBeats: number): number {
  if (quantizeMode === 'none') {
    return rawBeatOffset;
  }

  const grid = quantizeMode === '1/8' ? 0.5 : 0.25;
  const quantized = Math.round(rawBeatOffset / grid) * grid;
  return quantized >= maxBeats ? maxBeats - 0.0001 : quantized;
}

export function buildQuantizedCaptureKey(patternId: string, padId: number, pass: number, beatOffset: number): string {
  return `${patternId}:${padId}:${pass}:${beatOffset.toFixed(4)}`;
}

export function buildFreeTimingCaptureKey(patternId: string, padId: number, pass: number): string {
  return `${patternId}:${padId}:${pass}`;
}

export function isDuplicateFreeTimingCapture(
  captureKey: string,
  nowMs: number,
  captureTimes: Map<string, number>,
  thresholdMs = 35
): boolean {
  const lastCapture = captureTimes.get(captureKey);
  return lastCapture !== undefined && (nowMs - lastCapture) <= thresholdMs;
}

export function appendHitToPattern(patterns: Pattern[], patternId: string, hit: LoopHit, maxHits: number): Pattern[] {
  return patterns.map((pattern) => {
    if (pattern.id !== patternId) {
      return pattern;
    }

    const nextHits = [...pattern.hits, hit];
    return {
      ...pattern,
      hits: nextHits.length > maxHits ? nextHits.slice(-maxHits) : nextHits,
    };
  });
}

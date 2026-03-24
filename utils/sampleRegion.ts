export const MIN_SAMPLE_REGION_DURATION = 0.001;

export type SampleRegionHandle = 'start' | 'end';

export interface SampleRegion {
  start: number;
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function normalizeSampleRegion(region: SampleRegion, duration: number): SampleRegion {
  const safeDuration = Math.max(0, duration);
  const minSpan = Math.min(MIN_SAMPLE_REGION_DURATION, safeDuration);

  if (safeDuration === 0) {
    return { start: 0, end: 0 };
  }

  let start = clamp(Math.min(region.start, region.end), 0, safeDuration);
  let end = clamp(Math.max(region.start, region.end), 0, safeDuration);

  if (end - start >= minSpan) {
    return { start, end };
  }

  if (minSpan === safeDuration) {
    return { start: 0, end: safeDuration };
  }

  end = clamp(end, minSpan, safeDuration);
  start = clamp(start, 0, end - minSpan);

  if (end - start < minSpan) {
    end = safeDuration;
    start = safeDuration - minSpan;
  }

  return { start, end };
}

export function updateSampleRegionBoundary(
  region: SampleRegion,
  handle: SampleRegionHandle,
  value: number,
  duration: number
): SampleRegion {
  const normalized = normalizeSampleRegion(region, duration);
  const safeDuration = Math.max(0, duration);
  const minSpan = Math.min(MIN_SAMPLE_REGION_DURATION, safeDuration);

  if (safeDuration === 0) {
    return normalized;
  }

  if (minSpan === safeDuration) {
    return { start: 0, end: safeDuration };
  }

  const clampedValue = clamp(value, 0, safeDuration);

  if (handle === 'start') {
    return {
      start: clamp(clampedValue, 0, normalized.end - minSpan),
      end: normalized.end
    };
  }

  return {
    start: normalized.start,
    end: clamp(clampedValue, normalized.start + minSpan, safeDuration)
  };
}

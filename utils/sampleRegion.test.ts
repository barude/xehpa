import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE_REGION_DURATION,
  normalizeSampleRegion,
  updateSampleRegionBoundary,
} from './sampleRegion';

describe('sampleRegion', () => {
  it('keeps regions ordered and wide enough during normalization', () => {
    expect(normalizeSampleRegion({ start: 0.8, end: 0.2 }, 1)).toEqual({
      start: 0.2,
      end: 0.8,
    });
  });

  it('moves only the start boundary when editing start', () => {
    expect(
      updateSampleRegionBoundary({ start: 0.2, end: 0.8 }, 'start', 0.5, 1)
    ).toEqual({
      start: 0.5,
      end: 0.8,
    });
  });

  it('moves only the end boundary when editing end', () => {
    expect(
      updateSampleRegionBoundary({ start: 0.2, end: 0.8 }, 'end', 0.6, 1)
    ).toEqual({
      start: 0.2,
      end: 0.6,
    });
  });

  it('clamps start at the end instead of moving the end boundary', () => {
    expect(
      updateSampleRegionBoundary({ start: 0.2, end: 0.8 }, 'start', 0.95, 1)
    ).toEqual({
      start: 0.8 - MIN_SAMPLE_REGION_DURATION,
      end: 0.8,
    });
  });

  it('clamps end at the start instead of moving the start boundary', () => {
    expect(
      updateSampleRegionBoundary({ start: 0.2, end: 0.8 }, 'end', 0.05, 1)
    ).toEqual({
      start: 0.2,
      end: 0.2 + MIN_SAMPLE_REGION_DURATION,
    });
  });
});

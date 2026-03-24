import { describe, expect, it } from 'vitest';
import { LoopHit, Pattern, SongStep } from '../types';
import {
  appendHitToPattern,
  appendHitToTake,
  buildFreeTimingCaptureKey,
  buildQuantizedCaptureKey,
  createRecordingTake,
  isDuplicateFreeTimingCapture,
  quantizeBeatOffset,
  removeTakeFromPatterns,
  resolveRecordingTargetPatternId,
} from './recording';

function createPattern(id: string, hits: LoopHit[] = []): Pattern {
  return { id, name: id, bars: 1, hits };
}

function createStep(id: string, patternIds: string[], armedPatternId: string | null = patternIds[0] ?? null): SongStep {
  return {
    id,
    name: id,
    activePatternIds: patternIds,
    armedPatternId,
    repeats: 1,
  };
}

describe('recording helpers', () => {
  it('latches the original song-mode recording target', () => {
    expect(resolveRecordingTargetPatternId(
      true,
      'pattern-current',
      [[createStep('step-1', ['pattern-a', 'pattern-b'], 'pattern-a')]],
      0,
      0
    )).toBe('pattern-a');
  });

  it('removes only the hits from the undone take', () => {
    const take = appendHitToTake(appendHitToTake(createRecordingTake('pattern-a', 0, 1), 'hit-1'), 'hit-3');
    const patterns = [
      createPattern('pattern-a', [
        { id: 'hit-1', padId: 1, beatOffset: 0, originalBeatOffset: 0, pass: 0 },
        { id: 'hit-2', padId: 2, beatOffset: 1, originalBeatOffset: 1, pass: 0 },
        { id: 'hit-3', padId: 3, beatOffset: 2, originalBeatOffset: 2, pass: 0 },
      ]),
    ];

    expect(removeTakeFromPatterns(patterns, take)[0].hits.map((hit) => hit.id)).toEqual(['hit-2']);
  });

  it('collapses duplicate quantized captures in the same slot', () => {
    const beatOffset = quantizeBeatOffset(0.26, '1/16', 4);
    expect(buildQuantizedCaptureKey('pattern-a', 4, 1, beatOffset)).toBe(
      buildQuantizedCaptureKey('pattern-a', 4, 1, quantizeBeatOffset(0.24, '1/16', 4))
    );
  });

  it('collapses near-simultaneous free-timing captures', () => {
    const captureTimes = new Map<string, number>();
    const key = buildFreeTimingCaptureKey('pattern-a', 4, 1);
    captureTimes.set(key, 100);

    expect(isDuplicateFreeTimingCapture(key, 120, captureTimes)).toBe(true);
    expect(isDuplicateFreeTimingCapture(key, 200, captureTimes)).toBe(false);
  });

  it('appends hits with max-hit trimming', () => {
    const patterns = [createPattern('pattern-a', [
      { id: 'hit-1', padId: 1, beatOffset: 0, originalBeatOffset: 0, pass: 0 },
      { id: 'hit-2', padId: 2, beatOffset: 1, originalBeatOffset: 1, pass: 0 },
    ])];

    const next = appendHitToPattern(patterns, 'pattern-a', {
      id: 'hit-3',
      padId: 3,
      beatOffset: 2,
      originalBeatOffset: 2,
      pass: 0,
    }, 2);

    expect(next[0].hits.map((hit) => hit.id)).toEqual(['hit-2', 'hit-3']);
  });
});

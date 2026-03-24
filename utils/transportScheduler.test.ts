import { describe, expect, it } from 'vitest';
import { Pattern, SongStep } from '../types';
import { computeSchedulerFrame } from './transportScheduler';

const beatDuration = 0.5;
const beatsPerBar = 4;

function createPattern(id: string, beatOffsets: number[], bars = 1): Pattern {
  return {
    id,
    name: id,
    bars,
    hits: beatOffsets.map((beatOffset, index) => ({
      id: `${id}-hit-${index}`,
      padId: index + 1,
      beatOffset,
      originalBeatOffset: beatOffset,
      pass: 0,
    })),
  };
}

function createStep(id: string, patternIds: string[], repeats = 1): SongStep {
  return {
    id,
    name: id,
    activePatternIds: patternIds,
    armedPatternId: patternIds[0] ?? null,
    repeats,
  };
}

describe('computeSchedulerFrame', () => {
  it('schedules the first beat when song mode starts', () => {
    const patternA = createPattern('pattern-a', [0]);

    const frame = computeSchedulerFrame({
      now: 100,
      lookAhead: 0.2,
      windowStart: 99.999,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [createStep('step-1', [patternA.id])],
      patterns: [patternA],
      beatsPerBar,
    });

    expect(frame?.scheduledHits.map((hit) => hit.absoluteTime)).toEqual([100]);
    expect(frame?.currentSongStepIdx).toBe(0);
  });

  it('schedules the next step downbeat before the section boundary passes', () => {
    const patternA = createPattern('pattern-a', [0]);
    const patternB = createPattern('pattern-b', [0]);

    const frame = computeSchedulerFrame({
      now: 101.9,
      lookAhead: 0.2,
      windowStart: 101.7,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [
        createStep('step-1', [patternA.id]),
        createStep('step-2', [patternB.id]),
      ],
      patterns: [patternA, patternB],
      beatsPerBar,
    });

    expect(frame?.scheduledHits.map((hit) => [hit.patternId, hit.absoluteTime])).toEqual([
      ['pattern-b', 102],
    ]);
  });

  it('preserves the next step downbeat after a delayed scheduler tick', () => {
    const patternA = createPattern('pattern-a', [0]);
    const patternB = createPattern('pattern-b', [0]);

    const frame = computeSchedulerFrame({
      now: 102.05,
      lookAhead: 0.2,
      windowStart: 101.7,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [
        createStep('step-1', [patternA.id]),
        createStep('step-2', [patternB.id]),
      ],
      patterns: [patternA, patternB],
      beatsPerBar,
    });

    expect(frame?.currentSongStepIdx).toBe(1);
    expect(frame?.sectionStartTime).toBe(102);
    expect(frame?.scheduledHits.map((hit) => [hit.patternId, hit.absoluteTime])).toEqual([
      ['pattern-b', 102],
    ]);
  });

  it('schedules beat zero on every repeat of the same section', () => {
    const patternA = createPattern('pattern-a', [0]);

    const frame = computeSchedulerFrame({
      now: 101.9,
      lookAhead: 0.2,
      windowStart: 101.7,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [createStep('step-1', [patternA.id], 2)],
      patterns: [patternA],
      beatsPerBar,
    });

    expect(frame?.scheduledHits.map((hit) => hit.absoluteTime)).toEqual([102]);
  });

  it('keeps pattern mode beat zero intact', () => {
    const patternA = createPattern('pattern-a', [0]);

    const frame = computeSchedulerFrame({
      now: 100,
      lookAhead: 0.2,
      windowStart: 99.999,
      beatDuration,
      isSongMode: false,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [],
      patterns: [patternA],
      beatsPerBar,
    });

    expect(frame?.scheduledHits.map((hit) => hit.absoluteTime)).toEqual([100]);
  });

  it('schedules first beats for multiple patterns in the same step', () => {
    const patternA = createPattern('pattern-a', [0]);
    const patternB = createPattern('pattern-b', [0]);

    const frame = computeSchedulerFrame({
      now: 100,
      lookAhead: 0.2,
      windowStart: 99.999,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [createStep('step-1', [patternA.id, patternB.id])],
      patterns: [patternA, patternB],
      beatsPerBar,
    });

    expect(frame?.scheduledHits.map((hit) => [hit.patternId, hit.absoluteTime])).toEqual([
      ['pattern-a', 100],
      ['pattern-b', 100],
    ]);
  });

  it('keeps section-boundary lookahead results stable across repeated ticks', () => {
    const patternA = createPattern('pattern-a', [0]);
    const patternB = createPattern('pattern-b', [0]);
    const input = {
      now: 101.95,
      lookAhead: 0.2,
      windowStart: 101.75,
      beatDuration,
      isSongMode: true,
      isSectionLoopActive: false,
      currentSongStepIdx: 0,
      currentPatternId: patternA.id,
      sectionStartTime: 100,
      currentPass: 0,
      arrangement: [
        createStep('step-1', [patternA.id]),
        createStep('step-2', [patternB.id]),
      ],
      patterns: [patternA, patternB],
      beatsPerBar,
    };

    const first = computeSchedulerFrame(input);
    const second = computeSchedulerFrame(input);

    expect(first?.scheduledHits.map((hit) => hit.dedupeKey)).toEqual(second?.scheduledHits.map((hit) => hit.dedupeKey));
    expect(first?.scheduledHits.map((hit) => [hit.patternId, hit.absoluteTime])).toEqual([
      ['pattern-b', 102],
    ]);
  });
});

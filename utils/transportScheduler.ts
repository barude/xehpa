import { Pattern, SongStep, LoopHit } from '../types';

export interface ScheduledHitEvent {
  patternId: string;
  hit: LoopHit;
  absoluteTime: number;
  dedupeKey: string;
}

export interface SchedulerPatternState {
  patterns: Pattern[];
  stepTotalDuration: number;
  baseDuration: number;
}

export interface SchedulerFrameState {
  currentSongStepIdx: number;
  sectionStartTime: number;
  currentPass: number;
  playback: SchedulerPatternState;
  elapsedInStep: number;
  exactVisualBeat: number;
  progressRatio: number;
  scheduledHits: ScheduledHitEvent[];
}

export interface SchedulerFrameInput {
  now: number;
  lookAhead: number;
  windowStart: number;
  beatDuration: number;
  isSongMode: boolean;
  isSectionLoopActive: boolean;
  currentSongStepIdx: number;
  currentPatternId: string;
  sectionStartTime: number;
  currentPass: number;
  arrangement: SongStep[];
  patterns: Pattern[];
  beatsPerBar: number;
}

interface SectionCursor {
  stepIdx: number;
  sectionStartTime: number;
  pass: number;
  playback: SchedulerPatternState;
}

const EPSILON = 1e-9;

function getPatternDuration(pattern: Pattern, beatDuration: number, beatsPerBar: number): number {
  return beatDuration * beatsPerBar * pattern.bars;
}

function getPlaybackForSection(
  isSongMode: boolean,
  arrangement: SongStep[],
  patterns: Pattern[],
  currentPatternId: string,
  currentSongStepIdx: number,
  beatDuration: number,
  beatsPerBar: number
): SchedulerPatternState | null {
  if (isSongMode) {
    const step = arrangement[currentSongStepIdx];
    if (!step) {
      return null;
    }

    const activePatterns = step.activePatternIds
      .map((id) => patterns.find((pattern) => pattern.id === id))
      .filter(Boolean) as Pattern[];

    const baseDuration = activePatterns.reduce(
      (max, pattern) => Math.max(max, getPatternDuration(pattern, beatDuration, beatsPerBar)),
      0
    );

    return {
      patterns: activePatterns,
      stepTotalDuration: baseDuration * step.repeats,
      baseDuration,
    };
  }

  const currentPattern = patterns.find((pattern) => pattern.id === currentPatternId) || patterns[0];
  if (!currentPattern) {
    return null;
  }

  const duration = getPatternDuration(currentPattern, beatDuration, beatsPerBar);
  return {
    patterns: [currentPattern],
    stepTotalDuration: duration,
    baseDuration: duration,
  };
}

function advanceCursorToTime(input: SchedulerFrameInput): SectionCursor | null {
  let stepIdx = input.currentSongStepIdx;
  let sectionStartTime = input.sectionStartTime;
  let pass = input.currentPass;

  while (true) {
    const playback = getPlaybackForSection(
      input.isSongMode,
      input.arrangement,
      input.patterns,
      input.currentPatternId,
      stepIdx,
      input.beatDuration,
      input.beatsPerBar
    );

    if (!playback || playback.baseDuration <= 0 || playback.stepTotalDuration <= 0) {
      return null;
    }

    const sectionEndTime = sectionStartTime + playback.stepTotalDuration;
    if (input.now < sectionEndTime - EPSILON) {
      return { stepIdx, sectionStartTime, pass, playback };
    }

    sectionStartTime = sectionEndTime;
    pass += 1;

    if (input.isSongMode && !input.isSectionLoopActive && input.arrangement.length > 0) {
      stepIdx = (stepIdx + 1) % input.arrangement.length;
    }
  }
}

function collectSectionHits(
  sectionStartTime: number,
  playback: SchedulerPatternState,
  rangeStart: number,
  rangeEnd: number,
  beatDuration: number,
  beatsPerBar: number
): ScheduledHitEvent[] {
  const scheduledHits: ScheduledHitEvent[] = [];
  const sectionEndTime = sectionStartTime + playback.stepTotalDuration;

  playback.patterns.forEach((pattern) => {
    const resolvedPatternDuration = getPatternDuration(pattern, beatDuration, beatsPerBar);
    if (resolvedPatternDuration <= 0) {
      return;
    }

    const firstIteration = Math.max(
      0,
      Math.floor((rangeStart - sectionStartTime) / resolvedPatternDuration) - 1
    );
    const lastIteration = Math.ceil((rangeEnd - sectionStartTime) / resolvedPatternDuration);

    for (let iteration = firstIteration; iteration <= lastIteration; iteration += 1) {
      pattern.hits.forEach((hit) => {
        const absoluteTime = sectionStartTime + (iteration * resolvedPatternDuration) + (hit.beatOffset * beatDuration);
        if (absoluteTime < rangeStart - EPSILON || absoluteTime >= rangeEnd - EPSILON || absoluteTime >= sectionEndTime - EPSILON) {
          return;
        }

        scheduledHits.push({
          patternId: pattern.id,
          hit,
          absoluteTime,
          dedupeKey: `${hit.id}_${sectionStartTime.toFixed(6)}_${iteration}`,
        });
      });
    }
  });

  return scheduledHits;
}

export function computeSchedulerFrame(input: SchedulerFrameInput): SchedulerFrameState | null {
  const normalized = advanceCursorToTime(input);
  if (!normalized) {
    return null;
  }

  const elapsedInStep = Math.max(0, input.now - normalized.sectionStartTime);
  const progressRatio = normalized.playback.stepTotalDuration > 0
    ? Math.min(1, elapsedInStep / normalized.playback.stepTotalDuration)
    : 0;
  const exactVisualBeat = Math.floor((elapsedInStep % normalized.playback.baseDuration) / input.beatDuration);

  const rangeStart = input.windowStart;
  const rangeEnd = input.now + input.lookAhead;

  const scheduledHits: ScheduledHitEvent[] = [];
  let cursorStepIdx = normalized.stepIdx;
  let cursorSectionStartTime = normalized.sectionStartTime;
  let cursorPlayback = normalized.playback;

  while (cursorSectionStartTime < rangeEnd - EPSILON) {
    const sectionEndTime = cursorSectionStartTime + cursorPlayback.stepTotalDuration;
    const overlapStart = Math.max(rangeStart, cursorSectionStartTime);
    const overlapEnd = Math.min(rangeEnd, sectionEndTime);

    if (overlapStart < overlapEnd - EPSILON) {
      scheduledHits.push(
        ...collectSectionHits(
          cursorSectionStartTime,
          cursorPlayback,
          overlapStart,
          overlapEnd,
          input.beatDuration,
          input.beatsPerBar
        )
      );
    }

    if (sectionEndTime >= rangeEnd - EPSILON) {
      break;
    }

    cursorSectionStartTime = sectionEndTime;

    if (input.isSongMode && !input.isSectionLoopActive && input.arrangement.length > 0) {
      cursorStepIdx = (cursorStepIdx + 1) % input.arrangement.length;
    }

    const nextPlayback = getPlaybackForSection(
      input.isSongMode,
      input.arrangement,
      input.patterns,
      input.currentPatternId,
      cursorStepIdx,
      input.beatDuration,
      input.beatsPerBar
    );

    if (!nextPlayback || nextPlayback.baseDuration <= 0 || nextPlayback.stepTotalDuration <= 0) {
      break;
    }

    cursorPlayback = nextPlayback;
  }

  scheduledHits.sort((left, right) => left.absoluteTime - right.absoluteTime);

  return {
    currentSongStepIdx: normalized.stepIdx,
    sectionStartTime: normalized.sectionStartTime,
    currentPass: normalized.pass,
    playback: normalized.playback,
    elapsedInStep,
    exactVisualBeat,
    progressRatio,
    scheduledHits,
  };
}

import { PadConfig } from '../types';
import { TEMPO_MIN, TEMPO_MAX } from '../constants';

/**
 * Validate if a pad configuration is valid for playback
 */
export function isValidPad(pad: PadConfig | undefined): boolean {
  if (!pad || !pad.sampleId) return false;
  if (pad.end <= pad.start || pad.end - pad.start < 0.001) return false;
  return true;
}

/**
 * Clamp tempo value to valid range
 */
export function clampTempo(tempo: number): number {
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, tempo));
}




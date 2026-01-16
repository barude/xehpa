import { PadConfig } from '../types';
import { PADS_PER_BANK, DEFAULT_FILTER_CUTOFF } from '../constants';

/**
 * Create a bank of 16 pads with default configuration
 * @param bankIdx - The bank index (0-based)
 */
export function createBank(bankIdx: number): PadConfig[] {
  const baseId = bankIdx * PADS_PER_BANK;
  // Default pad config: preserves current "instant hit" feel
  // decay: 0 (instant), sustain: 1 (full level), filterType: 'lowpass', filterEnv: 0 (no modulation)
  const defaultPad = (id: number, keyCode: string, keyLabel: string): PadConfig => ({
    id, sampleId: null, keyCode, keyLabel,
    start: 0, end: 0, playMode: 'POLY',
    tune: 0, fineTune: 0, isReversed: false,
    volume: 1, pan: 0,
    attack: 0.001, decay: 0, sustain: 1, release: 0.01,
    filterType: 'lowpass', cutoff: DEFAULT_FILTER_CUTOFF, resonance: 1, filterEnv: 0,
    reverbSend: 0
  });
  
  return [
    defaultPad(baseId + 13, 'Digit1', '1'),
    defaultPad(baseId + 14, 'Digit2', '2'),
    defaultPad(baseId + 15, 'Digit3', '3'),
    defaultPad(baseId + 16, 'Digit4', '4'),
    defaultPad(baseId + 9, 'KeyQ', 'Q'),
    defaultPad(baseId + 10, 'KeyW', 'W'),
    defaultPad(baseId + 11, 'KeyE', 'E'),
    defaultPad(baseId + 12, 'KeyR', 'R'),
    defaultPad(baseId + 5, 'KeyA', 'A'),
    defaultPad(baseId + 6, 'KeyS', 'S'),
    defaultPad(baseId + 7, 'KeyD', 'D'),
    defaultPad(baseId + 8, 'KeyF', 'F'),
    defaultPad(baseId + 1, 'KeyZ', 'Z'),
    defaultPad(baseId + 2, 'KeyX', 'X'),
    defaultPad(baseId + 3, 'KeyC', 'C'),
    defaultPad(baseId + 4, 'KeyV', 'V'),
  ];
}



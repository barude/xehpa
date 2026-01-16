export interface SampleData {
  id: string;
  name: string;
  buffer: AudioBuffer;
}

export interface PadConfig {
  id: number;
  sampleId: string | null;
  keyCode: string;
  keyLabel: string;
  start: number;
  end: number;
  playMode: 'POLY' | 'MONO';
  tune: number;
  fineTune: number;
  isReversed: boolean;
  volume: number;
  pan: number;
  attack: number;
  decay?: number; // Optional for backward compatibility, default 0
  sustain?: number; // Optional for backward compatibility, default 1
  release: number;
  filterType?: 'lowpass' | 'highpass' | 'bandpass'; // Optional for backward compatibility, default 'lowpass'
  cutoff: number;
  resonance: number;
  filterEnv?: number; // Optional for backward compatibility, default 0 (bipolar: negative = close, positive = open)
  reverbSend: number;
}

export interface LoopHit {
  id: string;
  padId: number;
  beatOffset: number;
  originalBeatOffset: number;
  pass: number;
}

export interface Pattern {
  id: string;
  name: string;
  bars: number;
  hits: LoopHit[];
}

export interface SongStep {
  id: string;
  name: string;
  activePatternIds: string[];
  armedPatternId: string | null;
  repeats: number;
}

export const TransportStatus = {
  STOPPED: 'STOPPED',
  PLAYING: 'PLAYING',
  RECORDING: 'RECORDING'
} as const;

export type TransportStatus = typeof TransportStatus[keyof typeof TransportStatus];
// Application constants

// Tempo limits and defaults
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 280;
export const TEMPO_DEFAULT = 90;

// Pad bank configuration
export const PADS_PER_BANK = 16;
export const MAX_PADS = 64; // 4 banks × 16 pads
export const BANK_LETTERS = ['A', 'B', 'C', 'D'] as const;

// Arrangement configuration
export const MAX_ARRANGEMENT_BANKS = 4; // 4 song banks

// Pattern configuration
export const DEFAULT_PATTERN_BARS = 4;
export const BEATS_PER_BAR = 4;
export const PATTERN_BAR_OPTIONS = [1, 2, 4, 8, 16] as const;

// Audio configuration
export const SAMPLE_RATE = 44100;
export const DEFAULT_FILTER_CUTOFF = 20000;

// Quantization modes
export const QUANTIZE_MODES = ['none', '1/8', '1/16'] as const;
export type QuantizeMode = typeof QUANTIZE_MODES[number];

// Performance limits
export const MAX_HITS_PER_PATTERN = 50000; // Maximum hits per pattern to prevent unbounded memory growth


import { PadConfig, Pattern, SongStep, LoopHit } from '../types';
import { TEMPO_MIN, TEMPO_MAX, TEMPO_DEFAULT, DEFAULT_PATTERN_BARS } from '../constants';

/**
 * PROJECT MIGRATION SYSTEM
 * 
 * This system ensures backward compatibility when the project format changes.
 * 
 * HOW TO ADD A NEW MIGRATION:
 * 1. Increment CURRENT_PROJECT_VERSION (e.g., from '3.0.0' to '4.0.0')
 * 2. Add a new VERSION_X_X_X constant above
 * 3. Create a migrateFromX_X_X function that transforms data from the previous version
 * 4. Add the migration to the migrations array in migrateProject()
 * 5. Update detectVersion() to handle any legacy version strings
 * 
 * MIGRATION GUIDELINES:
 * - Always preserve existing data - only add defaults for missing fields
 * - Never remove fields - mark as deprecated if needed
 * - Validate transformed data structure
 * - Test with old project files before deploying
 * 
 * DEFAULT VALUES:
 * - Always apply defaults after migrations to ensure all fields exist
 * - Default values should match the current structure in types.ts
 */

// Current project format version (increment on breaking changes)
export const CURRENT_PROJECT_VERSION = '3.0.0';

// Legacy version constants for migration
const VERSION_1_0_0 = '1.0.0';
const VERSION_2_0_0 = '2.0.0';
const VERSION_3_0_0 = '3.0.0';

// Project data structure (before/after migration)
export interface ProjectData {
  version?: string;
  pads?: PadConfig[];
  patterns?: Pattern[];
  arrangementBanks?: SongStep[][];
  tempo?: number;
  samples?: Array<{
    id: string;
    name: string;
    base64Data?: string;
    data?: ArrayBuffer;
    filename?: string; // For ZIP format: reference to file in samples folder
  }>;
}

// Default pad configuration
const createDefaultPad = (id: number, keyCode: string, keyLabel: string): PadConfig => ({
  id,
  sampleId: null,
  keyCode,
  keyLabel,
  start: 0,
  end: 0,
  playMode: 'MONO',
  tune: 0,
  fineTune: 0,
  isReversed: false,
  volume: 1,
  pan: 0,
  attack: 0.001,
  release: 0.01,
  cutoff: 20000,
  resonance: 1,
  reverbSend: 0,
});

// Apply defaults to a pad, filling in missing fields
function applyPadDefaults(pad: Partial<PadConfig>, id: number, keyCode: string, keyLabel: string): PadConfig {
  const defaults = createDefaultPad(id, keyCode, keyLabel);
  return {
    ...defaults,
    ...pad,
    // Ensure numeric fields have valid defaults
    id: pad.id ?? defaults.id,
    start: typeof pad.start === 'number' ? pad.start : defaults.start,
    end: typeof pad.end === 'number' ? pad.end : defaults.end,
    tune: typeof pad.tune === 'number' ? pad.tune : defaults.tune,
    fineTune: typeof pad.fineTune === 'number' ? pad.fineTune : defaults.fineTune,
    volume: typeof pad.volume === 'number' ? pad.volume : defaults.volume,
    pan: typeof pad.pan === 'number' ? pad.pan : defaults.pan,
    attack: typeof pad.attack === 'number' ? pad.attack : defaults.attack,
    release: typeof pad.release === 'number' ? pad.release : defaults.release,
    cutoff: typeof pad.cutoff === 'number' ? pad.cutoff : defaults.cutoff,
    resonance: typeof pad.resonance === 'number' ? pad.resonance : defaults.resonance,
    reverbSend: typeof pad.reverbSend === 'number' ? pad.reverbSend : defaults.reverbSend,
    // Ensure boolean fields
    isReversed: typeof pad.isReversed === 'boolean' ? pad.isReversed : defaults.isReversed,
    // Ensure string fields
    sampleId: pad.sampleId ?? defaults.sampleId,
    keyCode: pad.keyCode ?? keyCode,
    keyLabel: pad.keyLabel ?? keyLabel,
    playMode: (pad.playMode === 'POLY' || pad.playMode === 'MONO') ? pad.playMode : defaults.playMode,
  };
}

// Apply defaults to a loop hit
function applyLoopHitDefaults(hit: Partial<LoopHit>, padId: number): LoopHit | null {
  if (!hit.id || typeof hit.padId !== 'number') {
    // Try to preserve padId from parameter if not in hit
    const finalPadId = typeof hit.padId === 'number' ? hit.padId : padId;
    if (!hit.id || finalPadId === undefined) return null;
  }
  
  return {
    id: hit.id || '',
    padId: typeof hit.padId === 'number' ? hit.padId : padId,
    beatOffset: typeof hit.beatOffset === 'number' ? hit.beatOffset : 0,
    originalBeatOffset: typeof hit.originalBeatOffset === 'number' ? hit.originalBeatOffset : hit.beatOffset ?? 0,
    pass: typeof hit.pass === 'number' ? hit.pass : 0,
  };
}

// Apply defaults to a pattern
function applyPatternDefaults(pattern: Partial<Pattern>): Pattern | null {
  if (!pattern.id) return null;
  
  return {
    id: pattern.id,
    name: typeof pattern.name === 'string' ? pattern.name : 'Pattern',
    bars: typeof pattern.bars === 'number' && pattern.bars > 0 ? pattern.bars : DEFAULT_PATTERN_BARS,
    hits: Array.isArray(pattern.hits) 
      ? pattern.hits
          .map(hit => applyLoopHitDefaults(hit, hit?.padId ?? 0))
          .filter((h): h is LoopHit => h !== null)
      : [],
  };
}

// Apply defaults to a song step
function applySongStepDefaults(step: Partial<SongStep>): SongStep | null {
  if (!step.id) return null;
  
  return {
    id: step.id,
    name: typeof step.name === 'string' ? step.name : 'Section',
    activePatternIds: Array.isArray(step.activePatternIds) 
      ? step.activePatternIds.filter((id): id is string => typeof id === 'string')
      : [],
    armedPatternId: typeof step.armedPatternId === 'string' ? step.armedPatternId : null,
    repeats: typeof step.repeats === 'number' && step.repeats > 0 ? step.repeats : 1,
  };
}

// Migration from version 1.0.0 to 2.0.0
function migrateFrom1_0_0(data: ProjectData): ProjectData {
  // Version 1.0.0 might have had different structure
  // Add any transformations needed here
  
  // Ensure all required top-level fields exist
  const migrated: ProjectData = {
    ...data,
    pads: Array.isArray(data.pads) ? data.pads : [],
    patterns: Array.isArray(data.patterns) ? data.patterns : [],
    arrangementBanks: Array.isArray(data.arrangementBanks) ? data.arrangementBanks : [],
    tempo: typeof data.tempo === 'number' ? data.tempo : 90,
    samples: Array.isArray(data.samples) ? data.samples : [],
    version: VERSION_2_0_0,
  };
  
  return migrated;
}

// Migration from version 2.0.0 to 3.0.0
function migrateFrom2_0_0(data: ProjectData): ProjectData {
  // Version 2.0.0 might have used different field names or structures
  // Add any transformations needed here
  
  // In version 3.0.0, we ensure all pad fields are present
  const migrated: ProjectData = {
    ...data,
    pads: Array.isArray(data.pads) ? data.pads.map((pad, idx) => {
      // Pad ID offset pattern from createBank: [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4]
      const padOffsetPattern = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4];
      
      // Key mappings matching the pad order
      const keyMappings: Array<[string, string]> = [
        ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'],
        ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'],
        ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'],
        ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'],
      ];
      
      let padId: number;
      let bankIdx: number;
      let arrayIndexInBank: number;
      let keyCode: string;
      let keyLabel: string;
      
      if (typeof pad?.id === 'number') {
        // Existing pad with ID - try to preserve it and infer bank/index
        padId = pad.id;
        const offset = padId % 16;
        const offsetIndex = padOffsetPattern.indexOf(offset);
        
        if (offsetIndex >= 0) {
          // Valid offset found - use it
          bankIdx = Math.floor(padId / 16) - (offset >= 13 ? 0 : 1); // Adjust for offset pattern
          bankIdx = Math.max(0, bankIdx); // Ensure non-negative
          arrayIndexInBank = offsetIndex;
          [keyCode, keyLabel] = keyMappings[offsetIndex];
        } else {
          // Offset not in pattern - calculate from array position
          bankIdx = Math.floor(idx / 16);
          arrayIndexInBank = idx % 16;
          const offset = padOffsetPattern[arrayIndexInBank];
          padId = bankIdx * 16 + offset;
          [keyCode, keyLabel] = keyMappings[arrayIndexInBank];
        }
      } else {
        // No existing ID - generate based on array position
        bankIdx = Math.floor(idx / 16);
        arrayIndexInBank = idx % 16;
        const offset = padOffsetPattern[arrayIndexInBank];
        padId = bankIdx * 16 + offset;
        [keyCode, keyLabel] = keyMappings[arrayIndexInBank];
      }
      
      return applyPadDefaults(pad as Partial<PadConfig>, padId, keyCode, keyLabel);
    }) : [],
    version: VERSION_3_0_0,
  };
  
  return migrated;
}

// Detect version from project data
function detectVersion(data: ProjectData): string {
  // Handle legacy version strings
  if (data.version === '3.0-binary' || data.version === '3.0') {
    return VERSION_3_0_0;
  }
  
  if (data.version === '2.0' || data.version === '2.0.0') {
    return VERSION_2_0_0;
  }
  
  if (data.version === '1.0' || data.version === '1.0.0') {
    return VERSION_1_0_0;
  }
  
  // Default to version 1.0.0 for projects without version
  if (!data.version) {
    return VERSION_1_0_0;
  }
  
  // If version format is unexpected, try to parse it
  return data.version;
}

// Main migration function
export function migrateProject(data: ProjectData): ProjectData {
  let currentVersion = detectVersion(data);
  let migratedData: ProjectData = { ...data };
  
  // Migration chain: apply migrations sequentially from detected version to current
  const migrations: Array<{ from: string; to: string; migrate: (data: ProjectData) => ProjectData }> = [
    { from: VERSION_1_0_0, to: VERSION_2_0_0, migrate: migrateFrom1_0_0 },
    { from: VERSION_2_0_0, to: VERSION_3_0_0, migrate: migrateFrom2_0_0 },
  ];
  
  // Apply migrations in order
  for (const migration of migrations) {
    if (currentVersion === migration.from) {
      migratedData = migration.migrate(migratedData);
      currentVersion = migration.to;
    }
  }
  
  // If we're already at or past current version, or if version is unrecognized,
  // just apply defaults and normalize
  migratedData.version = CURRENT_PROJECT_VERSION;
  
  // Apply defaults to all structures
  migratedData.pads = Array.isArray(migratedData.pads) 
    ? migratedData.pads.map((pad, idx) => {
        // Pad ID offset pattern from createBank: [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4]
        const padOffsetPattern = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4];
        const keyMappings: Array<[string, string]> = [
          ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'],
          ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'],
          ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'],
          ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'],
        ];
        
        let padId: number;
        let keyCode: string;
        let keyLabel: string;
        
        if (typeof pad?.id === 'number') {
          // Existing pad with ID - try to preserve it and infer key mapping
          padId = pad.id;
          const offset = padId % 16;
          const offsetIndex = padOffsetPattern.indexOf(offset);
          
          if (offsetIndex >= 0 && pad.keyCode && pad.keyLabel) {
            // Already has correct key mapping, use existing values
            keyCode = pad.keyCode;
            keyLabel = pad.keyLabel;
          } else if (offsetIndex >= 0) {
            // Valid offset found but missing key mapping
            [keyCode, keyLabel] = keyMappings[offsetIndex];
          } else {
            // Offset not in pattern - calculate from array position
            const arrayIndexInBank = idx % 16;
            const offset = padOffsetPattern[arrayIndexInBank];
            const bankIdx = Math.floor(idx / 16);
            padId = bankIdx * 16 + offset;
            [keyCode, keyLabel] = keyMappings[arrayIndexInBank];
          }
        } else {
          // No existing ID - generate based on array position
          const bankIdx = Math.floor(idx / 16);
          const arrayIndexInBank = idx % 16;
          const offset = padOffsetPattern[arrayIndexInBank];
          padId = bankIdx * 16 + offset;
          [keyCode, keyLabel] = keyMappings[arrayIndexInBank];
        }
        
        return applyPadDefaults(pad as Partial<PadConfig>, padId, keyCode, keyLabel);
      })
    : [];
  
  migratedData.patterns = Array.isArray(migratedData.patterns)
    ? migratedData.patterns
        .map(applyPatternDefaults)
        .filter((p): p is Pattern => p !== null)
    : [];
  
  // Ensure at least one pattern exists
  if (migratedData.patterns.length === 0) {
    const randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    migratedData.patterns = [{
      id: randomUUID(),
      name: 'Pattern 1',
      bars: DEFAULT_PATTERN_BARS,
      hits: [],
    }];
  }
  
  migratedData.arrangementBanks = Array.isArray(migratedData.arrangementBanks)
    ? migratedData.arrangementBanks.map(bank =>
        Array.isArray(bank)
          ? bank
              .map(applySongStepDefaults)
              .filter((s): s is SongStep => s !== null)
          : []
      )
    : [];
  
  // Ensure at least one arrangement bank exists
  if (migratedData.arrangementBanks.length === 0) {
    const firstPatternId = migratedData.patterns[0]?.id || '';
    const randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    migratedData.arrangementBanks = [[{
      id: randomUUID(),
      name: 'Main',
      activePatternIds: firstPatternId ? [firstPatternId] : [],
      armedPatternId: firstPatternId || null,
      repeats: 1,
    }]];
  }
  
  // Ensure tempo is valid
  migratedData.tempo = typeof migratedData.tempo === 'number' 
    ? Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, migratedData.tempo))
    : TEMPO_DEFAULT;
  
  // Normalize samples array
  migratedData.samples = Array.isArray(migratedData.samples) ? migratedData.samples : [];
  
  return migratedData;
}

// Validate project data structure
export function validateProject(data: ProjectData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.pads || !Array.isArray(data.pads)) {
    errors.push('Missing or invalid pads array');
  }
  
  if (!data.patterns || !Array.isArray(data.patterns) || data.patterns.length === 0) {
    errors.push('Missing or invalid patterns array (must have at least one pattern)');
  }
  
  if (!data.arrangementBanks || !Array.isArray(data.arrangementBanks) || data.arrangementBanks.length === 0) {
    errors.push('Missing or invalid arrangementBanks array (must have at least one bank)');
  }
  
  if (typeof data.tempo !== 'number' || data.tempo < TEMPO_MIN || data.tempo > TEMPO_MAX) {
    errors.push(`Invalid tempo (must be between ${TEMPO_MIN} and ${TEMPO_MAX})`);
  }
  
  // Validate patterns
  if (data.patterns) {
    data.patterns.forEach((pattern, idx) => {
      if (!pattern.id) errors.push(`Pattern ${idx} is missing id`);
      if (typeof pattern.bars !== 'number' || pattern.bars < 1) {
        errors.push(`Pattern ${idx} has invalid bars value`);
      }
      if (!Array.isArray(pattern.hits)) {
        errors.push(`Pattern ${idx} has invalid hits array`);
      }
    });
  }
  
  // Validate pads
  if (data.pads) {
    data.pads.forEach((pad, idx) => {
      if (typeof pad.id !== 'number') errors.push(`Pad ${idx} is missing or has invalid id`);
      if (typeof pad.sampleId !== 'string' && pad.sampleId !== null) {
        errors.push(`Pad ${idx} has invalid sampleId`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


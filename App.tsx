import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SampleData, PadConfig, TransportStatus, LoopHit, Pattern, SongStep } from './types';
import { audioEngine, TriggerInfo } from './services/audioEngine';
import { getAllSamples, saveSample, deleteSampleFromDB, initDB, clearAllSamples } from './services/db';
import { migrateProject, validateProject, CURRENT_PROJECT_VERSION } from './services/projectMigration';
import PadGrid from './components/PadGrid';
import WaveformEditor from './components/WaveformEditor';
import SegmentDisplay from './components/SegmentDisplay';
import SampleLibrary from './components/SampleLibrary';
import TempoDial from './components/TempoDial';
import Metronome from './components/Metronome';
import QntBarsOverlay from './components/QntBarsOverlay';
import SongModeOverlay from './components/SongModeOverlay';
import ThemeToggleButton from './components/ThemeToggleButton';
import EffectsPanel from './components/EffectsPanel';
import SongBankOverlay from './components/SongBankOverlay';
import PadBankOverlay from './components/PadBankOverlay';
import Dividers from './components/Dividers';
import LevelMeter from './components/LevelMeter';
import { HintProvider, HintDisplay, useHint } from './components/HintDisplay';
import TransportButtons from './components/TransportButtons';
import { randomUUID } from './utils/uuid';
import { safeLocalStorageGet, safeLocalStorageSet, createDebouncedLocalStorageWrite } from './utils/localStorage';
import { isValidPad, clampTempo } from './utils/validation';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils/encoding';
import { createBank } from './utils/pads';
import { isTyping } from './utils/dom';
import { formatTimeForDisplay } from './utils/formatting';
import { TEMPO_MIN, TEMPO_MAX, TEMPO_DEFAULT, PADS_PER_BANK, MAX_PADS, MAX_ARRANGEMENT_BANKS, DEFAULT_PATTERN_BARS, BEATS_PER_BAR, BANK_LETTERS, PATTERN_BAR_OPTIONS, MAX_HITS_PER_PATTERN } from './constants';
import loadJSZip from './services/jszip-shim';
import { showError, showWarning } from './utils/errors';

// Theme definitions
export type Theme = 'blk' | 'inv' | 'amb' | 'prp' | 'neo' | 'sky' | 'red' | 'hzd' | 'blu' | 'arc';

const THEMES: Theme[] = ['blk', 'inv', 'amb', 'prp', 'neo', 'sky', 'red', 'hzd', 'blu', 'arc'];

const getThemeColors = (theme: Theme): { bg: string; fg: string } => {
  switch (theme) {
    case 'blk':
      return { bg: '#0A0908', fg: '#F0EDEE' };
    case 'inv':
      return { bg: '#F2F4F3', fg: '#0A0908' };
    case 'amb':
      return { bg: '#0A0908', fg: '#EEC643' };
    case 'prp':
      return { bg: '#6E2594', fg: '#ECD444' };
    case 'neo':
      return { bg: '#0A100D', fg: '#5CF64A' };
    case 'sky':
      return { bg: '#F8FFE5', fg: '#2BA9FD' };
    case 'red':
      return { bg: '#0A0908', fg: '#EA2B1F' };
    case 'hzd':
      return { bg: '#FABC3C', fg: '#EA2B1F' };
    case 'blu':
      return { bg: '#29339B', fg: '#FBFEF9' };
    case 'arc':
      return { bg: '#EDEEC0', fg: '#433E0E' };
    default:
      return { bg: '#0A0908', fg: '#F0EDEE' };
  }
};

const INITIAL_PATTERN: Pattern = {
  id: randomUUID(),
  name: 'Pattern 1',
  bars: DEFAULT_PATTERN_BARS,
  hits: []
};

const createDefaultArrangement = (firstPatternId: string): SongStep[] => [
  { id: randomUUID(), name: 'Main', activePatternIds: [firstPatternId], armedPatternId: firstPatternId, repeats: 1 }
];

export default function App() {
  const [samples, setSamples] = useState<SampleData[]>([]);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isExportingStems, setIsExportingStems] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Initialize patterns first to ensure we have at least one
  const [patterns, setPatterns] = useState<Pattern[]>(() => {
    const saved = safeLocalStorageGet<Pattern[]>('bpc_patterns_v8', []);
    return saved.length > 0 ? saved : [INITIAL_PATTERN];
  });
  
  const [pads, setPads] = useState<PadConfig[]>(() => {
    return safeLocalStorageGet<PadConfig[]>('bpc_pads_v8', createBank(0));
  });
  const [activeBankIdx, setActiveBankIdx] = useState(0);
  
  const [currentPatternId, setCurrentPatternId] = useState<string>(() => {
    const saved = safeLocalStorageGet<Pattern[]>('bpc_patterns_v8', []);
    const initialPatterns = saved.length > 0 ? saved : [INITIAL_PATTERN];
    return initialPatterns[0]?.id || randomUUID();
  });
  const [editingPatternId, setEditingPatternId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  
  const [arrangementBanks, setArrangementBanks] = useState<SongStep[][]>(() => {
    const saved = safeLocalStorageGet<SongStep[][]>('bpc_arrangements_v8', []);
    if (saved.length > 0) return saved;
    const savedPatterns = safeLocalStorageGet<Pattern[]>('bpc_patterns_v8', []);
    const initialPatterns = savedPatterns.length > 0 ? savedPatterns : [INITIAL_PATTERN];
    const firstPatternId = initialPatterns[0]?.id || randomUUID();
    return [createDefaultArrangement(firstPatternId)];
  });
  const [activeArrIdx, setActiveArrIdx] = useState(0);
  
  const [isSongMode, setIsSongMode] = useState(false);
  const [isSectionLoopActive, setIsSectionLoopActive] = useState(false);
  const [currentSongStepIdx, setCurrentSongStepIdx] = useState(0);
  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [tempo, setTempo] = useState(() => {
    const saved = safeLocalStorageGet<string>('bpc_tempo', TEMPO_DEFAULT.toString());
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? TEMPO_DEFAULT : clampTempo(parsed);
  });
  const [quantizeMode, setQuantizeMode] = useState<'none' | '1/8' | '1/16'>(() => {
    const saved = safeLocalStorageGet<'none' | '1/8' | '1/16'>('bpc_quantize', 'none');
    return ['none', '1/8', '1/16'].includes(saved) ? saved : 'none';
  });
  const [transport, setTransport] = useState<TransportStatus>(TransportStatus.STOPPED);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(true);
  const [activePadIds, setActivePadIds] = useState<Set<number>>(new Set());
  const [lastTriggerInfo, setLastTriggerInfo] = useState<{padId: number, trigger: TriggerInfo} | null>(null);
  const [currentPass, setCurrentPass] = useState(0);
  const [currentSongTime, setCurrentSongTime] = useState(0);
  const [frameScale, setFrameScale] = useState(1);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = safeLocalStorageGet<string>('bpc_theme', 'blk');
    return THEMES.includes(saved as Theme) ? (saved as Theme) : 'blk';
  });

  // Drag and Drop State
  const [draggedStepIdx, setDraggedStepIdx] = useState<number | null>(null);
  const [dropIndicatorIdx, setDropIndicatorIdx] = useState<number | null>(null);
  
  // Waveform editor view state per pad (zoom, scrollOffset, focusMode)
  // Use ref to avoid re-renders during interaction - updates don't trigger re-renders
  const waveformViewStateRef = useRef<Map<number, { zoom: number; scrollOffset: number; focusMode: 'start' | 'end' }>>(new Map());

  // Tempo Tapping / Dragging State
  const [isTapping, setIsTapping] = useState(false);
  const [isDraggingTempo, setIsDraggingTempo] = useState(false);
  const tapHistoryRef = useRef<number[]>([]);
  const lastTapTimeRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const dragStartTempoRef = useRef<number>(0);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const beatIndicatorRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const songStartTimeRef = useRef(0);
  const sectionStartTimeRef = useRef(0);
  const lastScheduledTimeRef = useRef(0); 
  const lastScheduledHitIdsRef = useRef<Map<string, Set<string>>>(new Map()); 
  const nextMetronomeTimeRef = useRef(0);
  const metronomeBeatRef = useRef(0);
  const lastVisualBeatRef = useRef(-1);
  const timerIDRef = useRef<number | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activePadTimeoutRefs = useRef<Map<number, number>>(new Map());
  const lastTriggerInfoRef = useRef<{padId: number, trigger: TriggerInfo} | null>(null);
  const previewActiveRef = useRef<boolean>(false);

  const padsRef = useRef<PadConfig[]>(pads);
  const patternsRef = useRef<Pattern[]>(patterns);
  const samplesRef = useRef<SampleData[]>([]);
  const transportRef = useRef<TransportStatus>(TransportStatus.STOPPED);
  const isSongModeRef = useRef<boolean>(isSongMode);
  const isSectionLoopActiveRef = useRef<boolean>(isSectionLoopActive);
  const currentPatternIdRef = useRef<string>(currentPatternId);
  const arrangementBanksRef = useRef<SongStep[][]>(arrangementBanks);
  const activeArrIdxRef = useRef<number>(activeArrIdx);
  const currentSongStepIdxRef = useRef<number>(0);
  const tempoRef = useRef(tempo);
  const isMetronomeEnabledRef = useRef(isMetronomeEnabled);

  useEffect(() => { padsRef.current = pads; }, [pads]);
  useEffect(() => { patternsRef.current = patterns; }, [patterns]);
  useEffect(() => { samplesRef.current = samples; }, [samples]);
  useEffect(() => { transportRef.current = transport; }, [transport]);
  useEffect(() => { isSongModeRef.current = isSongMode; }, [isSongMode]);
  useEffect(() => { isSectionLoopActiveRef.current = isSectionLoopActive; }, [isSectionLoopActive]);
  useEffect(() => { currentPatternIdRef.current = currentPatternId; }, [currentPatternId]);
  useEffect(() => { arrangementBanksRef.current = arrangementBanks; }, [arrangementBanks]);
  useEffect(() => { activeArrIdxRef.current = activeArrIdx; }, [activeArrIdx]);
  useEffect(() => { lastTriggerInfoRef.current = lastTriggerInfo; }, [lastTriggerInfo]);
  useEffect(() => { currentSongStepIdxRef.current = currentSongStepIdx; }, [currentSongStepIdx]);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { isMetronomeEnabledRef.current = isMetronomeEnabled; }, [isMetronomeEnabled]);

  // Apply theme colors via CSS custom properties
  // Only need to set 2 base colors - all other colors derive automatically
  useEffect(() => {
    const colors = getThemeColors(theme);
    const root = document.documentElement;
    
    // Set base colors
    root.style.setProperty('--color-bg', colors.bg);
    root.style.setProperty('--color-fg', colors.fg);
    
    // All other colors are automatically derived via CSS color-mix() in the stylesheet
    // No need to manually calculate or set them here!
  }, [theme]);

  // Debounced localStorage writes to prevent quota errors
  const debouncedSavePads = useMemo(() => createDebouncedLocalStorageWrite('bpc_pads_v8', 300), []);
  const debouncedSavePatterns = useMemo(() => createDebouncedLocalStorageWrite('bpc_patterns_v8', 300), []);
  const debouncedSaveArrangements = useMemo(() => createDebouncedLocalStorageWrite('bpc_arrangements_v8', 300), []);
  
  // Migration: Limit to 4 banks (4 songs, 64 pads)
  useEffect(() => {
    // Migrate arrangement banks: keep only first 4
    setArrangementBanks(prev => {
      if (prev.length > MAX_ARRANGEMENT_BANKS) {
        return prev.slice(0, MAX_ARRANGEMENT_BANKS);
      }
      return prev;
    });
    // Ensure activeArrIdx is within bounds
    setActiveArrIdx(prev => {
      if (prev >= MAX_ARRANGEMENT_BANKS) {
        return Math.max(0, MAX_ARRANGEMENT_BANKS - 1);
      }
      return prev;
    });
  }, []); // Run once on mount

  useEffect(() => {
    // Migrate pads: keep only first 64 pads (4 banks)
    setPads(prev => {
      if (prev.length > MAX_PADS) {
        const trimmed = prev.slice(0, MAX_PADS);
        // Also update activeBankIdx if needed
        const maxBanks = Math.min(Math.floor(trimmed.length / PADS_PER_BANK), MAX_ARRANGEMENT_BANKS);
        setActiveBankIdx(current => {
          if (current >= maxBanks) {
            return Math.max(0, maxBanks - 1);
          }
          return current;
        });
        return trimmed;
      }
      // Ensure activeBankIdx is within bounds even if pads don't need trimming
      const maxBanks = Math.min(Math.floor(prev.length / PADS_PER_BANK), MAX_ARRANGEMENT_BANKS);
      setActiveBankIdx(current => {
        if (current >= maxBanks) {
          return Math.max(0, maxBanks - 1);
        }
        return current;
      });
      return prev;
    });
  }, []); // Run once on mount

  useEffect(() => { debouncedSavePads(pads); }, [pads, debouncedSavePads]);
  useEffect(() => { debouncedSavePatterns(patterns); }, [patterns, debouncedSavePatterns]);
  useEffect(() => { debouncedSaveArrangements(arrangementBanks); }, [arrangementBanks, debouncedSaveArrangements]);
  useEffect(() => { safeLocalStorageSet('bpc_tempo', tempo.toString()); }, [tempo]);
  useEffect(() => { safeLocalStorageSet('bpc_quantize', quantizeMode); }, [quantizeMode]);

  // Calculate and update frame scale on mount and window resize
  useEffect(() => {
    const calculateScale = () => {
      // Account for 20px padding on each side (40px total)
      const availableWidth = window.innerWidth - 40;
      const availableHeight = window.innerHeight - 40;
      const scale = Math.min(availableWidth / 1288, availableHeight / 833);
      setFrameScale(scale);
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  const loadSamplesFromDB = useCallback(async () => {
    const stored = await getAllSamples();
    
    const loaded: SampleData[] = [];
    for (const s of stored) {
      try {
        const buffer = await audioEngine.decode(s.data);
        loaded.push({ id: s.id, name: s.name, buffer });
      } catch (e) {
        // Sample decode failure - user should know which sample failed
        showWarning(`Sample "${s.name}" could not be loaded. It may be corrupted.`);
      }
    }
    
    setSamples(loaded);
  }, []);

  useEffect(() => { loadSamplesFromDB(); }, [loadSamplesFromDB]);

  // Optimized batch import handler with duplicate detection, progress tracking, and parallel processing
  const processBatchImport = useCallback(async (
    files: File[],
    existingSamples: SampleData[],
    onProgress: (current: number, total: number) => void
  ): Promise<{ results: SampleData[]; errors: string[]; skipped: string[] }> => {
    const CONCURRENCY_LIMIT = 4;
    const audioExtensions = ['.wav', '.mp3', '.ogg', '.aac', '.m4a', '.flac', '.webm', '.opus'];
    
    // Filter to only audio files and check for duplicates
    const audioFiles: File[] = [];
    const skipped: string[] = [];
    
    // Build a map of existing sample names and sizes for duplicate detection
    // Get stored samples from IndexedDB once for size checking
    const stored = await getAllSamples();
    const existingSamplesMap = new Map<string, number>(); // name -> size
    for (const storedSample of stored) {
      existingSamplesMap.set(storedSample.name.toLowerCase(), storedSample.data.byteLength);
    }
    
    for (const file of files) {
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAudioFile = file.type.startsWith('audio/') || audioExtensions.includes(fileExt);
      
      if (!isAudioFile) {
        continue; // Skip non-audio files silently
      }
      
      // Check for duplicates by name and size
      const fileNameLower = file.name.toLowerCase();
      const existingSize = existingSamplesMap.get(fileNameLower);
      if (existingSize !== undefined && existingSize === file.size) {
        // Duplicate file - skip silently (user doesn't need notification)
        skipped.push(file.name);
        continue;
      }
      
      audioFiles.push(file);
    }
    
    if (audioFiles.length === 0) {
      return { results: [], errors: [], skipped };
    }
    
    const results: SampleData[] = [];
    const errors: string[] = [];
    
    // Helper function to process a single file with timeout protection
    const processFile = async (file: File, timeoutMs: number = 30000): Promise<SampleData | null> => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      try {
        // Add timeout to prevent hanging on corrupted/large files
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Timeout: ${file.name} took too long to process`)), timeoutMs);
        });
        
        const processPromise = (async () => {
          const ab = await file.arrayBuffer();
          const abCopy = ab.slice(0);
          const buffer = await audioEngine.decode(abCopy);
          const id = randomUUID();
          await saveSample(id, file.name, ab, 0, buffer.duration);
          return { id, name: file.name, buffer };
        })();
        
        const result = await Promise.race([processPromise, timeoutPromise]);
        // Clear timeout if process completed successfully
        if (timeoutHandle) clearTimeout(timeoutHandle);
        return result;
      } catch (err) {
        // Clear timeout on error
        if (timeoutHandle) clearTimeout(timeoutHandle);
        // Import failure - track for user feedback at end of batch
        return null;
      }
    };
    
    // Process files in batches with concurrency limit
    for (let i = 0; i < audioFiles.length; i += CONCURRENCY_LIMIT) {
      const batch = audioFiles.slice(i, i + CONCURRENCY_LIMIT);
      
      // Process batch in parallel with Promise.allSettled
      const batchPromises = batch.map(file => processFile(file));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect results and errors from batch
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        } else {
          errors.push(batch[j].name);
        }
      }
      
      // Update progress after each batch
      const processedCount = Math.min(i + CONCURRENCY_LIMIT, audioFiles.length);
      onProgress(processedCount, audioFiles.length);
    }
    
    return { results, errors, skipped };
  }, []);

  // Pre-warm AudioContext on page load for live performance
  // Note: Will fail silently due to autoplay policy until user interaction - this is expected
  useEffect(() => {
    audioEngine.ctx.resume().catch(() => {
      // Autoplay policy requires user gesture - this is expected behavior, not an error
      // Audio will work fine once user clicks any pad or starts playback
    });
  }, []);

  // Battery/performance mode detection for live performance warnings
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const checkBattery = () => {
          if (!battery.charging && battery.level < 0.2) {
            console.warn('⚠️ Low battery detected - may affect audio performance. Consider plugging in your device.');
          }
        };
        checkBattery();
        battery.addEventListener('chargingchange', checkBattery);
        battery.addEventListener('levelchange', checkBattery);
        return () => {
          battery.removeEventListener('chargingchange', checkBattery);
          battery.removeEventListener('levelchange', checkBattery);
        };
      }).catch(() => {
        // Battery API not available or failed - ignore silently
      });
    }
  }, []);

  const getBeatDuration = () => 60 / tempoRef.current;
  const getPatternDuration = (p: Pattern) => getBeatDuration() * BEATS_PER_BAR * p.bars;

  const currentArrangement = useMemo(() => arrangementBanks[activeArrIdx] || [], [arrangementBanks, activeArrIdx]);

  const totalSongDuration = useMemo(() => {
    const beatDur = 60 / tempo;
    if (!isSongMode) {
      const p = patterns.find(pat => pat.id === currentPatternId) || patterns[0];
      return getPatternDuration(p);
    }
    return currentArrangement.reduce((total, step) => {
        const stepPats = step.activePatternIds.map(id => patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
        const baseDur = stepPats.reduce((max, p) => Math.max(max, getPatternDuration(p)), 0);
        return total + (baseDur * step.repeats);
    }, 0);
  }, [arrangementBanks, activeArrIdx, tempo, patterns, currentPatternId, isSongMode]);

  const stopPreview = useCallback(() => {
    if (previewSourceRef.current) {
      try {
        audioEngine.stopExclusiveScheduled(audioEngine.ctx.currentTime, 'preview');
        previewSourceRef.current.stop();
      } catch (e) {}
      previewSourceRef.current = null;
      setPreviewActive(false);
      setPreviewingPadId(null);
    }
  }, []);

  const stopRegularPadPlayback = useCallback(() => {
    if (lastTriggerInfoRef.current) {
      try {
        lastTriggerInfoRef.current.trigger.source.stop();
      } catch (e) {}
      setLastTriggerInfo(null);
      lastTriggerInfoRef.current = null;
    }
  }, []);

  const killAllAudio = useCallback(() => {
    try {
      audioEngine.stopAll();
    } catch (e) {
      // Non-critical: audio stop failure doesn't break functionality
      // Log but don't interrupt user
    }
    stopPreview();
    setLastTriggerInfo(null);
  }, [stopPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop scheduler
      if (timerIDRef.current) {
        cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
      }
      // Clean up all pad timeout timers
      activePadTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId));
      activePadTimeoutRefs.current.clear();
      // Release wake lock
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
      // Stop all audio
      killAllAudio();
    };
  }, [killAllAudio]);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const interval = now - lastTapTimeRef.current;
    if (interval > 2000) {
      tapHistoryRef.current = [];
    } else {
      tapHistoryRef.current.push(interval);
      if (tapHistoryRef.current.length > 4) tapHistoryRef.current.shift();
      if (tapHistoryRef.current.length >= 2) {
        const avg = tapHistoryRef.current.reduce((a, b) => a + b) / tapHistoryRef.current.length;
        const bpm = Math.round(60000 / avg);
        setTempo(clampTempo(bpm));
      }
    }
    lastTapTimeRef.current = now;
    setIsTapping(true);
    setTimeout(() => setIsTapping(false), 100);
  }, []);

  const handleTempoMouseDown = (e: React.MouseEvent) => {
    setIsDraggingTempo(true);
    dragStartYRef.current = e.clientY;
    dragStartTempoRef.current = tempo;
    const handleGlobalMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = dragStartYRef.current - moveEvent.clientY;
      const sensitivity = 4;
      const newTempo = Math.round(dragStartTempoRef.current + deltaY / sensitivity);
      setTempo(clampTempo(newTempo));
    };
    const handleGlobalMouseUp = () => {
      setIsDraggingTempo(false);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    document.body.style.cursor = 'ns-resize';
  };

  const [previewActive, setPreviewActive] = useState(false);
  const [previewingPadId, setPreviewingPadId] = useState<number | null>(null);
  
  useEffect(() => { previewActiveRef.current = previewActive; }, [previewActive]);

  const triggerPad = useCallback((padId: number, offsetOverride?: number, looping: boolean = false) => {
    const pad = padsRef.current.find(p => p.id === padId);
    if (!isValidPad(pad)) return;
    const sample = samplesRef.current.find(s => s.id === pad!.sampleId);
    if (!sample) {
      // Pad has no sample assigned - silent return (not an error state)
      return;
    }

    const contextId = offsetOverride !== undefined ? 'preview' : 'manual';
    
    // Ensure AudioContext is running before playback
    // User just clicked a pad, so resume() should succeed (user gesture exists)
    // If it fails, playPad() will handle the error appropriately
    if (audioEngine.ctx.state !== 'running') {
      audioEngine.resume().catch(() => {
        // Resume may still fail due to timing, but playPad will handle it
      });
    }

    if (offsetOverride !== undefined) {
      // Starting preview playback - stop any existing preview and regular pad playback
      if (previewSourceRef.current) {
         try { previewSourceRef.current.stop(); } catch (e) {}
         previewSourceRef.current = null;
      }
      stopRegularPadPlayback();
      setPreviewActive(true);
      setPreviewingPadId(padId);
    } else {
      // Starting regular pad playback - stop any existing preview playback
      stopPreview();
    }

    let trigger: TriggerInfo;
    try {
      trigger = audioEngine.playPad(sample.buffer, pad, offsetOverride, contextId, looping);
    } catch (err) {
      showError(
        `Failed to play pad ${padId}`,
        err instanceof Error ? err.message : "The sample may be corrupted."
      );
      return;
    }
    
    // Always update lastTriggerInfo for non-preview playback or when looping is enabled
    // This ensures the playhead visualization reflects the current looping state
    if (offsetOverride === undefined || looping) {
       setLastTriggerInfo({ padId, trigger });
    }
    
    if (offsetOverride !== undefined) {
      previewSourceRef.current = trigger.source;
      trigger.source.onended = () => {
        if (previewSourceRef.current === trigger.source) {
          previewSourceRef.current = null;
          setPreviewActive(false);
          setPreviewingPadId(null);
        }
      };
    }

    if (transportRef.current === TransportStatus.RECORDING && offsetOverride === undefined) {
      const beatDur = getBeatDuration();
      const now = audioEngine.ctx.currentTime;
      
      let targetPatternId = currentPatternIdRef.current;
      if (isSongModeRef.current) {
        const step = arrangementBanksRef.current[activeArrIdxRef.current][currentSongStepIdxRef.current];
        if (step && step.armedPatternId) targetPatternId = step.armedPatternId;
      }

      const targetPattern = patternsRef.current.find(p => p.id === targetPatternId);
      if (!targetPattern) return;

      const pDur = getPatternDuration(targetPattern);
      const timeInStep = now - sectionStartTimeRef.current;
      const relativeTimeInLoop = timeInStep % pDur;
      
      let rawBeatOffset = relativeTimeInLoop / beatDur;
      let finalBeatOffset = rawBeatOffset;

      if (quantizeMode !== 'none') {
        const grid = quantizeMode === '1/8' ? 0.5 : 0.25;
        finalBeatOffset = Math.round(rawBeatOffset / grid) * grid;
        const maxBeats = targetPattern.bars * BEATS_PER_BAR;
        if (finalBeatOffset >= maxBeats) finalBeatOffset = maxBeats - 0.0001; 
      }
      
      const newHit: LoopHit = { 
        id: randomUUID(), 
        padId, 
        beatOffset: finalBeatOffset, 
        originalBeatOffset: rawBeatOffset, 
        pass: currentPass 
      };
      
      setPatterns(prev => prev.map(p => {
        if (p.id === targetPatternId) {
          const newHits = [...p.hits, newHit];
          // Limit hits to prevent unbounded memory growth - keep only the most recent hits
          const limitedHits = newHits.length > MAX_HITS_PER_PATTERN 
            ? newHits.slice(-MAX_HITS_PER_PATTERN)
            : newHits;
          return { ...p, hits: limitedHits };
        }
        return p;
      }));
    }

    setActivePadIds(prev => new Set(prev).add(padId));
    
    // Clean up any existing timeout for this pad
    const existingTimeout = activePadTimeoutRefs.current.get(padId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout to remove pad from active set
    const timeoutId = window.setTimeout(() => {
      setActivePadIds(prev => {
        const next = new Set(prev);
        next.delete(padId);
        return next;
      });
      activePadTimeoutRefs.current.delete(padId);
    }, 80);
    
    activePadTimeoutRefs.current.set(padId, timeoutId);
  }, [currentPass, quantizeMode, killAllAudio, stopPreview, stopRegularPadPlayback]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const currentIndex = THEMES.indexOf(prev);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      const nextTheme = THEMES[nextIndex];
      safeLocalStorageSet('bpc_theme', nextTheme);
      return nextTheme;
    });
  }, []);

  const toggleTransportRef = useRef<() => void>(() => {});

  const scheduler = useCallback(() => {
    if (transportRef.current === TransportStatus.STOPPED) {
        if (timerIDRef.current) cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
        return;
    }

    const now = audioEngine.ctx.currentTime;
    const beatDur = getBeatDuration();
    
    let playingPatterns: Pattern[] = [];
    let stepTotalDur = 0;

    if (isSongModeRef.current) {
      const arrangement = arrangementBanksRef.current[activeArrIdxRef.current];
      const step = arrangement[currentSongStepIdxRef.current];
      if (!step) { toggleTransportRef.current(); return; }
      playingPatterns = step.activePatternIds.map(id => patternsRef.current.find(p => p.id === id)).filter(Boolean) as Pattern[];
      const baseDur = playingPatterns.reduce((max, p) => Math.max(max, getPatternDuration(p)), 0);
      stepTotalDur = baseDur * step.repeats;
    } else {
      const p = patternsRef.current.find(pat => pat.id === currentPatternIdRef.current) || patternsRef.current[0];
      playingPatterns = [p];
      stepTotalDur = getPatternDuration(p);
    }

    const elapsedInStep = now - sectionStartTimeRef.current;
    const currentBaseDur = playingPatterns.reduce((max, p) => Math.max(max, getPatternDuration(p)), 0);
    
    // Protection against division by zero - recover gracefully
    if (currentBaseDur <= 0 || beatDur <= 0) {
      // Invalid state - stop transport to prevent infinite loop
      if (transportRef.current !== TransportStatus.STOPPED) {
        toggleTransportRef.current();
        showWarning("Playback stopped", "Invalid pattern or tempo detected");
      }
      if (timerIDRef.current) {
        cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
      }
      return;
    }

    const exactVisualBeat = Math.floor((elapsedInStep % currentBaseDur) / beatDur);
    if (exactVisualBeat !== lastVisualBeatRef.current) {
        lastVisualBeatRef.current = exactVisualBeat;
        beatIndicatorRefs.current.forEach((ref, idx) => {
            if (!ref) return;
            const isDownbeat = idx % BEATS_PER_BAR === 0;
            if (idx === exactVisualBeat) ref.style.backgroundColor = 'var(--color-fg)';
            else ref.style.backgroundColor = isDownbeat ? 'var(--color-downbeat-indicator)' : 'var(--color-beat-indicator)';
        });
    }

    if (elapsedInStep >= stepTotalDur) {
      if (isSongModeRef.current && !isSectionLoopActiveRef.current) {
        const arrangement = arrangementBanksRef.current[activeArrIdxRef.current];
        const nextIdx = (currentSongStepIdxRef.current + 1) % arrangement.length;
        setCurrentSongStepIdx(nextIdx);
        currentSongStepIdxRef.current = nextIdx;
      }
      const newSectionStart = sectionStartTimeRef.current + stepTotalDur;
      sectionStartTimeRef.current = newSectionStart;
      // Reset scheduling window to new section start to catch all hits from the beginning
      lastScheduledTimeRef.current = newSectionStart - 0.001;
      lastScheduledHitIdsRef.current.clear();
      setCurrentPass(p => p + 1);
    }

    if (progressBarRef.current) progressBarRef.current.style.width = `${Math.min(100, (elapsedInStep / stepTotalDur) * 100)}%`;
    // FIX: Apply modulo to current time to ensure it wraps correctly during loops for both Song and Pattern mode
    setCurrentSongTime(totalSongDuration > 0 ? (now - songStartTimeRef.current) % totalSongDuration : 0);

    // Tempo-aware lookahead: ensure we can schedule at least 2 beats ahead
    // At high BPM, fixed 200ms may not cover one beat, causing missed triggers
    // Minimum 100ms for system stability, maximum 500ms to prevent excessive scheduling
    const lookAhead = Math.max(0.1, Math.min(0.5, beatDur * 2));
    
    while (nextMetronomeTimeRef.current < now + lookAhead) {
        if (isMetronomeEnabledRef.current) audioEngine.playMetronome(nextMetronomeTimeRef.current, metronomeBeatRef.current % BEATS_PER_BAR === 0);
        nextMetronomeTimeRef.current += beatDur;
        metronomeBeatRef.current++;
    }

    // Clean up old scheduled hit IDs periodically to prevent unbounded growth
    if (lastScheduledHitIdsRef.current.size > 1000) {
      lastScheduledHitIdsRef.current.clear();
    }

    // Track the latest scheduled hit time to ensure we don't miss hits after loops
    let latestScheduledTime = lastScheduledTimeRef.current;

    playingPatterns.forEach(pattern => {
      const pDur = getPatternDuration(pattern);
      if (pDur <= 0) return; // Skip invalid patterns
      if (!lastScheduledHitIdsRef.current.has(pattern.id)) lastScheduledHitIdsRef.current.set(pattern.id, new Set());
      const scheduledSet = lastScheduledHitIdsRef.current.get(pattern.id)!;

      pattern.hits.forEach(hit => {
        const iterationInPattern = Math.floor(elapsedInStep / pDur);
        const hitAbsoluteTime = sectionStartTimeRef.current + (iterationInPattern * pDur) + (hit.beatOffset * beatDur);
        const hitKey = `${hit.id}_${iterationInPattern}`;

        if (hitAbsoluteTime >= lastScheduledTimeRef.current && hitAbsoluteTime < now + lookAhead && !scheduledSet.has(hitKey)) {
          const pad = padsRef.current.find(p => p.id === hit.padId);
          if (!isValidPad(pad)) return;
          const sample = samplesRef.current.find(s => s.id === pad!.sampleId);
          if (sample) {
            try {
              audioEngine.playPadScheduled(sample.buffer, pad!, hitAbsoluteTime, pattern.id);
              
              // Update latest scheduled time to ensure we don't regress
              latestScheduledTime = Math.max(latestScheduledTime, hitAbsoluteTime);
              
              // Schedule visual feedback to flash the pad at the exact trigger time
              const delayMs = Math.max(0, (hitAbsoluteTime - now) * 1000);
              setTimeout(() => {
                setActivePadIds(prev => new Set(prev).add(hit.padId));
                setTimeout(() => setActivePadIds(prev => {
                  const next = new Set(prev);
                  next.delete(hit.padId);
                  return next;
                }), 80);
              }, delayMs);
            } catch (e) {
              // Critical: scheduling failure means audio won't play - user must know
              showError(
                `Failed to play sample on pad ${pad!.id}`,
                "The sample may be corrupted or the audio system is unavailable. Try reloading the sample."
              );
            }
          }
          scheduledSet.add(hitKey);
        }
      });
    });

    // Update lastScheduledTime to track scheduling progress
    // Use the latest scheduled hit time if any hits were scheduled
    // Otherwise, advance to prevent rescheduling past events while maintaining lookahead window
    // This ensures hits at section start are never skipped, even when scheduler runs slightly late
    if (latestScheduledTime > lastScheduledTimeRef.current) {
      // We scheduled some hits - track the latest one
      lastScheduledTimeRef.current = latestScheduledTime;
    } else {
      // No new hits scheduled - advance window to prevent rescheduling past events
      // But keep it before 'now' to maintain lookahead for future scheduler ticks
      lastScheduledTimeRef.current = Math.max(lastScheduledTimeRef.current, now - lookAhead);
    }
    timerIDRef.current = requestAnimationFrame(scheduler);
  }, [killAllAudio, totalSongDuration]);

  // Handle page visibility changes - ensure audio continues during live performance
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible: ensure AudioContext is running and resume scheduler if needed
        audioEngine.ctx.resume().catch(() => {
          // Autoplay policy may prevent resume until user gesture - this is expected
          // Audio will resume automatically on next user interaction (pad click, transport, etc.)
        });
        if (transportRef.current !== TransportStatus.STOPPED && !timerIDRef.current) {
          scheduler();
        }
      }
      // Do NOT pause scheduler when hidden - audio must continue for live performance
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scheduler]);

  // Wake Lock API for live performance - prevent tab suspension
  const wakeLockRef = useRef<any>(null); // WakeLockSentinel type
  
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const wakeLock = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        wakeLock.addEventListener('release', () => {
          console.warn('Wake lock released - tab may suspend');
          wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn('Wake Lock API not available or failed:', err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        // Wake lock release failure is non-critical - silent
      }
    }
  }, []);

  const toggleTransport = useCallback(() => {
    // If preview is playing, stop it first without toggling transport
    // Check both ref and state to catch all cases
    if (previewSourceRef.current || previewActiveRef.current) {
      stopPreview();
      return;
    }
    
    // If regular pad playback is happening, stop it first without toggling transport
    if (lastTriggerInfoRef.current) {
      stopRegularPadPlayback();
      return;
    }

    const isSongPlaying = transportRef.current !== TransportStatus.STOPPED;

    if (isSongPlaying) {
      transportRef.current = TransportStatus.STOPPED;
      setTransport(TransportStatus.STOPPED);
      killAllAudio();
      if (timerIDRef.current) cancelAnimationFrame(timerIDRef.current);
      timerIDRef.current = null;
      setCurrentSongTime(0); 
      setCurrentSongStepIdx(0);
      currentSongStepIdxRef.current = 0;
      lastVisualBeatRef.current = -1;
      beatIndicatorRefs.current.forEach((ref, idx) => {
          if (!ref) return;
          ref.style.backgroundColor = idx % 4 === 0 ? 'var(--color-downbeat-indicator)' : 'var(--color-beat-indicator)';
      });
      if (progressBarRef.current) progressBarRef.current.style.width = '0%';
      // Release wake lock when stopped
      releaseWakeLock();
    } else {
      if (timerIDRef.current) cancelAnimationFrame(timerIDRef.current);
      timerIDRef.current = null;
      
      killAllAudio();
      audioEngine.resume().catch(() => {
        // Resume may fail due to autoplay policy - will succeed on user interaction
      });
      
      // Request wake lock to prevent tab suspension during playback
      requestWakeLock();
      
      const now = audioEngine.ctx.currentTime;
      const headStart = 0.05;
      const startPoint = now + headStart;

      songStartTimeRef.current = startPoint;
      sectionStartTimeRef.current = startPoint; 
      lastScheduledTimeRef.current = startPoint - 0.001; 
      nextMetronomeTimeRef.current = startPoint; 
      metronomeBeatRef.current = 0;
      lastVisualBeatRef.current = -1;
      lastScheduledHitIdsRef.current.clear();
      currentSongStepIdxRef.current = currentSongStepIdx;
      setCurrentPass(0);
      
      transportRef.current = TransportStatus.PLAYING;
      setTransport(TransportStatus.PLAYING);
      scheduler();
    }
  }, [killAllAudio, scheduler, currentSongStepIdx, stopPreview, stopRegularPadPlayback]);

  useEffect(() => { toggleTransportRef.current = toggleTransport; }, [toggleTransport]);

  const toggleRecord = () => {
    if (transport === TransportStatus.STOPPED) toggleTransport();
    setTransport(prev => prev === TransportStatus.RECORDING ? TransportStatus.PLAYING : TransportStatus.RECORDING);
  };

  const createNewPattern = () => {
    const newP = { id: randomUUID(), name: `Pattern ${patterns.length + 1}`, bars: DEFAULT_PATTERN_BARS, hits: [] };
    setPatterns([...patterns, newP]);
    setCurrentPatternId(newP.id);
  };

  const duplicatePattern = () => {
    const source = patterns.find(p => p.id === currentPatternId) || patterns[0];
    const newP = { ...source, id: randomUUID(), name: `${source.name} Copy`.slice(0, 15) };
    setPatterns([...patterns, newP]);
    setCurrentPatternId(newP.id);
  };

  const renamePattern = (id: string, newName: string) => setPatterns(prev => prev.map(p => p.id === id ? { ...p, name: newName.slice(0, 15) } : p));
  const deletePattern = (id: string) => {
    if (patterns.length <= 1) return;
    const nextPatterns = patterns.filter(p => p.id !== id);
    setPatterns(nextPatterns);
    if (currentPatternId === id) setCurrentPatternId(nextPatterns[0].id);

    setArrangementBanks(prevBanks => prevBanks.map(bank => 
      bank.map(step => {
        const nextActiveIds = step.activePatternIds.filter(pid => pid !== id);
        let nextArmedId = step.armedPatternId;
        if (nextArmedId === id) {
          nextArmedId = nextActiveIds.length > 0 ? nextActiveIds[0] : null;
        }
        return {
          ...step,
          activePatternIds: nextActiveIds,
          armedPatternId: nextArmedId
        };
      })
    ));
  };

  const renameStep = (stepId: string, newName: string) => {
    const limitedName = newName.replace(/\n/g, '').slice(0, 45);
    setArrangementBanks(prev => prev.map((arr, i) => i === activeArrIdxRef.current ? arr.map(s => s.id === stepId ? { ...s, name: limitedName } : s) : arr));
  };

  const addSongStep = () => {
    const newStep = { id: randomUUID(), name: `Section ${currentArrangement.length + 1}`, activePatternIds: [currentPatternId], armedPatternId: currentPatternId, repeats: 1 };
    setArrangementBanks(prev => prev.map((arr, i) => i === activeArrIdx ? [...arr, newStep] : arr));
  };

  const addNewArrangement = () => {
    if (arrangementBanks.length >= MAX_ARRANGEMENT_BANKS) return;
    setArrangementBanks([...arrangementBanks, createDefaultArrangement(patterns[0].id)]);
    setActiveArrIdx(arrangementBanks.length);
  };

  const deleteArrangement = (idx: number) => {
    if (arrangementBanks.length <= 1) return;
    const next = arrangementBanks.filter((_, i) => i !== idx);
    setArrangementBanks(next);
    setActiveArrIdx(0);
  };

  const addNewPadBank = () => {
    const currentBankCount = Math.floor(pads.length / PADS_PER_BANK);
    if (currentBankCount >= MAX_ARRANGEMENT_BANKS || pads.length >= MAX_PADS) return;
    setPads([...pads, ...createBank(currentBankCount)]);
    setActiveBankIdx(currentBankCount);
  };

  const deletePadBank = (bankIdx: number) => {
    if (pads.length <= PADS_PER_BANK) return;
    const nextPads = [...pads];
    nextPads.splice(bankIdx * PADS_PER_BANK, PADS_PER_BANK);
    setPads(nextPads);
    const newMaxBanks = Math.floor(nextPads.length / PADS_PER_BANK);
    if (activeBankIdx >= newMaxBanks) {
      setActiveBankIdx(Math.max(0, newMaxBanks - 1));
    }
  };

  const saveProject = async () => {
    try {
      const dbSamples = await getAllSamples();
      
      // Load JSZip
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      
      // Create project.json with metadata (samples reference filenames instead of base64Data)
      const projectMetadata = { 
        version: CURRENT_PROJECT_VERSION, 
        pads, 
        patterns, 
        arrangementBanks, 
        tempo,
        samples: dbSamples.map(s => ({
          id: s.id,
          name: s.name,
          filename: `${s.id}.wav` // Reference to file in samples folder
        }))
      };
      
      // Add project.json to ZIP
      zip.file('project.json', JSON.stringify(projectMetadata, null, 2));
      
      // Add all samples as binary .wav files in samples folder
      for (const sample of dbSamples) {
        zip.file(`samples/${sample.id}.wav`, sample.data);
      }
      
      // Generate ZIP blob and download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); 
      a.href = URL.createObjectURL(zipBlob); 
      a.download = `XEHPA_Project_${new Date().getTime()}.fck`; 
      a.click();
    } catch (err) {
      showError(
        "Failed to save project",
        err instanceof Error ? err.message : "An unknown error occurred. Try again."
      );
    }
  };

  const hasUnsavedChanges = useCallback(() => {
    // Check if there are uploaded samples
    if (samples.length > 0) return true;
    
    // Check if there are patterns with hits
    if (patterns.some(p => p.hits.length > 0)) return true;
    
    // Check if there are pads with samples assigned
    if (pads.some(p => p.sampleId !== null)) return true;
    
    // Check if any patterns have been modified from initial state
    if (patterns.length > 1 || (patterns.length === 1 && patterns[0].name !== 'Pattern 1')) return true;
    
    return false;
  }, [samples, patterns, pads]);

  const createNewProject = useCallback(async () => {
    // Stop transport if playing
    if (transport !== TransportStatus.STOPPED) {
      killAllAudio();
      setTransport(TransportStatus.STOPPED);
      if (timerIDRef.current) {
        cancelAnimationFrame(timerIDRef.current);
        timerIDRef.current = null;
      }
    }

    // Clear all samples from IndexedDB
    try {
      await clearAllSamples();
    } catch (err) {
      console.error("Failed to clear samples:", err);
    }

    // Reset all state to initial values
    setSamples([]);
    const initialPattern = { id: randomUUID(), name: 'Pattern 1', bars: DEFAULT_PATTERN_BARS, hits: [] };
    setPatterns([initialPattern]);
    setCurrentPatternId(initialPattern.id);
    setEditingPatternId(null);
    setEditingStepId(null);
    setPads(createBank(0));
    setActiveBankIdx(0);
    setArrangementBanks([createDefaultArrangement(initialPattern.id)]);
    setActiveArrIdx(0);
    setCurrentSongStepIdx(0);
    setIsSongMode(false);
    setIsSectionLoopActive(false);
    setSelectedPadId(null);
    setTempo(TEMPO_DEFAULT);
    setQuantizeMode('none');
    setCurrentPass(0);
    setCurrentSongTime(0);
    killAllAudio();
    stopPreview();

    // Reset visual indicators
    lastVisualBeatRef.current = -1;
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
    beatIndicatorRefs.current.forEach((ref, idx) => {
      if (!ref) return;
      ref.style.backgroundColor = idx % 4 === 0 ? 'var(--color-downbeat-indicator)' : 'var(--color-beat-indicator)';
    });

    // Clear localStorage
    try {
      localStorage.removeItem('bpc_pads_v8');
      localStorage.removeItem('bpc_patterns_v8');
      localStorage.removeItem('bpc_arrangements_v8');
      localStorage.removeItem('bpc_tempo');
      localStorage.removeItem('bpc_quantize');
    } catch (err) {
      // localStorage clear failure is non-critical - continue anyway
    }
  }, [transport, killAllAudio, stopPreview]);

  const handleNewProject = useCallback(async () => {
    if (hasUnsavedChanges()) {
      const shouldSave = window.confirm(
        "You have unsaved changes (uploaded samples, patterns, etc.).\n\n" +
        "Would you like to save your current project before creating a new one?\n\n" +
        "Click OK to save and download, or Cancel to discard changes and create a new project."
      );
      
      if (shouldSave) {
        await saveProject();
        // Give a small delay for the download to start
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    await createNewProject();
  }, [hasUnsavedChanges, saveProject, createNewProject]);

  const loadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    
    // Check for unsaved changes before loading
    if (hasUnsavedChanges()) {
      const shouldSave = window.confirm(
        "You have unsaved changes (uploaded samples, patterns, etc.).\n\n" +
        "Would you like to save your current project before loading a new one?\n\n" +
        "Click OK to save and download, or Cancel to discard changes and load the new project."
      );
      
      if (shouldSave) {
        await saveProject();
        // Give a small delay for the download to start
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsProjectLoading(true);
    
    // Check if file is ZIP (new format) or JSON (old format)
    // ZIP files start with PK (0x504B), JSON starts with {
    const fileStart = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer);
        // Check first 2 bytes for ZIP signature (PK = 0x50 0x4B)
        if (arr.length >= 2 && arr[0] === 0x50 && arr[1] === 0x4B) {
          resolve('zip');
        } else {
          // Try to read as text to check for JSON
          const text = new TextDecoder().decode(arr.slice(0, 100));
          if (text.trim().startsWith('{')) {
            resolve('json');
          } else {
            resolve('unknown');
          }
        }
      };
      reader.readAsArrayBuffer(file.slice(0, 100)); // Read first 100 bytes
    });
    
    try {
      if (fileStart === 'zip') {
        // New ZIP format
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(file);
        
        // Load project.json
        const projectJsonFile = zip.file('project.json');
        if (!projectJsonFile) {
          throw new Error('Invalid project file: missing project.json');
        }
        
        const projectJsonText = await projectJsonFile.async('string');
        const rawData = JSON.parse(projectJsonText);
        
        // Migrate project to current version (handles old formats automatically)
        const migratedData = migrateProject(rawData);
        
        // Validate migrated project structure
        const validation = validateProject(migratedData);
        if (!validation.valid) {
          throw new Error(`Project file is corrupted: ${validation.errors.join('; ')}`);
        }
        
        // Clear existing samples before loading new ones
        try {
          await clearAllSamples();
        } catch (err) {
          console.error("Failed to clear existing samples:", err);
        }
        
        // Load samples from ZIP samples folder
        if (migratedData.samples && Array.isArray(migratedData.samples)) {
          const baseTime = Date.now();
          for (let i = 0; i < migratedData.samples.length; i++) {
            const s = migratedData.samples[i];
            if (!s.id || !s.name) {
              // Invalid sample entry - skip silently (corrupted project data)
              continue;
            }
            
            let sampleData: ArrayBuffer | null = null;
            
            // New format: samples stored as binary files
            if (s.filename) {
              const sampleFile = zip.file(`samples/${s.filename}`);
              if (sampleFile) {
                sampleData = await sampleFile.async('arraybuffer');
              } else {
                // Sample file missing from ZIP - log but continue loading other samples
                showWarning(`Sample "${s.name}" not found in project file`);
                continue;
              }
            } else if (s.base64Data && typeof s.base64Data === 'string') {
              // Fallback: base64 data in JSON (shouldn't happen in ZIP format, but handle it)
              sampleData = base64ToArrayBuffer(s.base64Data);
            } else {
              showWarning(`Sample "${s.name}" has no audio data`);
              continue;
            }
            
            if (!sampleData) continue;
            
            try {
              const dataCopy = sampleData.slice(0);
              const buffer = await audioEngine.decode(dataCopy);
              const createdAt = baseTime - i;
              await saveSample(s.id, s.name, sampleData, 0, buffer.duration, createdAt);
            } catch (sampleErr) {
              showWarning(
                `Failed to load sample "${s.name}"`,
                sampleErr instanceof Error ? sampleErr.message : "Sample may be corrupted"
              );
            }
          }
        }
        
        // Apply migrated and validated data
        setPads(migratedData.pads || []); 
        setPatterns(migratedData.patterns || []); 
        setArrangementBanks(migratedData.arrangementBanks || []); 
        setTempo(clampTempo(migratedData.tempo || TEMPO_DEFAULT));
        
        // Set current pattern (ensure it exists)
        const firstPatternId = migratedData.patterns?.[0]?.id;
        if (firstPatternId) {
          setCurrentPatternId(firstPatternId);
        } else if (patterns.length > 0) {
          setCurrentPatternId(patterns[0].id);
        } else {
          // Should not happen due to migration, but fallback
          const newId = randomUUID();
          setPatterns([{ id: newId, name: 'Pattern 1', bars: DEFAULT_PATTERN_BARS, hits: [] }]);
          setCurrentPatternId(newId);
        }
        
        await loadSamplesFromDB();
        
        // Show migration notice if version was updated
        const originalVersion = rawData.version || 'unknown';
        if (originalVersion !== CURRENT_PROJECT_VERSION) {
          alert(`Project loaded successfully!\n\nProject was migrated from version ${originalVersion} to ${CURRENT_PROJECT_VERSION}.`);
        } else {
          alert("Project Loaded Successfully");
        }
        setIsProjectLoading(false);
      } else if (fileStart === 'json') {
        // Old JSON format (backward compatibility)
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const rawData = JSON.parse(ev.target?.result as string);
            
            // Migrate project to current version (handles old formats automatically)
            const migratedData = migrateProject(rawData);
            
            // Validate migrated project structure
            const validation = validateProject(migratedData);
            if (!validation.valid) {
              throw new Error(`Invalid project structure: ${validation.errors.join('; ')}`);
            }
            
            // Clear existing samples before loading new ones
            try {
              await clearAllSamples();
            } catch (err) {
              console.error("Failed to clear existing samples:", err);
            }
            
            // Load samples if present
            if (migratedData.samples && Array.isArray(migratedData.samples)) {
              const baseTime = Date.now();
              // Assign timestamps in reverse order: first sample (newest) gets highest timestamp
              for (let i = 0; i < migratedData.samples.length; i++) {
                const s = migratedData.samples[i];
                if (!s.id || !s.name) {
                  console.warn("Skipping invalid sample:", s);
                  continue;
                }
                
                // Support both base64Data (for older formats) and data (for newer formats)
                let sampleData: ArrayBuffer | null = null;
                
                if (s.base64Data && typeof s.base64Data === 'string') {
                  // Legacy format: base64 encoded
                  sampleData = base64ToArrayBuffer(s.base64Data);
                } else if (s.data instanceof ArrayBuffer) {
                  // Direct ArrayBuffer (unlikely in JSON, but handle it)
                  sampleData = s.data;
                } else {
                  showWarning(`Sample "${s.name}" has no audio data`);
                  continue;
                }
                
                if (!sampleData) continue;
                
                try {
                  const dataCopy = sampleData.slice(0);
                  const buffer = await audioEngine.decode(dataCopy);
                  // Assign timestamp: first sample (index 0) is newest, gets baseTime
                  // Subsequent samples get progressively older timestamps
                  const createdAt = baseTime - i;
                  await saveSample(s.id, s.name, sampleData, 0, buffer.duration, createdAt);
                } catch (sampleErr) {
                  showWarning(
                    `Failed to load sample "${s.name}"`,
                    sampleErr instanceof Error ? sampleErr.message : "Sample may be corrupted"
                  );
                }
              }
            }
            
            // Apply migrated and validated data
            setPads(migratedData.pads || []); 
            setPatterns(migratedData.patterns || []); 
            setArrangementBanks(migratedData.arrangementBanks || []); 
            setTempo(clampTempo(migratedData.tempo || TEMPO_DEFAULT));
            
            // Set current pattern (ensure it exists)
            const firstPatternId = migratedData.patterns?.[0]?.id;
            if (firstPatternId) {
              setCurrentPatternId(firstPatternId);
            } else if (patterns.length > 0) {
              setCurrentPatternId(patterns[0].id);
            } else {
              // Should not happen due to migration, but fallback
              const newId = randomUUID();
              setPatterns([{ id: newId, name: 'Pattern 1', bars: DEFAULT_PATTERN_BARS, hits: [] }]);
              setCurrentPatternId(newId);
            }
            
            await loadSamplesFromDB();
            
            // Show migration notice if version was updated
            const originalVersion = rawData.version || 'unknown';
            if (originalVersion !== CURRENT_PROJECT_VERSION) {
              alert(`Project loaded successfully!\n\nProject was migrated from version ${originalVersion} to ${CURRENT_PROJECT_VERSION}.`);
            } else {
              alert("Project Loaded Successfully");
            }
            setIsProjectLoading(false);
          } catch (err) {
            showError(
              "Failed to load project",
              err instanceof Error ? err.message : "The file may be corrupted or in an unsupported format."
            );
            setIsProjectLoading(false);
          }
        };
        reader.onerror = () => {
          setIsProjectLoading(false);
          alert("Failed to read project file.");
        };
        reader.readAsText(file);
        return; // Early return - onload will handle completion
      } else {
        throw new Error('Not a valid XEHPA project file. Expected .fck format.');
      }
    } catch (err) {
      showError(
        "Failed to load project",
        err instanceof Error ? err.message : "The file may be corrupted or in an unsupported format."
      );
      setIsProjectLoading(false);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (idx: number) => {
    setDraggedStepIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isAfter = e.clientY > midY;
    setDropIndicatorIdx(isAfter ? idx + 1 : idx);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedStepIdx === null || dropIndicatorIdx === null) return;
    
    const newArr = [...currentArrangement];
    const item = newArr.splice(draggedStepIdx, 1)[0];
    
    let insertIdx = dropIndicatorIdx;
    if (draggedStepIdx < dropIndicatorIdx) insertIdx--;
    
    newArr.splice(insertIdx, 0, item);
    
    setArrangementBanks(prev => prev.map((arr, i) => i === activeArrIdx ? newArr : arr));
    
    // Adjust current playing index visually without interrupting playback flow
    if (currentSongStepIdx === draggedStepIdx) {
      setCurrentSongStepIdx(insertIdx);
      currentSongStepIdxRef.current = insertIdx;
    } else if (draggedStepIdx < currentSongStepIdx && insertIdx >= currentSongStepIdx) {
      setCurrentSongStepIdx(currentSongStepIdx - 1);
      currentSongStepIdxRef.current = currentSongStepIdx - 1;
    } else if (draggedStepIdx > currentSongStepIdx && insertIdx <= currentSongStepIdx) {
      setCurrentSongStepIdx(currentSongStepIdx + 1);
      currentSongStepIdxRef.current = currentSongStepIdx + 1;
    }

    setDraggedStepIdx(null);
    setDropIndicatorIdx(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;
      
      const bankPads = padsRef.current.slice(activeBankIdx * PADS_PER_BANK, (activeBankIdx + 1) * PADS_PER_BANK);
      const pad = bankPads.find(p => p.keyCode === e.code);
      if (pad) { 
        e.preventDefault(); 
        // Always select the pad when pressing its key (for navigation)
        if (selectedPadId !== pad.id) {
          stopPreview();
        }
        setSelectedPadId(pad.id);
        // Also select the pad's sample in the library if it has one
        if (pad.sampleId) {
          const sample = samplesRef.current.find(s => s.id === pad.sampleId);
          if (sample) {
            setSelectedSampleId(pad.sampleId);
          }
        }
        triggerPad(pad.id); 
      }
      
      if (e.code === 'Space') { 
        e.preventDefault(); 
        if (e.altKey) {
          toggleRecord();
        } else {
          toggleTransport(); 
        }
      }
      if (e.code === 'KeyT') { e.preventDefault(); handleTap(); }
      if (e.code === 'KeyM') { e.preventDefault(); setIsMetronomeEnabled(prev => !prev); }
      
      if (e.altKey && e.metaKey) { e.preventDefault(); setIsSongMode(prev => !prev); }
      
      if (e.altKey && e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', '')) - 1;
        const maxBanks = Math.min(Math.floor(padsRef.current.length / PADS_PER_BANK), MAX_ARRANGEMENT_BANKS);
        if (num >= 0 && num < maxBanks) setActiveBankIdx(num);
      }
      
      // Theme toggle with Cmd+I (Mac) or Ctrl+I (Windows/Linux) - cycles through themes
      if (e.code === 'KeyI' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerPad, activeBankIdx, toggleTransport, toggleRecord, handleTap, selectedPadId, stopPreview, setSelectedPadId, setSelectedSampleId, toggleTheme]);

  // Audio analysis for reactive visuals - runs continuously to react to ALL audio
  // Blur buttons after mouse click to prevent spacebar from triggering them
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON') {
        target.blur();
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const currentBankPads = pads.slice(activeBankIdx * PADS_PER_BANK, (activeBankIdx + 1) * PADS_PER_BANK);
  const activePattern = patterns.find(p => p.id === currentPatternId) || patterns[0];
  const currentStep = currentArrangement[currentSongStepIdx] || currentArrangement[0];
  const activePatsInStep = currentStep?.activePatternIds.map(id => patterns.find(p => p.id === id)).filter(Boolean) as Pattern[] || [];
  const activeBaseDur = isSongMode 
    ? activePatsInStep.reduce((max, p) => Math.max(max, getPatternDuration(p)), 0)
    : getPatternDuration(activePattern);
  const visualBeatsCount = Math.round(activeBaseDur / getBeatDuration());

  // Centralized default hint logic - suggests next meaningful musical action
  const getDefaultHint = useCallback((): string | null => {
    // 1. No samples loaded
    if (samples.length === 0) {
      return 'LOAD SAMPLE TO START';
    }

    // 2. Samples exist, no pad selected
    if (selectedPadId === null) {
      return 'SELECT A PAD';
    }

    // 3. Pad selected, no sample assigned
    const selectedPad = pads.find(p => p.id === selectedPadId);
    if (!selectedPad || !selectedPad.sampleId) {
      return 'ASSIGN SAMPLE TO PAD';
    }

    // 4. Sample assigned, check if start/end are untouched (start=0 and end=full duration)
    const sample = samples.find(s => s.id === selectedPad.sampleId);
    if (sample) {
      const hasCustomRange = selectedPad.start > 0 || 
                            (selectedPad.end < sample.buffer.duration - 0.001);
      if (!hasCustomRange) {
        return 'SET START AND END POINTS';
      }
    }

    // 5. Start/end set, check if all patterns are empty (no hits)
    const hasPatternsWithHits = patterns.some(p => p.hits.length > 0);
    if (!hasPatternsWithHits) {
      // If in Pattern Mode and stopped, be more explicit about recording
      if (!isSongMode && transport === TransportStatus.STOPPED) {
        return 'SELECT PATTERN · PRESS RECORD [ALT+SPACE]';
      }
      return 'RECORD A PATTERN';
    }

    // After at least one pattern has hits, introduce mode awareness
    // 6. Song Mode is OFF
    if (!isSongMode) {
      return 'SWITCH TO SONG MODE TO ARRANGE [ALT+CMD]';
    }

    // 7. Song Mode is ON, check active arrangement bank
    const activeBank = arrangementBanks[activeArrIdx] || [];
    if (activeBank.length === 0) {
      return 'ADD SECTION TO ARRANGEMENT';
    }

    // 8. Song Mode is ON, check if sections have patterns but those patterns are empty
    const sectionsWithPatterns = activeBank.filter(step => step.activePatternIds.length > 0);
    if (sectionsWithPatterns.length > 0) {
      // Check if all active patterns in sections are empty
      const allSectionPatternsHaveHits = sectionsWithPatterns.every(step => 
        step.activePatternIds.some(patternId => {
          const pattern = patterns.find(p => p.id === patternId);
          return pattern && pattern.hits.length > 0;
        })
      );
      if (!allSectionPatternsHaveHits) {
        return 'RECORD PATTERNS IN SECTION';
      }
    }

    // 9. Song Mode is ON, check if current section (or any section) has no active patterns
    const hasSectionWithActivePatterns = activeBank.some(step => step.activePatternIds.length > 0);
    if (!hasSectionWithActivePatterns) {
      return 'SELECT PATTERNS FOR THIS SECTION';
    }

    // Once patterns are active in a section, make transport-aware (RECORDING has highest priority)
    // 10. Transport is RECORDING
    if (transport === TransportStatus.RECORDING) {
      return 'RECORDING';
    }

    // 11. Transport is PLAYING
    if (transport === TransportStatus.PLAYING) {
      return 'PLAYING';
    }

    // 12. Transport is STOPPED
    return 'PRESS SPACE TO PLAY';
  }, [samples, selectedPadId, pads, patterns, isSongMode, arrangementBanks, activeArrIdx, transport]);

  const defaultHint = getDefaultHint();

  return (
    <HintProvider>
      <AppContent
        defaultHint={defaultHint}
        transport={transport}
        toggleTransport={toggleTransport}
        toggleRecord={toggleRecord}
        isSongMode={isSongMode}
        theme={theme}
        currentStep={currentStep}
        activePattern={activePattern}
        currentSongTime={currentSongTime}
        totalSongDuration={totalSongDuration}
        beatIndicatorRefs={beatIndicatorRefs}
        progressBarRef={progressBarRef}
        visualBeatsCount={visualBeatsCount}
        currentBankPads={currentBankPads}
        pads={pads}
        selectedPadId={selectedPadId}
        setSelectedPadId={setSelectedPadId}
        setSelectedSampleId={setSelectedSampleId}
        triggerPad={triggerPad}
        stopPreview={stopPreview}
        selectedPadIdForEffects={selectedPadId}
        setPads={setPads}
        samples={samples}
        selectedSampleId={selectedSampleId}
        setSamples={setSamples}
        tempo={tempo}
        setTempo={setTempo}
        isDraggingTempo={isDraggingTempo}
        setIsDraggingTempo={setIsDraggingTempo}
        handleTap={handleTap}
        isTapping={isTapping}
        isMetronomeEnabled={isMetronomeEnabled}
        setIsMetronomeEnabled={setIsMetronomeEnabled}
        lastTriggerInfo={lastTriggerInfo}
        previewActive={previewActive}
        previewingPadId={previewingPadId}
        setLastTriggerInfo={setLastTriggerInfo}
        frameScale={frameScale}
        currentPatternId={currentPatternId}
        patterns={patterns}
        setCurrentPatternId={setCurrentPatternId}
        setPatterns={setPatterns}
        deletePattern={deletePattern}
        quantizeMode={quantizeMode}
        setQuantizeMode={setQuantizeMode}
        arrangementBanks={arrangementBanks}
        setArrangementBanks={setArrangementBanks}
        activeArrIdx={activeArrIdx}
        setActiveArrIdx={setActiveArrIdx}
        activeBankIdx={activeBankIdx}
        setActiveBankIdx={setActiveBankIdx}
        isProjectLoading={isProjectLoading}
        editingStepId={editingStepId}
        setEditingStepId={setEditingStepId}
        currentSongStepIdx={currentSongStepIdx}
        draggedStepIdx={draggedStepIdx}
        setDraggedStepIdx={setDraggedStepIdx}
        dropIndicatorIdx={dropIndicatorIdx}
        setDropIndicatorIdx={setDropIndicatorIdx}
        setIsSongMode={setIsSongMode}
        activePadIds={activePadIds}
        currentArrangement={currentArrangement}
        isExportingStems={isExportingStems}
        setIsExportingStems={setIsExportingStems}
        isSectionLoopActive={isSectionLoopActive}
        setIsSectionLoopActive={setIsSectionLoopActive}
        setCurrentSongStepIdx={setCurrentSongStepIdx}
        handleNewProject={handleNewProject}
        saveProject={saveProject}
        loadProject={loadProject}
        addSongStep={addSongStep}
        createNewPattern={createNewPattern}
        duplicatePattern={duplicatePattern}
        renamePattern={renamePattern}
        renameStep={renameStep}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        editingPatternId={editingPatternId}
        setEditingPatternId={setEditingPatternId}
        waveformViewStateRef={waveformViewStateRef}
        importProgress={importProgress}
        setImportProgress={setImportProgress}
        processBatchImport={processBatchImport}
        toggleTheme={toggleTheme}
      />
    </HintProvider>
  );
}

// Inner component that uses useHint - must be inside HintProvider
const AppContent: React.FC<{
  defaultHint: string | null;
  transport: TransportStatus;
  toggleTransport: () => void;
  toggleRecord: () => void;
  isSongMode: boolean;
  currentStep: SongStep | undefined;
  activePattern: Pattern | undefined;
  currentSongTime: number;
  totalSongDuration: number;
  beatIndicatorRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  progressBarRef: React.RefObject<HTMLDivElement>;
  visualBeatsCount: number;
  currentBankPads: PadConfig[];
  pads: PadConfig[];
  selectedPadId: number | null;
  setSelectedPadId: (id: number | null) => void;
  setSelectedSampleId: (id: string | null) => void;
  triggerPad: (id: number, offset?: number, looping?: boolean) => void;
  stopPreview: () => void;
  selectedPadIdForEffects: number | null;
  setPads: React.Dispatch<React.SetStateAction<PadConfig[]>>;
  samples: SampleData[];
  selectedSampleId: string | null;
  setSamples: React.Dispatch<React.SetStateAction<SampleData[]>>;
  tempo: number;
  setTempo: (tempo: number) => void;
  isDraggingTempo: boolean;
  setIsDraggingTempo: (isDragging: boolean) => void;
  handleTap: () => void;
  isTapping: boolean;
  isMetronomeEnabled: boolean;
  setIsMetronomeEnabled: (enabled: boolean) => void;
  lastTriggerInfo: {padId: number, trigger: TriggerInfo} | null;
  previewActive: boolean;
  previewingPadId: number | null;
  setLastTriggerInfo: (info: {padId: number, trigger: TriggerInfo} | null) => void;
  frameScale: number;
  currentPatternId: string;
  patterns: Pattern[];
  setCurrentPatternId: (id: string) => void;
  setPatterns: React.Dispatch<React.SetStateAction<Pattern[]>>;
  deletePattern: (id: string) => void;
  quantizeMode: 'none' | '1/8' | '1/16';
  setQuantizeMode: (mode: 'none' | '1/8' | '1/16') => void;
  arrangementBanks: SongStep[][];
  setArrangementBanks: React.Dispatch<React.SetStateAction<SongStep[][]>>;
  activeArrIdx: number;
  setActiveArrIdx: (idx: number) => void;
  activeBankIdx: number;
  setActiveBankIdx: (idx: number) => void;
  isProjectLoading: boolean;
  editingStepId: string | null;
  setEditingStepId: (id: string | null) => void;
  currentSongStepIdx: number;
  draggedStepIdx: number | null;
  setDraggedStepIdx: (idx: number | null) => void;
  dropIndicatorIdx: number | null;
  setDropIndicatorIdx: (idx: number | null) => void;
  activePadIds: Set<number>;
  currentArrangement: SongStep[];
  isExportingStems: boolean;
  setIsExportingStems: (exporting: boolean) => void;
  isSectionLoopActive: boolean;
  setIsSectionLoopActive: (active: boolean) => void;
  setCurrentSongStepIdx: (idx: number) => void;
  handleNewProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  loadProject: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  addSongStep: () => void;
  createNewPattern: () => void;
  duplicatePattern: (id: string) => void;
  renamePattern: (id: string, newName: string) => void;
  renameStep: (id: string, newName: string) => void;
  handleDragStart: (e: React.DragEvent, idx: number) => void;
  handleDragOver: (e: React.DragEvent, idx: number) => void;
  handleDrop: (e: React.DragEvent, idx: number) => void;
  editingPatternId: string | null;
  setEditingPatternId: (id: string | null) => void;
  waveformViewStateRef: React.MutableRefObject<Map<number, { zoom: number; scrollOffset: number; focusMode: 'start' | 'end' }>>;
  importProgress: { current: number; total: number } | null;
  setImportProgress: (progress: { current: number; total: number } | null) => void;
  processBatchImport: (files: File[], existingSamples: SampleData[], onProgress: (current: number, total: number) => void) => Promise<{ results: SampleData[]; errors: string[]; skipped: string[] }>;
  theme: Theme;
  toggleTheme: () => void;
}> = (props) => {
  const { setHint } = useHint();

  return (
    <div 
      className="app-wrapper"
      data-theme={props.theme}
    >
      <div 
        className="app-frame"
          style={{ transform: `scale(${props.frameScale})` }}
      >
        <div className="app-content relative flex h-full overflow-hidden font-mono" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-muted)' }}>
      {/* Dividers - reactive spectrum bars that respond to audio */}
      <Dividers />
      
      {props.isProjectLoading && (
        <div 
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            backgroundColor: 'var(--color-bg)',
            border: '2px solid var(--color-border)',
            padding: '20px 30px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <p 
            style={{
              fontFamily: 'Barlow Condensed',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--color-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              margin: 0
            }}
          >
            LOADING PROJECT...
          </p>
          <div 
            style={{
              width: '200px',
              height: '2px',
              backgroundColor: 'var(--color-scrollbar-thumb)',
              overflow: 'hidden'
            }}
          >
            <div 
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--color-fg)'
              }}
            />
          </div>
        </div>
      )}
      
      {/* Import Progress Indicator */}
      {props.importProgress && (
        <div 
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            backgroundColor: 'var(--color-bg)',
            border: '2px solid var(--color-border)',
            padding: '20px 30px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <p 
            style={{
              fontFamily: 'Barlow Condensed',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--color-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              margin: 0
            }}
          >
            PROCESSING {props.importProgress.current} OF {props.importProgress.total} FILES...
          </p>
          <div 
            style={{
              width: '200px',
              height: '2px',
              backgroundColor: 'var(--color-scrollbar-thumb)',
              overflow: 'hidden'
            }}
          >
            <div 
              style={{
                width: `${(props.importProgress.current / props.importProgress.total) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--color-fg)',
                transition: 'width 0.2s ease-out'
              }}
            />
          </div>
        </div>
      )}
      
      {/* QNT/BARS Overlay - positioned over grid lines (right side) */}
      <div className="absolute z-10" style={{ top: '65px', right: '371px' }}>
        <QntBarsOverlay
          quantizeMode={props.quantizeMode}
          onQuantizeModeChange={() => props.setQuantizeMode(props.quantizeMode === 'none' ? '1/8' : props.quantizeMode === '1/8' ? '1/16' : 'none')}
          bars={props.activePattern?.bars || 4}
          onBarsChange={() => {
            if (!props.activePattern) return;
            const idx = PATTERN_BAR_OPTIONS.indexOf(props.activePattern.bars);
            const nextBars = PATTERN_BAR_OPTIONS[(idx + 1) % PATTERN_BAR_OPTIONS.length];
            props.setPatterns(prev => prev.map(p => p.id === props.currentPatternId ? { ...p, bars: nextBars } : p));
          }}
        />
      </div>
      
      {/* THEME Overlay - positioned horizontally aligned with QNT (top: 65px), vertically aligned with SONG (left: 371px) */}
      <div className="absolute z-10" style={{ top: '65px', left: '371px' }}>
        <ThemeToggleButton theme={props.theme} onThemeToggle={props.toggleTheme} />
      </div>
      
      {/* SONG Mode Overlay - positioned over grid lines (left side), aligned with BARS button */}
      <div className="absolute z-10" style={{ top: '124px', left: '371px' }}>
        <SongModeOverlay
          isSongMode={props.isSongMode}
          onToggle={() => props.setIsSongMode(!props.isSongMode)}
        />
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════════════
          LEFT COLUMN (380px) - Header/Logo, Arrangements, Pattern List
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{ width: '380px', height: '833px', flexShrink: 0 }} className="flex flex-col">
        
        {/* LEFT TOP - Header/Logo/Menu (height: 157px) */}
        <div style={{ height: '157px', flexShrink: 0, position: 'relative' }} className="flex flex-col">
          {/* Tagline - Kode Mono (above logo) */}
          <span 
            style={{ 
              position: 'absolute',
              top: '22px',
              left: '65px',
              fontFamily: "'Kode Mono', monospace",
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: '13px',
              letterSpacing: '0.05em',
              color: 'var(--color-text)',
            }}
          >
            A PRODUCTION SAMPLER DESIGNED BY BARÜDE
          </span>
          
          {/* XEHPA - BhuTuka Expanded One */}
          <span 
            style={{ 
              position: 'absolute',
              top: '35px', // Positioned right after LOGLINE (22px + 13px lineHeight)
              left: '65px',
              fontFamily: "'BhuTuka Expanded One', serif",
              fontWeight: 400,
              fontSize: '50px',
              lineHeight: '50px',
              color: 'var(--color-text)',
            }}
          >
            XEHPA
          </span>
          
          {/* MENU Section - positioned at exact Figma coordinates */}
          <button 
            onClick={props.handleNewProject}
            onMouseEnter={() => setHint('NEW PROJECT')}
            onMouseLeave={() => setHint(null)}
            style={{ 
              position: 'absolute',
              top: '108px',
              left: '65px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: '10px',
              lineHeight: '12px',
              color: 'var(--color-text)',
            }}
            className="hover:opacity-60 transition-opacity"
          >
            NEW
          </button>
          <button 
            onClick={props.saveProject}
            onMouseEnter={() => setHint('SAVE PROJECT')}
            onMouseLeave={() => setHint(null)}
            style={{ 
              position: 'absolute',
              top: '108px',
              left: '122px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: '10px',
              lineHeight: '12px',
              color: 'var(--color-text)',
            }}
            className="hover:opacity-60 transition-opacity"
          >
            SAVE
          </button>
          <label 
            onMouseEnter={() => setHint('LOAD PROJECT')}
            onMouseLeave={() => setHint(null)}
            style={{ 
              position: 'absolute',
              top: '108px',
              left: '179px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: '10px',
              lineHeight: '12px',
              color: 'var(--color-text)',
            }}
            className="hover:opacity-60 transition-opacity cursor-pointer"
          >
            LOAD
            <input type="file" className="hidden" accept=".fck" onChange={props.loadProject} />
          </label>
          <button 
                onClick={() => audioEngine.exportWAV(props.currentArrangement, props.patterns, props.tempo, props.pads, props.samples).then(blob => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `XEHPA_Export_${new Date().getTime()}.wav`; a.click();
            })}
            onMouseEnter={() => setHint('EXPORT WAV')}
            onMouseLeave={() => setHint(null)}
            style={{ 
              position: 'absolute',
              top: '108px',
              left: '239px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: '10px',
              lineHeight: '12px',
              color: 'var(--color-text)',
            }}
            className="hover:opacity-60 transition-opacity"
          >
            WAV
          </button>
          <button 
            onClick={async () => {
              if (props.isExportingStems) return;
              props.setIsExportingStems(true);
              try {
                const blob = await audioEngine.exportStems(props.currentArrangement, props.patterns, props.tempo, props.pads, props.samples);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `XEHPA_Stems_${new Date().getTime()}.zip`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (error) {
                showError(
                  "Export failed",
                  error instanceof Error ? error.message : "An unknown error occurred during export."
                );
              } finally {
                props.setIsExportingStems(false);
              }
            }}
            disabled={props.isExportingStems}
            onMouseEnter={() => setHint('EXPORT STEMS')}
            onMouseLeave={() => setHint(null)}
            style={{ 
              position: 'absolute',
              top: '108px',
              left: '294px',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: '10px',
              lineHeight: '12px',
              color: 'var(--color-text)',
            }}
            className={`flex items-center gap-1 ${props.isExportingStems ? 'opacity-40 cursor-wait' : 'hover:opacity-60 transition-opacity'}`}
          >
            {props.isExportingStems && (
              <svg className="animate-spin h-2 w-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            STEMS
          </button>
        </div>

        {/* LEFT MIDDLE - Arrangements/Song Mode (height: 387px, from y=157 to y=544) */}
        <div style={{ height: '387px', flexShrink: 0, position: 'relative' }} className="flex flex-col">
          {/* Sections List - Arrangements */}
          <div 
            className="flex-1 overflow-y-auto overflow-x-hidden relative" 
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              position: 'absolute',
              top: '49px', // Aligned with PadGrid top
              bottom: '52px', // 341px from frame bottom = 492px from top, 492 - 157 = 335px from container top, 387 - 335 = 52px from container bottom
              left: '29px',
              width: '317px'
            }} 
            onDragOver={e => e.preventDefault()}
          >
            <div className="flex flex-col">
              {props.currentArrangement.map((step, idx) => {
                const isExpanded = props.editingStepId === step.id;
                const isSelected = props.currentSongStepIdx === idx;
                
                return (
                  <div key={step.id} className="relative">
                    {props.dropIndicatorIdx === idx && props.draggedStepIdx !== null && (
                      <div className="h-0.5 w-full absolute top-0 left-0 z-10" style={{ backgroundColor: isSelected ? 'var(--color-active-fg)' : 'var(--color-outline)' }} />
                    )}
                    
                    <div 
                      className={`relative border-2 transition-none ${isSelected ? 'bg-white border-white' : 'border-white bg-transparent hover:bg-white'} ${props.draggedStepIdx === idx ? 'opacity-30' : 'opacity-100'} group/section`}
                      style={{ 
                        marginTop: idx === 0 ? 0 : 5, 
                        minHeight: isExpanded ? 'auto' : 35
                      }}
                    >
                      {/* Vertical divider line - spans from top border to horizontal divider */}
                      <div 
                        className={`absolute w-[2px] ${isSelected ? 'bg-black' : 'bg-white group-hover/section:bg-black'}`}
                        style={{ 
                          right: '42px', 
                          top: '-2px', 
                          height: '35px'
                        }}
                      />
                      
                      <div 
                        className="h-[31px] flex items-center cursor-pointer"
                        draggable
                        onDragStart={(e) => {
                          props.handleDragStart(e, idx);
                          setHint('DRAG TO REORDER SECTIONS');
                        }}
                        onDragOver={(e) => {
                          props.handleDragOver(e, idx);
                          if (props.draggedStepIdx !== null && props.draggedStepIdx !== idx) {
                            setHint('DROP TO REORDER SECTIONS');
                          }
                        }}
                        onDrop={(e) => {
                          props.handleDrop(e, idx);
                          setHint(null);
                        }}
                        onDragEnd={() => { 
                          props.setDraggedStepIdx(null); 
                          props.setDropIndicatorIdx(null);
                          setHint(null);
                        }}
                        onClick={() => props.setCurrentSongStepIdx(idx)}
                        onMouseEnter={() => {
                          if (props.draggedStepIdx === null) {
                            const truncatedName = step.name.length > 42 ? step.name.slice(0, 42) + '...' : step.name;
                            setHint(`SECTION ${idx + 1}: ${truncatedName}`);
                          } else if (props.draggedStepIdx !== idx) {
                            setHint('DROP TO REORDER SECTIONS');
                          }
                        }}
                        onMouseLeave={() => {
                          if (props.draggedStepIdx === null) {
                            setHint(null);
                          }
                        }}
                      >
                        <span 
                          className={`w-4 text-center font-light text-[6px] ${isSelected ? 'text-black' : 'text-white group-hover/section:text-black'}`}
                          style={{ fontFamily: 'Barlow Condensed' }}
                        >
                          {idx + 1}
                        </span>
                        
                        <div className="flex-1 min-w-0 px-1">
                          {isExpanded ? (
                            <input 
                              autoFocus
                              value={step.name} 
                              maxLength={45}
                              onChange={e => props.renameStep(step.id, e.target.value.replace(/\n/g, ''))} 
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  props.setEditingStepId(null);
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                              className={`bg-transparent text-[10px] uppercase outline-none w-full font-medium ${isSelected ? 'text-black' : 'text-white group-hover/section:text-black'}`}
                              style={{ fontFamily: 'Barlow Condensed' }}
                            />
                          ) : (
                            <span 
                              className={`text-[10px] uppercase truncate block font-medium ${isSelected ? 'text-black' : 'text-white group-hover/section:text-black'}`}
                              style={{ 
                                fontFamily: 'Barlow Condensed',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={step.name}
                            >
                              {step.name.slice(0, 45)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center h-full gap-[4px] pr-[8px]">
                <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (isSelected) {
                                props.setIsSectionLoopActive(!props.isSectionLoopActive); 
                              } else {
                                props.setCurrentSongStepIdx(idx);
                                props.setIsSectionLoopActive(true);
                              }
                            }}
                            onMouseEnter={() => setHint('SECTION LOOP: TOGGLE')}
                            onMouseLeave={() => setHint(null)}
                            className={`w-[25px] h-[21px] border-2 transition-none flex items-center justify-center flex-shrink-0 ${isSelected && props.isSectionLoopActive ? 'bg-black border-black' : isSelected ? 'border-black bg-transparent' : 'border-white bg-transparent group-hover/section:border-black'}`}
                          >
                            <svg viewBox="0 0 24 24" className={`w-3 h-3 ${isSelected && props.isSectionLoopActive ? 'fill-white' : isSelected ? 'fill-black' : 'fill-white group-hover/section:fill-black'}`}>
                              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                            </svg>
                </button>
                          
                          <div 
                            className={`w-[25px] h-[21px] border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-black' : 'border-white group-hover/section:border-black'}`}
                            onMouseEnter={() => setHint('SECTION REPEATS: ADJUST')}
                            onMouseLeave={() => setHint(null)}
                          >
                            <input 
                              type="number" 
                              min="1" 
                              value={step.repeats} 
                              onClick={e => e.stopPropagation()}
                              onChange={(e) => props.setArrangementBanks(prev => prev.map((arr, i) => i === props.activeArrIdx ? arr.map(s => s.id === step.id ? { ...s, repeats: parseInt(e.target.value) || 1 } : s) : arr))}
                              className={`w-full h-full bg-transparent text-[10px] text-center outline-none font-medium ${isSelected ? 'text-black' : 'text-white group-hover/section:text-black'}`}
                              style={{ fontFamily: 'Barlow Condensed' }}
                            />
            </div>

                          {/* Spacer where vertical line used to be */}
                          <div className="w-[10px] flex-shrink-0" />
                          
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              props.setEditingStepId(isExpanded ? null : step.id); 
                            }}
                            onMouseEnter={() => setHint('EDIT: SELECT PATTERNS')}
                            onMouseLeave={() => setHint(null)}
                            className={`text-[10px] uppercase font-medium flex items-center gap-[3px] flex-shrink-0 ${isSelected ? 'text-black' : 'text-white group-hover/section:text-black'}`}
                            style={{ fontFamily: 'Barlow Condensed' }}
                          >
                            <span>{isExpanded ? '▲' : '▼'}</span>
                            <span>EDIT</span>
                          </button>
              </div>
            </div>
            
                      {isExpanded && (
                        <div 
                          className={`border-t-2 ${isSelected ? 'border-black' : 'border-white group-hover/section:border-black group-hover/section:bg-white'}`}
                          style={{ 
                            width: 'calc(100% + 4px)', 
                            marginLeft: '-2px'
                          }}
                        >
                          <div className="px-[16px] pt-[18px] pb-[2px] max-h-[78px] overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            <div className="grid grid-cols-2 gap-x-[10px] gap-y-[2px]">
                              {props.patterns.map(p => {
                                const isActive = step.activePatternIds.includes(p.id);
                                const isArmed = step.armedPatternId === p.id;
                                
                                return (
                                  <div 
                                    key={p.id}
                                    className={`h-[18px] border-2 flex items-center justify-between px-[8px] cursor-pointer transition-none relative group/pattern ${isActive 
                                      ? (isSelected ? 'bg-black border-black' : 'bg-white border-white group-hover/section:bg-black group-hover/section:border-black')
                                      : (isSelected ? 'bg-transparent border-black hover:bg-black' : 'bg-transparent border-white hover:bg-black hover:border-black group-hover/section:border-black')
                                    }`}
                                    onMouseEnter={() => setHint(`PATTERN: ${p.name} · ${isActive ? 'REMOVE FROM SECTION' : 'ADD TO SECTION'}`)}
                                    onMouseLeave={() => setHint(null)}
                                    onClick={() => {
                                      props.setArrangementBanks(prev => prev.map((arr, i) => i === props.activeArrIdx ? arr.map(s => {
                                        if (s.id !== step.id) return s;
                                        const activeIds = s.activePatternIds.includes(p.id) 
                                          ? s.activePatternIds.filter(id => id !== p.id) 
                                          : [...s.activePatternIds, p.id];
                                        let armedId = s.armedPatternId;
                                        if (!activeIds.includes(armedId || '')) armedId = activeIds[0] || null;
                                        return { ...s, activePatternIds: activeIds, armedPatternId: armedId };
                                      }) : arr));
                                    }}
                                  >
                                    <span 
                                      className={`text-[10px] uppercase font-medium truncate leading-none ${isActive 
                                        ? (isSelected ? 'text-white' : 'text-black group-hover/section:text-white')
                                        : (isSelected ? 'text-black group-hover/pattern:text-white' : 'text-white group-hover/section:text-black group-hover/pattern:text-white')
                                      }`}
                                      style={{ fontFamily: 'Barlow Condensed' }}
                                    >
                                      {p.name}
                                    </span>
                                    {isActive && (
                                      <div 
                                        className={`w-[8px] h-[8px] rounded-full flex-shrink-0 cursor-pointer ${isArmed 
                                          ? (isSelected ? 'bg-white' : 'bg-black group-hover/section:bg-white')
                                          : (isSelected ? 'border-[1.5px] border-white bg-transparent' : 'border-[1.5px] border-black bg-transparent group-hover/section:border-white')
                                        }`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          props.setArrangementBanks(prev => prev.map((arr, i) => i === props.activeArrIdx ? arr.map(s => s.id === step.id ? { ...s, armedPatternId: p.id } : s) : arr));
                                        }}
                                        onMouseEnter={() => setHint(isArmed ? 'RECORDING TO THIS PATTERN' : 'ARM TO RECORD HERE')}
                                        onMouseLeave={() => setHint(null)}
                                      />
                                    )}
              </div>
                                );
                              })}
            </div>
          </div>

                          <div className="grid grid-cols-2 gap-x-[10px] px-[16px] pb-[16px]">
                            <button 
                              onClick={() => {
                                props.setArrangementBanks(prev => prev.map((arr, i) => i === props.activeArrIdx ? [...arr.slice(0, idx + 1), { ...step, id: randomUUID() }, ...arr.slice(idx + 1)] : arr));
                              }}
                              onMouseEnter={() => setHint('DUPLICATE SECTION')}
                              onMouseLeave={() => setHint(null)}
                              className={`h-[18px] border-2 uppercase font-medium transition-none flex items-center justify-center ${isSelected 
                                ? 'border-black text-black hover:bg-black hover:text-white'
                                : 'border-white text-white hover:bg-black hover:border-black hover:!text-white group-hover/section:border-black group-hover/section:text-black'
                              }`}
                              style={{ 
                                fontFamily: 'Barlow Condensed', 
                                fontSize: '10px'
                              }}
                            >
                              DUPLICATE
                            </button>
                            <button 
                              onClick={() => {
                                if (props.currentArrangement.length > 1) {
                                  props.setArrangementBanks(prev => prev.map((arr, i) => i === props.activeArrIdx ? arr.filter(s => s.id !== step.id) : arr));
                                  if (props.currentSongStepIdx >= props.currentArrangement.length - 1) {
                                    props.setCurrentSongStepIdx(Math.max(0, props.currentArrangement.length - 2));
                                  }
                                  props.setEditingStepId(null);
                                }
                              }}
                              onMouseEnter={() => setHint('DELETE SECTION')}
                              onMouseLeave={() => setHint(null)}
                              className={`h-[18px] border-2 uppercase font-medium transition-none flex items-center justify-center ${isSelected 
                                ? 'border-black text-black hover:bg-black hover:text-white'
                                : 'border-white text-white hover:bg-black hover:border-black hover:!text-white group-hover/section:border-black group-hover/section:text-black'
                              }`}
                              style={{ 
                                fontFamily: 'Barlow Condensed', 
                                fontSize: '10px'
                              }}
                            >
                              DELETE
                            </button>
            </div>
              </div>
                    )}
                  </div>
                    
                    {idx === props.currentArrangement.length - 1 && props.dropIndicatorIdx === props.currentArrangement.length && props.draggedStepIdx !== null && (
                      <div className="h-0.5 w-full mt-1" style={{ backgroundColor: 'var(--color-outline)' }} />
                    )}
              </div>
                );
              })}
              
              <button 
                onClick={props.addSongStep} 
                onMouseEnter={() => setHint('ADD SECTION TO SONG')}
                onMouseLeave={() => setHint(null)}
                className="h-[22px] border-2 border-dashed uppercase font-medium transition-none mt-[8px] flex items-center justify-center border-white text-white hover:bg-white hover:text-black"
                style={{ 
                  fontFamily: 'Barlow Condensed', 
                  fontSize: '10px'
                }}
              >
                NEW SECTION
              </button>
            </div>
          </div>
        </div>

        {/* LEFT BOTTOM - Pattern List (height: 289px, from y=544 to y=833) */}
        <div style={{ height: '289px', flexShrink: 0, position: 'relative' }} className="flex flex-col">
             {/* Menu Buttons: NEW PATTERN | DUPLICATE | RENAME */}
             <div style={{ 
               position: 'absolute',
               bottom: '222px', // 23px (sequence bank bottom) + 180px (sequence bank height) + 11px (gap) + 8px (moved up) = 222px from bottom
               left: '29px',
               width: '313px',
               height: '11px',
               border: '2px solid var(--color-border)',
               boxSizing: 'content-box', // Stroke alignment: outside
               display: 'flex'
             }}>
               {/* Divider lines */}
               <div style={{
                 position: 'absolute',
                 left: 'calc(33.333% - 1px)',
                 top: 0,
                 width: '2px',
                 height: '100%',
                 background: 'var(--color-fg)'
               }} />
               <div style={{
                 position: 'absolute',
                 left: 'calc(66.666% - 1px)',
                 top: 0,
                 width: '2px',
                 height: '100%',
                 background: 'var(--color-fg)'
               }} />
               
               {/* Button areas */}
               <button 
                 onClick={props.createNewPattern}
                 onMouseEnter={() => setHint('CREATE NEW PATTERN')}
                 onMouseLeave={() => setHint(null)}
                 className="menu-button-hover"
                 style={{
                   flex: 1,
                   height: '100%',
                   background: 'transparent',
                   border: 'none',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   padding: 0,
                   fontFamily: "'Barlow Condensed', sans-serif",
                   fontStyle: 'normal',
                   fontWeight: 500,
                   fontSize: '10px',
                   lineHeight: '12px',
                   color: 'var(--color-text)',
                   transition: 'none'
                 }}
               >
                 NEW PATTERN
                        </button>
               <button 
                 onClick={() => props.duplicatePattern(props.currentPatternId)}
                 onMouseEnter={() => setHint('DUPLICATE PATTERN')}
                 onMouseLeave={() => setHint(null)}
                 className="menu-button-hover"
                 style={{
                   flex: 1,
                   height: '100%',
                   background: 'transparent',
                   border: 'none',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   padding: 0,
                   fontFamily: "'Barlow Condensed', sans-serif",
                   fontStyle: 'normal',
                   fontWeight: 500,
                   fontSize: '10px',
                   lineHeight: '12px',
                   color: 'var(--color-text)',
                   transition: 'none'
                 }}
               >
                 DUPLICATE
               </button>
               <button 
                 onClick={() => props.setEditingPatternId(props.currentPatternId)}
                 onMouseEnter={() => setHint('RENAME PATTERN')}
                 onMouseLeave={() => setHint(null)}
                 className="menu-button-hover"
                 style={{
                   flex: 1,
                   height: '100%',
                   background: 'transparent',
                   border: 'none',
                   cursor: 'pointer',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   padding: 0,
                   fontFamily: "'Barlow Condensed', sans-serif",
                   fontStyle: 'normal',
                   fontWeight: 500,
                   fontSize: '10px',
                   lineHeight: '12px',
                   color: 'var(--color-text)',
                   transition: 'none'
                 }}
               >
                 RENAME
               </button>
                </div>

             {/* Sequence Bank with Three Columns */}
             <div style={{
               position: 'absolute',
               bottom: '23px',
               left: '29px',
               width: '317px',
               height: '180px'
             }}>
               {/* Column Dividers - 4 vertical lines with bracket accents (fixed, don't scroll) */}
               {/* Left edge line - accents extend inward (right) */}
               <div style={{
                 position: 'absolute',
                 left: '0px',
                 top: '0px',
                 width: '2px',
                 height: '180px',
                 background: 'var(--color-fg)',
                 zIndex: 2,
                 pointerEvents: 'none'
               }}>
                 {/* Top accent - 5px extending right from divider */}
                 <div style={{
                   position: 'absolute',
                   left: '0px',
                   top: '0px',
                   width: '5px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
                 {/* Bottom accent - 5px extending right from divider */}
                 <div style={{
                   position: 'absolute',
                   left: '0px',
                   bottom: '0px',
                   width: '5px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
             </div>
               {/* Divider between column 1 and 2 - 8px accent centered */}
               <div style={{
                 position: 'absolute',
                 left: '104px',
                 top: '0px',
                 width: '2px',
                 height: '180px',
                 background: 'var(--color-fg)',
                 zIndex: 2,
                 pointerEvents: 'none'
               }}>
                 {/* Top accent - 8px centered on 2px divider (3px each side) */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   top: '0px',
                   width: '8px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
                 {/* Bottom accent - 8px centered on 2px divider */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   bottom: '0px',
                   width: '8px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
               </div>
               {/* Divider between column 2 and 3 - 8px accent centered */}
               <div style={{
                 position: 'absolute',
                 left: '209px',
                 top: '0px',
                 width: '2px',
                 height: '180px',
                 background: 'var(--color-fg)',
                 zIndex: 2,
                 pointerEvents: 'none'
               }}>
                 {/* Top accent - 8px centered on 2px divider (3px each side) */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   top: '0px',
                   width: '8px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
                 {/* Bottom accent - 8px centered on 2px divider */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   bottom: '0px',
                   width: '8px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
               </div>
               {/* Right edge line - accents extend inward (left) */}
               <div style={{
                 position: 'absolute',
                 left: '313px',
                 top: '0px',
                 width: '2px',
                 height: '180px',
                 background: 'var(--color-fg)',
                 zIndex: 2,
                 pointerEvents: 'none'
               }}>
                 {/* Top accent - 5px extending left from divider */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   top: '0px',
                   width: '5px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
                 {/* Bottom accent - 5px extending left from divider */}
                 <div style={{
                   position: 'absolute',
                   left: '-3px',
                   bottom: '0px',
                   width: '5px',
                   height: '2px',
                   background: 'var(--color-fg)'
                 }} />
               </div>

               {/* Scrollable Content Area - 305x168px visible, scrolls when content exceeds */}
              <div style={{
                position: 'absolute',
                left: '0px', // Start at left edge, aligned with left divider
                top: '6px',  // Shift down 2px to center the 30-pattern block
                width: '315px', // From 0px to 315px (matches divider positions: 0, 105, 210, 315)
                height: '168px',
                overflowY: 'auto',
                overflowX: 'hidden',
                zIndex: 1
              }}
               className="sequence-bank-scroll"
               >
                 {/* Pattern Columns Container */}
                 {(() => {
                   // Reverse patterns so newest (last in array) appears first
                   const reversedPatterns = [...props.patterns].reverse();
                   // Simple left-to-right distribution: newest at top-left, oldest at bottom-right
                   // idx % 3 === 0 → Left, idx % 3 === 1 → Middle, idx % 3 === 2 → Right
                   const leftColumnPatterns = reversedPatterns.filter((_, idx) => idx % 3 === 0);
                   const middleColumnPatterns = reversedPatterns.filter((_, idx) => idx % 3 === 1);
                   const rightColumnPatterns = reversedPatterns.filter((_, idx) => idx % 3 === 2);
                   
                   return (
                     <div style={{
                       display: 'flex',
                       gap: '0px',
                       width: '315px', // 3 columns × 105px = 315px (matches divider positions)
                       minHeight: '168px',
                       paddingTop: '0px', // No top padding for optimal positioning
                       paddingBottom: '4px',
                       boxSizing: 'border-box'
                     }}>
                       {/* Left Column - 105px wide, aligned with dividers at 0px and 105px */}
                       <div style={{
                         width: '105px',
                         display: 'flex',
                         flexDirection: 'column',
                         alignItems: 'center',
                         gap: '2px',
                         flexShrink: 0
                       }}>
                         {leftColumnPatterns.map(p => (
                  <div key={p.id} className="relative group" style={{ flexShrink: 0 }}>
                    {props.editingPatternId === p.id ? (
                         <input 
                           autoFocus 
                           maxLength={15}
                           className="pattern-edit-input"
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box', // Stroke alignment: outside
                             background: 'var(--color-bg)',
                             color: 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             outline: 'none',
                             padding: 0,
                             textTransform: 'uppercase'
                           }}
                        value={p.name} 
                        onChange={(e) => props.renamePattern(p.id, e.target.value)} 
                        onBlur={() => props.setEditingPatternId(null)} 
                        onKeyDown={e => {
                          if (e.key === 'Enter') props.setEditingPatternId(null);
                          if (e.key === 'Escape') props.setEditingPatternId(null);
                           }} 
                         />
                    ) : (
                         <>
                      <button 
                             onClick={() => props.setCurrentPatternId(p.id)} 
                             onDoubleClick={() => props.setEditingPatternId(p.id)}
                             onMouseEnter={() => setHint(`PATTERN: ${p.name}`)}
                             onMouseLeave={() => setHint(null)}
                             className={props.currentPatternId === p.id ? '' : 'pattern-button-hover'}
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box',
                               background: props.currentPatternId === p.id ? 'var(--color-active-bg)' : 'transparent',
                               color: props.currentPatternId === p.id ? 'var(--color-active-fg)' : 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             cursor: 'pointer',
                             padding: 0,
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             textTransform: 'uppercase',
                             transition: 'none'
                           }}
                           >
                        {p.name.toUpperCase()}
                      </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); props.deletePattern(p.id); }} 
                            style={{
                              position: 'absolute',
                              top: '-1px',
                              right: '-1px',
                              width: '11px',
                              height: '11px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text)',
                              fontSize: '9px',
                              fontFamily: 'Barlow Condensed',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              opacity: 0,
                              zIndex: 10,
                              lineHeight: 1,
                              padding: 0
                            }}
                            className="group-hover:!opacity-100"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)';
                              e.currentTarget.style.color = 'var(--color-hover-fg)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                              e.currentTarget.style.color = 'var(--color-text)';
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                 </div>
               ))}
            </div>

                      {/* Middle Column - 105px wide, aligned with dividers at 105px and 210px */}
                       <div style={{
                         width: '105px',
                         display: 'flex',
                         flexDirection: 'column',
                         alignItems: 'center',
                         gap: '2px',
                         flexShrink: 0
                       }}>
                         {middleColumnPatterns.map(p => (
                     <div key={p.id} className="relative group" style={{ flexShrink: 0 }}>
                       {props.editingPatternId === p.id ? (
                         <input 
                           autoFocus 
                           maxLength={15}
                           className="pattern-edit-input"
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box', // Stroke alignment: outside
                             background: 'var(--color-bg)',
                             color: 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             outline: 'none',
                             padding: 0,
                             textTransform: 'uppercase'
                           }}
                           value={p.name} 
                        onChange={(e) => props.renamePattern(p.id, e.target.value)} 
                        onBlur={() => props.setEditingPatternId(null)} 
                           onKeyDown={e => {
                          if (e.key === 'Enter') props.setEditingPatternId(null);
                          if (e.key === 'Escape') props.setEditingPatternId(null);
                           }} 
                         />
                       ) : (
                         <>
                           <button 
                             onClick={() => props.setCurrentPatternId(p.id)} 
                             onDoubleClick={() => props.setEditingPatternId(p.id)}
                             onMouseEnter={() => setHint(`PATTERN: ${p.name}`)}
                             onMouseLeave={() => setHint(null)}
                             className={props.currentPatternId === p.id ? '' : 'pattern-button-hover'}
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box',
                               background: props.currentPatternId === p.id ? 'var(--color-active-bg)' : 'transparent',
                               color: props.currentPatternId === p.id ? 'var(--color-active-fg)' : 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             cursor: 'pointer',
                             padding: 0,
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             textTransform: 'uppercase',
                             transition: 'none'
                           }}
                           >
                             {p.name.toUpperCase()}
                           </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); props.deletePattern(p.id); }} 
                            style={{
                              position: 'absolute',
                              top: '-1px',
                              right: '-1px',
                              width: '11px',
                              height: '11px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text)',
                              fontSize: '9px',
                              fontFamily: 'Barlow Condensed',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              opacity: 0,
                              zIndex: 10,
                              lineHeight: 1,
                              padding: 0
                            }}
                            className="group-hover:!opacity-100"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)';
                              e.currentTarget.style.color = 'var(--color-hover-fg)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                              e.currentTarget.style.color = 'var(--color-text)';
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                        </div>
                      ))}
            </div>
            
                      {/* Right Column - 105px wide, aligned with dividers at 210px and 315px */}
                       <div style={{
                         width: '105px',
                         display: 'flex',
                         flexDirection: 'column',
                         alignItems: 'center',
                         gap: '2px',
                         flexShrink: 0
                       }}>
                         {rightColumnPatterns.map(p => (
                     <div key={p.id} className="relative group" style={{ flexShrink: 0 }}>
                       {props.editingPatternId === p.id ? (
                         <input 
                           autoFocus 
                           maxLength={15}
                           className="pattern-edit-input"
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box', // Stroke alignment: outside
                             background: 'var(--color-bg)',
                             color: 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             outline: 'none',
                             padding: 0,
                             textTransform: 'uppercase'
                           }}
                           value={p.name} 
                        onChange={(e) => props.renamePattern(p.id, e.target.value)} 
                        onBlur={() => props.setEditingPatternId(null)} 
                           onKeyDown={e => {
                          if (e.key === 'Enter') props.setEditingPatternId(null);
                          if (e.key === 'Escape') props.setEditingPatternId(null);
                           }} 
                         />
                       ) : (
                         <>
                           <button 
                             onClick={() => props.setCurrentPatternId(p.id)} 
                             onDoubleClick={() => props.setEditingPatternId(p.id)}
                             onMouseEnter={() => setHint(`PATTERN: ${p.name}`)}
                             onMouseLeave={() => setHint(null)}
                             className={props.currentPatternId === p.id ? '' : 'pattern-button-hover'}
                           style={{
                             width: '91px',
                             height: '11px',
                             border: '2px solid var(--color-border)',
                             boxSizing: 'content-box',
                               background: props.currentPatternId === p.id ? 'var(--color-active-bg)' : 'transparent',
                               color: props.currentPatternId === p.id ? 'var(--color-active-fg)' : 'var(--color-text)',
                             fontFamily: "'Barlow Condensed', sans-serif",
                             fontStyle: 'normal',
                             fontWeight: 500,
                             fontSize: '10px',
                             lineHeight: '12px',
                             textAlign: 'center',
                             cursor: 'pointer',
                             padding: 0,
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             textTransform: 'uppercase',
                             transition: 'none'
                           }}
                           >
                             {p.name.toUpperCase()}
                     </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); props.deletePattern(p.id); }} 
                            style={{
                              position: 'absolute',
                              top: '-1px',
                              right: '-1px',
                              width: '11px',
                              height: '11px',
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text)',
                              fontSize: '9px',
                              fontFamily: 'Barlow Condensed',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              opacity: 0,
                              zIndex: 10,
                              lineHeight: 1,
                              padding: 0
                            }}
                            className="group-hover:!opacity-100"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)';
                              e.currentTarget.style.color = 'var(--color-hover-fg)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg)';
                              e.currentTarget.style.color = 'var(--color-text)';
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                        </div>
                  ))}
                </div>
                    </div>
                  );
                })()}
               </div>
             </div>
          </div>
             </div>
             
      {/* ═══════════════════════════════════════════════════════════════════════════
          MIDDLE COLUMN (523px) - Transport, Pad Grid, Effects
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{ width: '523px', height: '833px', flexShrink: 0 }} className="flex flex-col">
        
        {/* MIDDLE TOP - Transport Display - centered to frame: (1288 - 416) / 2 = 436, relative to middle col start at 380: 436 - 380 = 56px offset */}
        {/* Top margin of 22px aligns with left and right columns */}
        <div style={{ width: '416px', flexShrink: 0, marginLeft: '56px', marginTop: '22px', position: 'relative' }} className="display-bg">

          {/* Top Row: Mode, Transport Buttons, Location */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: '10px', color: 'var(--color-text)', marginTop: '-2px' }}>
              {props.isSongMode ? 'SONG_MODE' : 'PATTERN_MODE'}
            </div>

            {/* Transport Buttons - Centered */}
            <TransportButtons
              transport={props.transport}
              onPlayStop={props.toggleTransport}
              onRecord={props.toggleRecord}
            />
                            
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: '10px', color: 'var(--color-text)', textTransform: 'uppercase', marginTop: '-2px' }}>
              {props.transport !== TransportStatus.STOPPED ? (props.isSongMode ? props.currentStep?.name : props.activePattern?.name) : 'STANDBY'}
            </div>
          </div>

          {/* Current Time Segment Display - 14px below buttons (buttons end at 52px from top, so this starts at 66px) */}
          <div 
            style={{ display: 'flex', justifyContent: 'center', marginTop: '34px', position: 'relative', zIndex: 1 }}
            onMouseEnter={() => setHint('TIME: CURRENT POSITION')}
            onMouseLeave={() => setHint(null)}
          >
            <SegmentDisplay value={formatTimeForDisplay(props.currentSongTime)} size="large" />
          </div>

          {/* Total Time Segment Display - 14px below current time */}
          <div 
            style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', position: 'relative', zIndex: 1 }}
            onMouseEnter={() => setHint('TIME: TOTAL DURATION')}
            onMouseLeave={() => setHint(null)}
          >
            <SegmentDisplay value={formatTimeForDisplay(props.totalSongDuration)} size="small" />
          </div>
                              
          {/* Beat Indicators - 17px below total time */}
          <div className="flex gap-px h-1" style={{ marginTop: '17px' }}>
            {Array.from({ length: Math.max(PADS_PER_BANK, props.visualBeatsCount) }).map((_, i) => (
              <div key={i} ref={el => { props.beatIndicatorRefs.current[i] = el; }} style={{ backgroundColor: i % 4 === 0 ? 'var(--color-downbeat-indicator)' : 'var(--color-beat-indicator)' }} className="flex-1" />
            ))}
          </div>

          {/* Progress Bar - 8px below beat indicators */}
          <div className="h-px w-full relative" style={{ marginTop: '8px', backgroundColor: 'var(--color-grid-line)' }}>
            <div ref={props.progressBarRef} className="h-full absolute" style={{ backgroundColor: 'var(--color-fg)' }} />
          </div>

          {/* Level Meters - Symmetrical layout:
              Leftmost: left channel, low freq (bass/low-mid)
              Second from left: left channel, high freq (high-mid/treble)
              Second from right: right channel, high freq (high-mid/treble)
              Rightmost: right channel, low freq (bass/low-mid)
          */}
          <LevelMeter channel="left" frequencyBand="low" />
          <LevelMeter channel="left" frequencyBand="high" />
          <LevelMeter channel="right" frequencyBand="high" />
          <LevelMeter channel="right" frequencyBand="low" />
        </div>

        {/* MIDDLE CENTER - Pad Grid - 36px below progress bar, centered to frame (same 56px offset) */}
        <div style={{ flexShrink: 0, paddingTop: '36px', marginLeft: '56px' }} className="flex flex-col pb-3">
          <PadGrid pads={props.currentBankPads} activePadIds={props.activePadIds} selectedPadId={props.selectedPadId} onPadClick={(id) => { 
            if (props.selectedPadId !== id) { props.stopPreview(); }
            props.setSelectedPadId(id);
            // Also select the pad's sample in the library
            const pad = props.pads.find(p => p.id === id);
            if (pad?.sampleId) {
              props.setSelectedSampleId(pad.sampleId);
            }
            props.triggerPad(id); 
          }} />
        </div>
                          
        {/* MIDDLE BOTTOM - Spacer for effects panel area */}
        <div style={{ height: '320px', flexShrink: 0 }} />
                        </div>
      
      {/* Effects Panel - Absolutely positioned to match Figma coordinates */}
      <div 
        className="absolute"
        style={{ 
          left: '400px', 
          top: '535px',
          zIndex: 10,
        }}
      >
        <EffectsPanel
          pad={props.selectedPadId !== null ? props.pads.find(p => p.id === props.selectedPadId) ?? null : null}
          onPadChange={(updates) => {
            if (props.selectedPadId === null) return;
            props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, ...updates } : p));
          }}
        />
        <HintDisplay defaultHint={props.defaultHint} />
      </div>

      {/* Bank Selectors - Positioned below Effects Panel */}
      {/* Frame: 1288x833
          - Labels are 716px from top
          - Last triangle is 27px from bottom (806px from top)
          - SONG LABEL is 402px from left
          - PAD LABEL is 402px from right (1288 - 402 = 886px from left)
          - PAD BANK is 411px to the right of SONG BANK (402 + 411 = 813px, but 402px from right takes priority)
          - 14px between LABEL and triangles */}
      {/* Song Bank - Label at 402px from left, 716px from top */}
      <div 
        className="absolute z-10"
        style={{ 
          left: '402px',
          top: '716px',
        }}
      >
        <SongBankOverlay
          activeBankIdx={props.activeArrIdx}
          onBankChange={(idx) => {
            // Always allow 0-3, create bank if it doesn't exist
            if (idx >= 0 && idx < MAX_ARRANGEMENT_BANKS) {
              // Ensure we have enough banks
              props.setArrangementBanks(prev => {
                const newBanks = [...prev];
                while (newBanks.length <= idx) {
                  const firstPatternId = props.patterns[0]?.id || randomUUID();
                  newBanks.push(createDefaultArrangement(firstPatternId));
                }
                return newBanks;
              });
              props.setActiveArrIdx(idx);
            }
          }}
        />
      </div>

      {/* Pad Bank - Label at 886px from left (402px from right: 1288 - 402 = 886), 716px from top */}
      <div 
        className="absolute z-10"
        style={{ 
          right: '402px',
          top: '716px',
        }}
      >
        <PadBankOverlay
          activeBankIdx={props.activeBankIdx}
          onBankChange={(idx) => {
            // Always allow 0-3, create bank if it doesn't exist
            if (idx >= 0 && idx < MAX_ARRANGEMENT_BANKS) {
              const currentBankCount = Math.floor(props.pads.length / PADS_PER_BANK);
              if (idx >= currentBankCount) {
                // Create new banks as needed
                const banksToAdd = idx - currentBankCount + 1;
                const newPads = [...props.pads];
                for (let i = 0; i < banksToAdd; i++) {
                  newPads.push(...createBank(currentBankCount + i));
                }
                props.setPads(newPads);
              }
              props.setActiveBankIdx(idx);
            }
          }}
        />
      </div>
                        
      {/* ═══════════════════════════════════════════════════════════════════════════
          RIGHT COLUMN (385px) - Tempo, Waveform, Sample Library
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{ width: '385px', height: '833px', flexShrink: 0, position: 'relative' }}>
        
        {/* RIGHT TOP - Tempo/Metronome - positioned absolutely to match requirements */}
        {/* Frame: 1288x833, Right column starts at x=903 (1288-385=903) */}
        {/* Tempo: 64px from right of frame, width=99px, so x=1288-64-99=1125, y=22 */}
        {/* Metronome: 193px from right of frame, width=131px, so x=1288-193-131=964, y=22 */}
        {/* Gap between metronome and tempo: 1125-1095=30px (metronome ends at 964+131=1095) */}
        <div style={{ position: 'absolute', top: '22px' }}>
          {/* Metronome - 131x100, positioned at x=964 relative to frame, so 964-903=61px from right column left */}
          <div style={{ position: 'absolute', left: '61px' }}>
            <Metronome
              tempo={props.tempo}
              isEnabled={props.isMetronomeEnabled}
              isPlaying={props.transport !== TransportStatus.STOPPED}
              onToggle={() => props.setIsMetronomeEnabled(!props.isMetronomeEnabled)}
            />
          </div>
          
          {/* Tempo Dial - 99x100, positioned at x=1125 relative to frame, so 1125-903=222px from right column left */}
          <div style={{ position: 'absolute', left: '222px' }}>
            <TempoDial
              tempo={props.tempo}
              onTempoChange={(newTempo) => props.setTempo(clampTempo(newTempo))}
              isDragging={props.isDraggingTempo}
              onDragStart={() => props.setIsDraggingTempo(true)}
              onDragEnd={() => props.setIsDraggingTempo(false)}
              onTap={props.handleTap}
              isTapping={props.isTapping}
            />
          </div>
        </div>

        {/* RIGHT MIDDLE - Waveform Editor - positioned absolutely to match SVG coordinates */}
        {/* Waveform Editor: x=944 (41px from right column left), y=190, width=313, height=300 */}
        <div style={{ position: 'absolute', top: '190px', left: '41px' }}>
          {(() => {
            const pad = props.selectedPadId !== null ? props.pads.find(p => p.id === props.selectedPadId) : null;
            const sample = pad?.sampleId ? props.samples.find(s => s.id === pad.sampleId) : null;
            
            // Create a dummy empty sample when there's no sample to load
            const emptySample: SampleData = {
              id: '',
              name: '',
              buffer: audioEngine.ctx.createBuffer(1, 1, audioEngine.ctx.sampleRate) // Empty buffer
            };
            
            const activeSample = sample || emptySample;
            const activePad = pad || { start: 0, end: 0.001, isReversed: false, playMode: 'MONO' as const };
            
            // Get waveform view state for the selected pad (or defaults) - read from ref
            const padViewState = props.selectedPadId !== null 
              ? props.waveformViewStateRef.current.get(props.selectedPadId) 
              : null;
            const zoom = padViewState?.zoom ?? 1;
            const scrollOffset = padViewState?.scrollOffset ?? 0;
            const focusMode = padViewState?.focusMode ?? 'start';
            
            return (
              <WaveformEditor 
                sample={activeSample} 
                start={activePad.start} 
                end={activePad.end || (activeSample.buffer.duration || 0.001)} 
                onUpdate={(start, end) => {
                  if (props.selectedPadId !== null) {
                    props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, start, end } : p));
                  }
                }} 
                onPreview={(time, looping) => {
                  if (props.selectedPadId !== null && sample) {
                    props.triggerPad(props.selectedPadId, time, looping);
                  }
                }}
                playbackTrigger={props.selectedPadId !== null && props.lastTriggerInfo?.padId === props.selectedPadId ? props.lastTriggerInfo.trigger : null}
                previewActive={props.selectedPadId !== null && props.previewActive && props.previewingPadId === props.selectedPadId}
                onLoopStop={() => props.setLastTriggerInfo(null)}
                padId={props.selectedPadId || undefined}
                isReversed={activePad.isReversed}
                playMode={activePad.playMode}
                onToggleReverse={() => {
                  if (props.selectedPadId !== null) {
                    props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, isReversed: !p.isReversed } : p));
                  }
                }}
                onTogglePlayMode={() => {
                  if (props.selectedPadId !== null) {
                    props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, playMode: p.playMode === 'POLY' ? 'MONO' : 'POLY' } : p));
                  }
                }}
                zoom={zoom}
                onZoomChange={(newZoom) => {
                  // Update ref immediately (no re-render)
                  if (props.selectedPadId !== null) {
                    const padId = props.selectedPadId;
                    const existingState = props.waveformViewStateRef.current.get(padId);
                    const currentState = existingState ?? { zoom: 1, scrollOffset: 0, focusMode: 'start' as const };
                    props.waveformViewStateRef.current.set(padId, { zoom: newZoom, scrollOffset: currentState.scrollOffset, focusMode: currentState.focusMode });
                  }
                }}
                scrollOffset={scrollOffset}
                onScrollOffsetChange={(newScrollOffset) => {
                  // Update ref immediately (no re-render)
                  if (props.selectedPadId !== null) {
                    const padId = props.selectedPadId;
                    const existingState = props.waveformViewStateRef.current.get(padId);
                    const currentState = existingState ?? { zoom: 1, scrollOffset: 0, focusMode: 'start' as const };
                    props.waveformViewStateRef.current.set(padId, { zoom: currentState.zoom, scrollOffset: newScrollOffset, focusMode: currentState.focusMode });
                  }
                }}
                focusMode={focusMode}
                onFocusModeChange={(newFocusMode) => {
                  // Update ref immediately (no re-render)
                  if (props.selectedPadId !== null) {
                    const padId = props.selectedPadId;
                    const existingState = props.waveformViewStateRef.current.get(padId);
                    const currentState = existingState ?? { zoom: 1, scrollOffset: 0, focusMode: 'start' as const };
                    props.waveformViewStateRef.current.set(padId, { zoom: currentState.zoom, scrollOffset: currentState.scrollOffset, focusMode: newFocusMode });
                  }
                }}
                waveformViewStateRef={props.waveformViewStateRef}
              />
            );
          })()}
        </div>
           
        {/* RIGHT BOTTOM - Sample Library - positioned absolutely to match SVG coordinates */}
        {/* Sample Library: x=943 (40px from right column left), y=594, width=313, height=214 */}
        <div style={{ position: 'absolute', top: '594px', left: '40px' }}>
          <SampleLibrary
            samples={props.samples}
            onLoadSample={async () => {
              // Create file input that supports individual files, multiple files, and folder navigation
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'audio/*';
              // Enable multiple file selection - allows selecting one file, multiple files,
              // or navigating into folders to select files (though not the folder itself)
              input.multiple = true;
              
              input.onchange = async (e) => {
                const files = Array.from((e.target as HTMLInputElement).files || []);
                if (files.length === 0) {
                  // User cancelled file selection - clear progress
                  props.setImportProgress(null);
                  return;
                }

                // Show progress indicator
                props.setImportProgress({ current: 0, total: files.length });

                try {
                  // Use optimized batch import handler
                  const { results, errors, skipped } = await props.processBatchImport(
                    files,
                    props.samples,
                    (current, total) => props.setImportProgress({ current, total })
                  );

                  // Check if no files were found
                  if (results.length === 0 && skipped.length === 0 && errors.length === 0) {
                    showWarning('No audio files selected');
                    props.setImportProgress(null);
                    return;
                  }

                  // Update samples list (prepend new samples so they appear at top)
                  if (results.length > 0) {
                    props.setSamples(prev => [...results, ...prev]);
                    // Select the first successfully loaded sample
                    props.setSelectedSampleId(results[0].id);
                  }

                  // User feedback for import results
                  if (errors.length > 0) {
                    const errorMsg = errors.length === 1 
                      ? `Failed to import: ${errors[0]}`
                      : `Failed to import ${errors.length} files: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`;
                    
                    if (results.length === 0 && skipped.length === 0) {
                      // All failed - critical error
                      showError(
                        errorMsg,
                        "Files may be corrupted or in an unsupported format."
                      );
                    } else if (results.length > 0) {
                      // Partial success - warning
                      showWarning(`${results.length} imported. ${errorMsg}`);
                    }
                  } else if (skipped.length > 0 && results.length === 0) {
                    showWarning('All files were duplicates and were skipped');
                  }
                } catch (err) {
                  showError(
                    "Import failed",
                    err instanceof Error ? err.message : "An unknown error occurred."
                  );
                } finally {
                  // Hide progress indicator
                  props.setImportProgress(null);
                }
              };
              
              input.click();
            }}
            onSampleSelect={(sampleId) => {
              if (sampleId === null) {
                // Deselecting - clear sample selection and unassign from pad
                props.setSelectedSampleId(null);
                if (props.selectedPadId !== null) {
                  props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, sampleId: null, start: 0, end: 0 } : p));
                }
              } else {
                props.setSelectedSampleId(sampleId);
                // If a pad is selected, assign the sample to it
                if (props.selectedPadId !== null) {
                  const sample = props.samples.find(s => s.id === sampleId);
                  if (sample) {
                    props.setPads(prev => prev.map(p => p.id === props.selectedPadId ? { ...p, sampleId: sampleId, start: 0, end: sample.buffer.duration } : p));
                  }
                }
              }
            }}
            selectedSampleId={props.selectedSampleId}
            onSamplesChange={(newSamples) => {
              props.setSamples(newSamples);
              // Clear selectedSampleId if the selected sample was deleted
              if (props.selectedSampleId && !newSamples.find(s => s.id === props.selectedSampleId)) {
                props.setSelectedSampleId(null);
              }
            }}
          />
        </div>
      </div>
                        </div>
      </div>
    </div>
  );
}

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SampleData } from '../types';
import { TriggerInfo, audioEngine } from '../services/audioEngine';

interface WaveformEditorProps {
  sample: SampleData;
  start: number;
  end: number;
  onUpdate: (start: number, end: number) => void;
  onPreview: (time: number, looping: boolean) => void;
  playbackTrigger: TriggerInfo | null;
  previewActive: boolean;
  onLoopStop?: () => void;
  padId?: number;
  isReversed?: boolean;
  playMode?: 'MONO' | 'POLY';
  onToggleReverse?: () => void;
  onTogglePlayMode?: () => void;
}

const WaveformEditor: React.FC<WaveformEditorProps> = ({ 
  sample, 
  start, 
  end, 
  onUpdate, 
  onPreview, 
  playbackTrigger, 
  previewActive, 
  onLoopStop,
  padId,
  isReversed = false,
  playMode = 'MONO',
  onToggleReverse,
  onTogglePlayMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const previewStartTimeRef = useRef<number>(0);
  const previewPositionRef = useRef<number>(0);
  const isPreviewingRef = useRef<boolean>(false);
  const lastLoopStartRef = useRef<number>(0);
  const lastLoopEndRef = useRef<number>(0);
  
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [focusMode, setFocusMode] = useState<'start' | 'end'>('start');
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | null>(null);
  const [isAltHeld, setIsAltHeld] = useState(false);
  const [isLoopingPreview, setIsLoopingPreview] = useState(false);

  const duration = sample.buffer.duration;
  const viewDuration = duration / zoom;
  const maxOffset = Math.max(0, duration - viewDuration);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);

  const HANDLE_PICK_RADIUS_PX = 40;
  const HANDLE_DIRECT_CLICK_RADIUS_PX = 20; // Smaller radius for direct clicks to switch sliders 

  // Update functions that allow crossing - swap happens in mouse move handler
  const updateStart = useCallback((val: number) => {
    const clampedVal = Math.max(0, Math.min(val, duration));
    // Allow crossing - no constraints
    onUpdate(clampedVal, end);
  }, [end, duration, onUpdate]);

  const updateEnd = useCallback((val: number) => {
    const clampedVal = Math.max(0, Math.min(val, duration));
    // Allow crossing - no constraints
    onUpdate(start, clampedVal);
  }, [start, duration, onUpdate]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    const timeAtX = effectiveOffset + normalizedX * viewDuration;

    if (e.altKey || isAltHeld) {
      runPreviewAt(timeAtX, false);
      return;
    }

    const timeToX = (t: number) => ((t - effectiveOffset) / viewDuration) * canvas.width;
    const startX = timeToX(start);
    const endX = timeToX(end);

    const mouseXCss = e.clientX - rect.left;
    const startXCss = startX * (rect.width / canvas.width);
    const endXCss = endX * (rect.width / canvas.width);

    const distToStart = Math.abs(mouseXCss - startXCss);
    const distToEnd = Math.abs(mouseXCss - endXCss);

    let target: 'start' | 'end' | null = null;

    // Check ranges with different thresholds
    const isInStartPickRange = distToStart < HANDLE_PICK_RADIUS_PX;
    const isInEndPickRange = distToEnd < HANDLE_PICK_RADIUS_PX;
    const isDirectClickOnStart = distToStart < HANDLE_DIRECT_CLICK_RADIUS_PX;
    const isDirectClickOnEnd = distToEnd < HANDLE_DIRECT_CLICK_RADIUS_PX;

    // STRICT RULE: If the currently focused slider is in pick range, ALWAYS use it
    // Only switch if the focused slider is NOT in range AND you click directly on the other one
    if (focusMode === 'start') {
      if (isInStartPickRange) {
        // START is focused and in range - always use it
        target = 'start';
      } else if (isDirectClickOnEnd) {
        // START is not in range, but clicked directly on END - switch to END
        target = 'end';
      }
      // If neither condition is met, target stays null (will use focusMode below)
    } else {
      // focusMode === 'end'
      if (isInEndPickRange) {
        // END is focused and in range - always use it
        target = 'end';
      } else if (isDirectClickOnStart) {
        // END is not in range, but clicked directly on START - switch to START
        target = 'start';
      }
      // If neither condition is met, target stays null (will use focusMode below)
    }

    if (target) {
      setIsDragging(true);
      setDragTarget(target);
      // Only update focus mode if switching to a different slider
      if (target !== focusMode) {
        setFocusMode(target);
      }
    } else {
      // Clicking away from both sliders - use the currently focused one
      // Handle potential crossover when clicking
      if (focusMode === 'start') {
        const newStart = Math.max(0, Math.min(timeAtX, duration));
        if (newStart > end) {
          // Crossed past end - swap
          onUpdate(end, newStart);
          setFocusMode('end');
          setDragTarget('end');
        } else {
          updateStart(timeAtX);
          setDragTarget('start');
        }
      } else {
        const newEnd = Math.max(0, Math.min(timeAtX, duration));
        if (newEnd < start) {
          // Crossed past start - swap
          onUpdate(newEnd, start);
          setFocusMode('start');
          setDragTarget('start');
        } else {
          updateEnd(timeAtX);
          setDragTarget('end');
        }
      }
      setIsDragging(true);
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const moveRect = canvas.getBoundingClientRect();
      const moveNormX = (moveEvent.clientX - moveRect.left) / moveRect.width;
      const moveTime = effectiveOffset + moveNormX * viewDuration;
      
      const activeTarget = dragTarget || focusMode;
      if (activeTarget === 'start') {
        const newStart = Math.max(0, Math.min(moveTime, duration));
        // Check if crossing past end - if so, swap values and focus
        if (newStart > end) {
          onUpdate(end, newStart);
          setFocusMode('end');
          setDragTarget('end');
        } else {
          updateStart(moveTime);
        }
      } else {
        const newEnd = Math.max(0, Math.min(moveTime, duration));
        // Check if crossing past start - if so, swap values and focus
        if (newEnd < start) {
          onUpdate(newEnd, start);
          setFocusMode('start');
          setDragTarget('start');
        } else {
          updateEnd(moveTime);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragTarget(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setIsAltHeld(true);
      if (e.key === 'Tab') {
        e.preventDefault();
        setFocusMode(prev => prev === 'start' ? 'end' : 'start');
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const nudge = e.shiftKey ? 0.05 : 0.001;
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (focusMode === 'start') updateStart(start + dir * nudge);
        else updateEnd(end + dir * nudge);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setIsAltHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [focusMode, start, end, updateStart, updateEnd]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const normalizedX = (e.clientX - rect.left) / rect.width;

      if (e.ctrlKey || e.metaKey) {
        const zoomSpeed = 0.01;
        const zoomDelta = 1 - e.deltaY * zoomSpeed;
        setZoom(prev => {
          const next = Math.max(1, Math.min(prev * zoomDelta, 50000));
          const timeAtMouse = effectiveOffset + normalizedX * (duration / prev);
          const nextViewDur = duration / next;
          setScrollOffset(Math.max(0, Math.min(timeAtMouse - normalizedX * nextViewDur, duration - nextViewDur)));
          return next;
        });
      } else {
        const scrollSpeed = (duration / zoom) / 1000;
        const moveX = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        setScrollOffset(prev => Math.max(0, Math.min(prev + moveX * scrollSpeed, maxOffset)));
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [duration, zoom, maxOffset, effectiveOffset]);

  const runPreviewAt = useCallback((time: number, looping: boolean) => {
    onPreview(time, looping);
    previewStartTimeRef.current = audioEngine.ctx.currentTime;
    previewPositionRef.current = time;
    isPreviewingRef.current = true;
    if (looping) setIsLoopingPreview(true);
  }, [onPreview]);

  useEffect(() => {
    if (!previewActive) {
      isPreviewingRef.current = false;
      setIsLoopingPreview(false);
    }
  }, [previewActive]);

  // Restart loop when start/end changes during loop playback
  useEffect(() => {
    if (isLoopingPreview && previewActive) {
      // Only restart if start/end actually changed (avoid infinite loops)
      if (lastLoopStartRef.current !== start || lastLoopEndRef.current !== end) {
        lastLoopStartRef.current = start;
        lastLoopEndRef.current = end;
        audioEngine.stopExclusiveScheduled(audioEngine.ctx.currentTime, 'preview');
        runPreviewAt(start, true);
      }
    }
  }, [start, end, isLoopingPreview, previewActive, runPreviewAt]);

  const toggleLoopPreview = () => {
    if (isLoopingPreview) {
      setIsLoopingPreview(false);
      isPreviewingRef.current = false;
      audioEngine.stopExclusiveScheduled(audioEngine.ctx.currentTime, 'preview');
      if (onLoopStop) onLoopStop();
    } else {
      // Validate start/end before looping - handle crossed sliders
      const loopDur = Math.abs(end - start);
      if (loopDur < 0.001) {
        console.warn('Cannot start loop: invalid start/end range', { start, end });
        return;
      }
      // Always start from the leftmost position
      const leftPos = Math.min(start, end);
      runPreviewAt(leftPos, true);
    }
  };

  // Calculate positions based on requirements
  const WAVE_TOP = 63; // Waveform container top position
  const WAVE_HEIGHT = 178;
  const WAVE_BOTTOM = WAVE_TOP + WAVE_HEIGHT; // 241
  
  // Buttons are 16px above waveform
  const BUTTONS_TOP = WAVE_TOP - 16 - 17; // 30 (accounting for button height)
  
  // Sample name is 10px above buttons
  const SAMPLE_NAME_TOP = BUTTONS_TOP - 10 - 12; // 8 (accounting for text height)
  
  // MONO toggle is 34px above waveform, centered
  const MONO_TOP = WAVE_TOP - 34 - 29; // 0
  const MONO_LEFT = (314 - 29) / 2; // 142.5
  const MONO_RIGHT = 314 - MONO_LEFT - 29; // Right edge position
  
  // Sample name should not overlap with mono button - check if they would overlap
  const SAMPLE_NAME_WIDTH = 88; // From CSS
  const SAMPLE_NAME_RIGHT = SAMPLE_NAME_TOP === MONO_TOP ? SAMPLE_NAME_WIDTH : 314; // Only constrain if on same row
  
  // Calculate button positions from right to left: REVERSE, LOOP, position, END, START
  // REVERSE at right edge of waveform container (313px)
  const REVERSE_WIDTH = 41;
  const REVERSE_LEFT = 313 - REVERSE_WIDTH; // 272
  // LOOP is 7px left of REVERSE
  const LOOP_WIDTH = 31;
  const LOOP_LEFT = REVERSE_LEFT - 7 - LOOP_WIDTH; // 234
  // Position number is 7px left of LOOP button container (not the text)
  const POS_WIDTH = 50; // Make it wider to accommodate the number text
  const POS_LEFT = LOOP_LEFT - 7 - POS_WIDTH; // Position's right edge is 7px left of LOOP's left edge
  // START/END at left edge (0px) of waveform container
  const START_LEFT = 0;
  const END_LEFT = START_LEFT + 31 + 7; // 38 (START width + gap)
  
  // PAD number is 10px above reverse button
  const PAD_TOP = BUTTONS_TOP - 10 - 12; // 8
  
  // Zoom slider is 34px below waveform
  const ZOOM_SLIDER_TOP = WAVE_BOTTOM + 34; // 275
  // Zoom counter is 7px above zoom slider, right-aligned with slider
  const ZOOM_COUNTER_TOP = ZOOM_SLIDER_TOP - 7 - 12; // 256
  // Instructions are 17px below zoom slider, centered
  const INSTRUCTIONS_TOP = ZOOM_SLIDER_TOP + 17; // 292
  
  // Calculate zoom slider position - reactive to zooming and scrolling
  const zoomSliderTotalWidth = 313; // Total slider width
  // The viewed section width is proportional to the zoom level
  // When zoomed in (high zoom), viewed section is smaller
  // When zoomed out (low zoom), viewed section is larger
  const zoomSliderWidth = duration > 0 && maxOffset > 0
    ? Math.max(10, Math.min(zoomSliderTotalWidth, (viewDuration / duration) * zoomSliderTotalWidth))
    : zoomSliderTotalWidth; // When fully zoomed out, slider takes full width
  
  // Calculate position: when at start (offset=0), position should be 0
  // When at end (offset=maxOffset), position should be (totalWidth - sliderWidth)
  const zoomSliderPosition = duration > 0 && maxOffset > 0
    ? (effectiveOffset / maxOffset) * (zoomSliderTotalWidth - zoomSliderWidth)
    : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRendering = true;

    // High-DPI canvas scaling for crisp waveforms
    const dpr = window.devicePixelRatio || 1;
    // Get actual display size from the rendered element
    const displayWidth = canvas.clientWidth || 313;
    const displayHeight = canvas.clientHeight || 174;
    
    // Set canvas buffer size to match display resolution
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    
    // Scale context to account for DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Check if buffer has no meaningful audio (empty buffer)
    const hasNoAudio = sample.buffer.length <= 1 || duration <= 0.001;

    const render = () => {
      if (!isRendering || document.hidden) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      const amp = displayHeight / 2;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 20; i++) {
        const gx = (i / 20) * displayWidth;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, displayHeight); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, amp); ctx.lineTo(displayWidth, amp); ctx.stroke();

      // If there's no audio, just draw a static horizontal line in the middle
      if (hasNoAudio) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, amp);
        ctx.lineTo(displayWidth, amp);
        ctx.stroke();
      } else {
        const data = sample.buffer.getChannelData(0);
        const startSampleIdx = Math.floor((effectiveOffset / duration) * data.length);
        const endSampleIdx = Math.floor(((effectiveOffset + viewDuration) / duration) * data.length);
        const samplesInView = endSampleIdx - startSampleIdx;

        // High-quality waveform rendering with subpixel precision
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        // Use more sample points for smoother rendering on high-DPI displays
        const renderWidth = displayWidth * dpr;
        for (let i = 0; i < renderWidth; i++) {
          const normalizedI = i / dpr;
          const s1 = startSampleIdx + Math.floor((normalizedI / displayWidth) * samplesInView);
          const s2 = startSampleIdx + Math.floor(((normalizedI + 1/dpr) / displayWidth) * samplesInView);
          if (s1 >= data.length) break;
          let min = 1.0, max = -1.0;
          const actualS2 = Math.max(s1 + 1, s2);
          for (let j = s1; j < actualS2 && j < data.length; j++) {
            const datum = data[j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
          ctx.moveTo(normalizedI, (1 + min) * amp);
          ctx.lineTo(normalizedI, (1 + max) * amp);
        }
        ctx.stroke();
      }

      // Skip the rest of the rendering (markers, playhead, etc.) when there's no audio
      if (hasNoAudio) {
        if (isRendering) {
          animationRef.current = requestAnimationFrame(render);
        }
        return;
      }

      const timeToX = (t: number) => ((t - effectiveOffset) / viewDuration) * displayWidth;
      const startX = timeToX(start);
      const endX = timeToX(end);
      
      // Calculate leftmost and rightmost positions (handle crossed sliders)
      const leftPos = Math.min(start, end);
      const rightPos = Math.max(start, end);
      const leftX = timeToX(leftPos);
      const rightX = timeToX(rightPos);

      // Invert colors in selected section (always between leftmost and rightmost)
      if (leftX < displayWidth && rightX > 0) {
        const previousCompositeOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.max(0, leftX), 0, Math.min(displayWidth, rightX) - Math.max(0, leftX), displayHeight);
        ctx.globalCompositeOperation = previousCompositeOp;
      }

      const now = audioEngine.ctx.currentTime;

      if (playbackTrigger) {
        const elapsed = now - playbackTrigger.startTime;
        const regionDuration = playbackTrigger.originalEnd - playbackTrigger.originalStart;
        
        if (elapsed < playbackTrigger.duration || playbackTrigger.duration === Infinity) {
          let phTime: number;
          
          if (playbackTrigger.isReversed) {
            const totalPositionInReversedBuffer = playbackTrigger.offset + (elapsed * playbackTrigger.rate);
            
            if (playbackTrigger.duration === Infinity && regionDuration > 0) {
              let wrappedPosition = totalPositionInReversedBuffer % regionDuration;
              if (wrappedPosition < 0) wrappedPosition += regionDuration;
              phTime = playbackTrigger.originalEnd - wrappedPosition;
            } else {
              phTime = playbackTrigger.originalEnd - totalPositionInReversedBuffer;
            }
            
            phTime = Math.max(playbackTrigger.originalStart, Math.min(playbackTrigger.originalEnd, phTime));
          } else {
            phTime = playbackTrigger.offset + (elapsed * playbackTrigger.rate);
            
            if (playbackTrigger.duration === Infinity && regionDuration > 0) {
              phTime = playbackTrigger.originalStart + ((phTime - playbackTrigger.originalStart) % regionDuration);
            } else {
              phTime = Math.max(playbackTrigger.originalStart, Math.min(playbackTrigger.originalEnd, phTime));
            }
          }
          
          const phX = timeToX(phTime);
          if (phX >= 0 && phX <= displayWidth) {
            const prevOp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'difference';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, displayHeight); ctx.stroke();
            ctx.globalCompositeOperation = prevOp;
          }
        }
      }

      if (isPreviewingRef.current && !playbackTrigger) {
        const elapsed = now - previewStartTimeRef.current;
        let phTime = previewPositionRef.current + elapsed;
        
        if (isLoopingPreview) {
          // Handle crossed sliders: loop duration is always positive
          const loopDur = Math.abs(end - start);
          if (loopDur > 0) {
            const timeInLoop = (elapsed % (loopDur / 1));
            const leftPos = Math.min(start, end);
            phTime = leftPos + timeInLoop;
          }
        }

        if (!isLoopingPreview && phTime >= duration) {
          isPreviewingRef.current = false;
        } else if (phTime <= duration && (!isLoopingPreview || phTime <= end + 0.1)) {
          const ghX = timeToX(phTime);
          if (ghX >= 0 && ghX <= displayWidth) {
            const prevOp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'difference';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 4]);
            ctx.beginPath(); ctx.moveTo(ghX, 0); ctx.lineTo(ghX, displayHeight); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalCompositeOperation = prevOp;
          }
        }
      }

      // Draw S and E markers
      // Always show S on left, E on right, but determine focus based on which value matches focusMode
      const drawMarker = (x: number, label: 'S' | 'E', isFocus: boolean) => {
        if (x < -20 || x > displayWidth + 20) return;
        
        // Draw vertical line - thicker and white when focused
        ctx.strokeStyle = isFocus ? '#FFFFFF' : '#000000';
        ctx.lineWidth = isFocus ? 3 : 2;
        ctx.beginPath(); 
        ctx.moveTo(x, 0); 
        ctx.lineTo(x, displayHeight); 
        ctx.stroke();
        
        // Draw rectangular handle - white background when focused, black when not
        const handleWidth = 14;
        const handleHeight = 16;
        
        // Handle background color based on focus
        ctx.fillStyle = isFocus ? '#FFFFFF' : '#000000';
        
        if (label === 'S') {
          // S handle: top right of the line (pointing into selection)
          ctx.fillRect(x, 0, handleWidth, handleHeight);
          
          // Add white outline when focused for extra visibility
          if (isFocus) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, 0, handleWidth, handleHeight);
          }
          
          // Text color: black when focused (on white background), white when not (on black background)
          ctx.fillStyle = isFocus ? '#000000' : '#FFFFFF';
          ctx.font = '600 11px Barlow Condensed';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + handleWidth / 2, handleHeight / 2);
        } else {
          // E handle: bottom left of the line (pointing into selection)
          ctx.fillRect(x - handleWidth, displayHeight - handleHeight, handleWidth, handleHeight);
          
          // Add white outline when focused for extra visibility
          if (isFocus) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - handleWidth, displayHeight - handleHeight, handleWidth, handleHeight);
          }
          
          // Text color: black when focused (on white background), white when not (on black background)
          ctx.fillStyle = isFocus ? '#000000' : '#FFFFFF';
          ctx.font = '600 11px Barlow Condensed';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x - handleWidth / 2, displayHeight - handleHeight / 2);
        }
      };

      // Determine which marker is focused based on focusMode and actual positions
      // If start > end, then start is on the right, end is on the left
      const isStartOnLeft = start <= end;
      const leftMarkerLabel: 'S' | 'E' = isStartOnLeft ? 'S' : 'E';
      const rightMarkerLabel: 'S' | 'E' = isStartOnLeft ? 'E' : 'S';
      const leftMarkerFocused = (isStartOnLeft && focusMode === 'start') || (!isStartOnLeft && focusMode === 'end');
      const rightMarkerFocused = (isStartOnLeft && focusMode === 'end') || (!isStartOnLeft && focusMode === 'start');

      drawMarker(leftX, leftMarkerLabel, leftMarkerFocused);
      drawMarker(rightX, rightMarkerLabel, rightMarkerFocused);

      if (isRendering) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    animationRef.current = requestAnimationFrame(render);
    return () => {
      isRendering = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [sample, zoom, effectiveOffset, viewDuration, duration, focusMode, start, end, playbackTrigger, isLoopingPreview]);

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '314px',
        height: '302px'
      }}
    >
      {/* File name - TTDWFM_MIX_1_6_23.WAV */}
      <div style={{
        position: 'absolute',
        height: '12px',
        fontFamily: 'Barlow Condensed',
        fontStyle: 'normal',
        fontWeight: 500,
        fontSize: '10px',
        lineHeight: '12px',
        color: '#FFFFFF',
        top: `${SAMPLE_NAME_TOP}px`,
        left: '0px',
        // Ensure it doesn't overlap with mono button - stop 30px before it
        maxWidth: `${MONO_LEFT - 30}px`,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {sample.name.toUpperCase()}
      </div>

      {/* START BUTTON */}
      <button
        onClick={() => setFocusMode('start')}
        style={{
          position: 'absolute',
          width: '31px',
          height: '17px',
          background: focusMode === 'start' ? '#FFFFFF' : 'transparent',
          border: '2px solid #FFFFFF',
          boxSizing: 'border-box',
          top: `${BUTTONS_TOP}px`,
          left: `${START_LEFT}px`,
          // Add subtle transition for smoother visual feedback
          transition: 'background-color 0.1s ease',
          cursor: 'pointer'
        }}
      >
        <span style={{
          position: 'absolute',
          width: '22px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          color: focusMode === 'start' ? '#000000' : '#FFFFFF',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          START
        </span>
      </button>

      {/* END BUTTON */}
      <button
        onClick={() => setFocusMode('end')}
        style={{
          position: 'absolute',
          width: '31px',
          height: '17px',
          border: '2px solid #FFFFFF',
          boxSizing: 'border-box',
          background: focusMode === 'end' ? '#FFFFFF' : 'transparent',
          top: `${BUTTONS_TOP}px`,
          left: `${END_LEFT}px`,
          // Add subtle transition for smoother visual feedback
          transition: 'background-color 0.1s ease',
          cursor: 'pointer'
        }}
      >
        <span style={{
          position: 'absolute',
          width: '15px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          color: focusMode === 'end' ? '#000000' : '#FFFFFF',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          END
        </span>
      </button>

      {/* MONO/POLY TOGGLE - Circle */}
      <button
        onClick={onTogglePlayMode}
        className="circular-button"
        style={{
          position: 'absolute',
          width: '29px',
          height: '29px',
          background: playMode === 'MONO' ? '#FFFFFF' : 'transparent',
          border: playMode === 'MONO' ? 'none' : '2px solid #FFFFFF',
          boxSizing: 'border-box',
          top: `${MONO_TOP}px`,
          left: `${MONO_LEFT}px`,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: 'pointer'
        }}
      >
        <span style={{
          position: 'absolute',
          width: '20px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          color: playMode === 'MONO' ? '#000000' : '#FFFFFF',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}>
          {playMode === 'MONO' ? 'MONO' : 'POLY'}
        </span>
      </button>

      {/* PAD_4 */}
      {padId !== undefined && (
        <div style={{
          position: 'absolute',
          width: '22px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          textAlign: 'right',
          color: '#FFFFFF',
          top: `${PAD_TOP}px`,
          right: '0px'
        }}>
          PAD_{padId}
        </div>
      )}

      {/* Time display - position number */}
      <div style={{
        position: 'absolute',
        width: `${POS_WIDTH}px`,
        height: '12px',
        fontFamily: 'Barlow Condensed',
        fontStyle: 'normal',
        fontWeight: 400,
        fontSize: '10px',
        lineHeight: '12px',
        color: '#FFFFFF',
        top: `${BUTTONS_TOP + 2.5}px`,
        left: `${POS_LEFT}px`,
        textAlign: 'right'
      }}>
        {(focusMode === 'start' ? start : end).toFixed(6)}
        </div>

      {/* LOOP BUTTON */}
      <button
        onClick={toggleLoopPreview}
        style={{
          position: 'absolute',
          width: '31px',
          height: '17px',
          border: isLoopingPreview ? 'none' : '2px solid #FFFFFF',
          boxSizing: 'border-box',
          background: isLoopingPreview ? '#FFFFFF' : 'transparent',
          top: `${BUTTONS_TOP}px`,
          left: `${LOOP_LEFT}px`
        }}
      >
        <span style={{
          position: 'absolute',
          width: '18px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          textAlign: 'center',
          color: isLoopingPreview ? '#000000' : '#FFFFFF',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          LOOP
        </span>
      </button>

      {/* REVERSE BUTTON */}
      <button
        onClick={onToggleReverse}
        style={{
          position: 'absolute',
          width: '41px',
          height: '17px',
          border: isReversed ? 'none' : '2px solid #FFFFFF',
          boxSizing: 'border-box',
          background: isReversed ? '#FFFFFF' : 'transparent',
          top: `${BUTTONS_TOP}px`,
          left: `${REVERSE_LEFT}px`
        }}
      >
        <span style={{
          position: 'absolute',
          width: '31px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: '10px',
          lineHeight: '12px',
          textAlign: 'center',
          color: isReversed ? '#000000' : '#FFFFFF',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          REVERSE
        </span>
      </button>

      {/* Waveform Container */}
      <div 
        className="waveform-container"
        style={{
          position: 'absolute',
          width: '313px',
          height: '178px',
          borderTop: '2px solid #FFFFFF',
          borderBottom: '2px solid #FFFFFF',
          borderLeft: 'none',
          borderRight: 'none',
          boxSizing: 'border-box',
          top: `${WAVE_TOP}px`,
          left: '0px'
        }}
      >
        <canvas 
          ref={canvasRef} 
          onMouseDown={handleCanvasMouseDown}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: isAltHeld ? 'crosshair' : 'default'
          }}
        />
      </div>

      {/* Zoom Slider */}
      <div 
        style={{
          position: 'absolute',
          width: '313px',
          height: '0px',
          border: '1px solid #FFFFFF',
          top: `${ZOOM_SLIDER_TOP}px`,
          left: '0px',
          cursor: 'pointer'
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const sliderElement = e.currentTarget;
          const rect = sliderElement.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          
          // Check if clicking on the handle (thicker part) or the track
          const handleLeft = zoomSliderPosition;
          const handleRight = zoomSliderPosition + zoomSliderWidth;
          const isClickingHandle = clickX >= handleLeft && clickX <= handleRight;
          
          let dragStartX = clickX;
          let dragStartOffset = effectiveOffset;
          
          const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const moveRect = sliderElement.getBoundingClientRect();
            const moveX = moveEvent.clientX - moveRect.left;
            const deltaX = moveX - dragStartX;
            
            if (isClickingHandle) {
              // Dragging the handle - scroll proportionally
              const deltaPercent = deltaX / zoomSliderTotalWidth;
              const deltaTime = deltaPercent * duration;
              const newOffset = dragStartOffset + deltaTime;
              setScrollOffset(Math.max(0, Math.min(newOffset, maxOffset)));
            } else {
              // Clicking on track - center view on clicked position
              const normalizedX = Math.max(0, Math.min(1, moveX / zoomSliderTotalWidth));
              const targetTime = normalizedX * duration;
              // Center the view on the clicked position
              const newOffset = Math.max(0, Math.min(targetTime - (viewDuration / 2), maxOffset));
              setScrollOffset(newOffset);
            }
          };
          
          const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };
          
          if (!isClickingHandle) {
            // If clicking on track (not handle), immediately jump to position
            const normalizedX = Math.max(0, Math.min(1, clickX / zoomSliderTotalWidth));
            const targetTime = normalizedX * duration;
            const newOffset = Math.max(0, Math.min(targetTime - (viewDuration / 2), maxOffset));
            setScrollOffset(newOffset);
          }
          
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
      >
        {/* Zoom Slider (Viewed section) - reactive to zooming and scrolling, draggable */}
        <div 
          style={{
            position: 'absolute',
            width: `${zoomSliderWidth}px`,
            height: '0px',
            border: '3px solid #FFFFFF',
            top: '-3px',
            left: `${zoomSliderPosition}px`,
            cursor: 'grab'
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const handleElement = e.currentTarget;
            const sliderElement = handleElement.parentElement;
            if (!sliderElement) return;
            
            const sliderRect = sliderElement.getBoundingClientRect();
            const handleRect = handleElement.getBoundingClientRect();
            const dragStartX = e.clientX;
            const dragStartOffset = effectiveOffset;
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              moveEvent.preventDefault();
              const deltaX = moveEvent.clientX - dragStartX;
              const deltaPercent = deltaX / sliderRect.width;
              const deltaTime = deltaPercent * duration;
              const newOffset = dragStartOffset + deltaTime;
              setScrollOffset(Math.max(0, Math.min(newOffset, maxOffset)));
            };
            
            const handleMouseUp = () => {
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
            };
            
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          }}
        />
        </div>

      {/* ZOOM COUNTER */}
      <div style={{
        position: 'absolute',
        fontFamily: 'Barlow Condensed',
        fontStyle: 'normal',
        fontWeight: 400,
        fontSize: '10px',
        lineHeight: '12px',
        color: '#FFFFFF',
        top: `${ZOOM_COUNTER_TOP}px`,
        right: '0px',
        whiteSpace: 'nowrap',
        textAlign: 'right'
      }}>
        ZOOM: {zoom.toFixed(0)}
      </div>

      {/* Instructions - centered with slider */}
      <div style={{
        position: 'absolute',
        top: `${INSTRUCTIONS_TOP}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '7px'
      }}>
        {/* ALT+CLICK: PLAY */}
        <div style={{
          width: '57px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '10px',
          lineHeight: '12px',
          color: '#FFFFFF'
        }}>
          ALT+CLICK: PLAY
        </div>

        {/* TAB: SWITCH SLIDERS */}
        <div style={{
          width: '72px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '10px',
          lineHeight: '12px',
          color: '#FFFFFF'
        }}>
          TAB: SWITCH SLIDERS
        </div>

        {/* PINCH: ZOOM */}
        <div style={{
          width: '44px',
          height: '12px',
          fontFamily: 'Barlow Condensed',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '10px',
          lineHeight: '12px',
          color: '#FFFFFF'
        }}>
          PINCH: ZOOM
        </div>
      </div>
    </div>
  );
};

export default WaveformEditor;

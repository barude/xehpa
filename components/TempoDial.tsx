import React, { useRef, useCallback, useEffect, useState } from 'react';
import SegmentDisplay from './SegmentDisplay';
import { TEMPO_MIN, TEMPO_MAX } from '../constants';
import { useHint } from './HintDisplay';

interface TempoDialProps {
  tempo: number;
  onTempoChange: (tempo: number) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onTap: () => void;
  isTapping: boolean;
}

// Dial configuration - scaled to 100px height (99px width from SVG)
const DIAL_SIZE = 99; // Width from SVG
const DIAL_HEIGHT = 100; // Height requirement
const CENTER = DIAL_SIZE / 2;
const CENTER_Y = DIAL_HEIGHT / 2;
// Scale factor: 100/130 = 0.76923
const OUTER_RADIUS = 48; // 62 * 0.76923 ≈ 48
const TICK_OUTER_RADIUS = 46; // 60 * 0.76923 ≈ 46
const TICK_INNER_RADIUS_MAJOR = 40; // 52 * 0.76923 ≈ 40
const TICK_INNER_RADIUS_MINOR = 43; // 56 * 0.76923 ≈ 43
const NUMBER_RADIUS = 32; // 42 * 0.76923 ≈ 32
const POINTER_RADIUS = 46; // 60 * 0.76923 ≈ 46

// Angle range: -135° to +135° (270° sweep, gap at bottom)
const START_ANGLE = -135;
const END_ANGLE = 135;
const ANGLE_RANGE = END_ANGLE - START_ANGLE;

// BPM labels to show on dial
const BPM_LABELS = [40, 80, 120, 160, 200, 240];

const TempoDial: React.FC<TempoDialProps> = ({
  tempo,
  onTempoChange,
  isDragging,
  onDragStart,
  onDragEnd,
  onTap,
  isTapping,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartTempoRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const { setHint } = useHint();

  // Convert BPM to angle (degrees, 0° = top, clockwise positive)
  const bpmToAngle = (bpm: number): number => {
    const clampedBpm = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, bpm));
    const ratio = (clampedBpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
    return START_ANGLE + ratio * ANGLE_RANGE;
  };

  // Clamp tempo to valid range
  const clampTempo = (t: number): number => {
    return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(t)));
  };

  // Handle mouse down - start vertical drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartTempoRef.current = tempo;
    onDragStart();
  }, [tempo, onDragStart]);

  // Handle scroll wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const sensitivity = 0.5;
    const newTempo = clampTempo(tempo + delta * sensitivity);
    onTempoChange(newTempo);
  }, [tempo, onTempoChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      // Vertical drag: up increases, down decreases
      const deltaY = dragStartYRef.current - e.clientY;
      const sensitivity = 2;
      const newTempo = clampTempo(dragStartTempoRef.current + deltaY / sensitivity);
      onTempoChange(newTempo);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragEnd();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onTempoChange, onDragEnd]);

  // Generate tick marks
  const ticks = [];
  const totalTicks = 54; // Number of tick marks around the dial
  
  for (let i = 0; i <= totalTicks; i++) {
    const tickAngle = START_ANGLE + (i / totalTicks) * ANGLE_RANGE;
    const angleRad = (tickAngle - 90) * (Math.PI / 180);
    
    const isMajor = i % 9 === 0; // Every 9th tick is major (aligns with labels)
    const innerR = isMajor ? TICK_INNER_RADIUS_MAJOR : TICK_INNER_RADIUS_MINOR;
    
    const x1 = CENTER + Math.cos(angleRad) * innerR;
    const y1 = CENTER_Y + Math.sin(angleRad) * innerR;
    const x2 = CENTER + Math.cos(angleRad) * TICK_OUTER_RADIUS;
    const y2 = CENTER_Y + Math.sin(angleRad) * TICK_OUTER_RADIUS;
    
    ticks.push(
      <line
        key={`tick-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={isMajor ? '#fff' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isMajor ? 1.5 : 0.75}
      />
    );
  }

  // Number labels removed to reduce visual clutter - segment display shows tempo clearly

  // Current angle for pointer
  const currentAngle = bpmToAngle(tempo);
  const pointerAngleRad = (currentAngle - 90) * (Math.PI / 180);
  
  // Pointer position (on the outer edge, pointing inward)
  const pointerX = CENTER + Math.cos(pointerAngleRad) * POINTER_RADIUS;
  const pointerY = CENTER_Y + Math.sin(pointerAngleRad) * POINTER_RADIUS;
  
  // Pointer triangle points (pointing toward center)
  const pointerSize = 4; // 5 * 0.76923 ≈ 4
  const pointerLength = 6; // 8 * 0.76923 ≈ 6
  const perpAngle = pointerAngleRad + Math.PI / 2;
  
  // Tip points toward center
  const tipX = CENTER + Math.cos(pointerAngleRad) * (POINTER_RADIUS - pointerLength);
  const tipY = CENTER_Y + Math.sin(pointerAngleRad) * (POINTER_RADIUS - pointerLength);
  
  // Base points
  const base1X = pointerX + Math.cos(perpAngle) * pointerSize;
  const base1Y = pointerY + Math.sin(perpAngle) * pointerSize;
  const base2X = pointerX - Math.cos(perpAngle) * pointerSize;
  const base2Y = pointerY - Math.sin(perpAngle) * pointerSize;

  return (
    <div 
      ref={dialRef}
      className="relative select-none"
      style={{ 
        width: DIAL_SIZE, 
        height: DIAL_HEIGHT, 
        minHeight: DIAL_HEIGHT,
        maxHeight: DIAL_HEIGHT,
        boxSizing: 'border-box',
        cursor: isDragging ? 'grabbing' : 'ns-resize' 
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onMouseEnter={() => {
        setIsHovered(true);
        setHint('TEMPO · TAP [T]');
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHint(null);
      }}
    >
      {/* SVG Dial Background */}
      <svg
        width={DIAL_SIZE}
        height={DIAL_HEIGHT}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_HEIGHT}`}
        className="absolute inset-0"
        style={{ display: 'block' }}
      >
        {/* Outer circle */}
        <circle
          cx={CENTER}
          cy={CENTER_Y}
          r={OUTER_RADIUS}
          fill="none"
          stroke={isHovered ? "#fff" : "rgba(255,255,255,0.3)"}
          strokeWidth="1"
        />
        
        {/* Inner dark background */}
        <circle
          cx={CENTER}
          cy={CENTER_Y}
          r={OUTER_RADIUS - 1}
          fill="#0a0a0a"
        />
        
        {/* Tick marks */}
        {ticks}
        
        {/* Pointer triangle */}
        <polygon
          points={`${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`}
          fill="#fff"
        />
      </svg>
      
      {/* Center display area */}
      <div className="absolute inset-0 pointer-events-none">
        {/* TEMPO label - positioned above center */}
        <span 
          className="absolute left-1/2 -translate-x-1/2 text-white uppercase"
          style={{ 
            top: '23px', // Scaled from 30px
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.12em',
          }}
        >
          TEMPO
        </span>
        
        {/* Segment display - dead center */}
        <div 
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ transform: 'translate(-50%, -50%) scale(1.15)' }}
        >
          <SegmentDisplay value={tempo.toString().padStart(3, '0')} size="small" />
        </div>
        
        {/* BPM label - positioned below center, equal distance */}
        <span 
          className="absolute left-1/2 -translate-x-1/2 text-white uppercase"
          style={{ 
            bottom: '23px', // Scaled from 30px
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.12em',
          }}
        >
          BPM
        </span>
        
        {/* TAP indicator - at the very bottom of dial */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full transition-all duration-100"
          style={{
            bottom: '8px', // Scaled from 10px
            width: '5px', // Scaled from 6px
            height: '5px',
            backgroundColor: isTapping ? '#fff' : '#333',
            boxShadow: isTapping ? '0 0 8px 3px rgba(255,255,255,0.9)' : 'none',
          }}
          title="Tap tempo [T]"
        />
      </div>
    </div>
  );
};

export default TempoDial;


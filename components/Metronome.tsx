import React, { useEffect, useRef, useState } from 'react';
import { TEMPO_MIN, TEMPO_MAX } from '../constants';

interface MetronomeProps {
  tempo: number;
  isEnabled: boolean;
  isPlaying: boolean;
  onToggle: () => void;
}

// Metronome dimensions - scaled to 100px height (131px width from SVG)
const WIDTH = 131; // Width from SVG
const HEIGHT = 100; // Height requirement

// Button configuration - button at bottom
const BUTTON_WIDTH = 31; // Required size
const BUTTON_HEIGHT = 17; // Required size
const BUTTON_Y = HEIGHT - BUTTON_HEIGHT; // Button at bottom: 100 - 17 = 83

// Arm configuration (14px gap between arm bottom and button top, scaled)
const PIVOT_X = WIDTH / 2; // Center X = 65.5
const PIVOT_Y = BUTTON_Y - 11; // Bottom of the arm = 83 - 11 = 72 (scaled from 14px gap)
const ARM_LENGTH = 69; // Scaled from 90: 90 * 0.76923 ≈ 69

// Weight configuration
const WEIGHT_RADIUS = 3; // Scaled from 4: 4 * 0.76923 ≈ 3

// Swing configuration
const MAX_SWING_ANGLE = 30; // Maximum swing angle in degrees

// Tick mark positions (angles in degrees, relative to vertical)
const TICK_MARKS = [
  { angle: -50, length: 8 },   // Far left
  { angle: -35, length: 10 },  // Left
  { angle: 0, length: 8 },     // Center (top)
  { angle: 35, length: 10 },   // Right  
  { angle: 50, length: 8 },    // Far right
];

const Metronome: React.FC<MetronomeProps> = ({ tempo, isEnabled, isPlaying, onToggle }) => {
  const [swingAngle, setSwingAngle] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Calculate weight position on arm based on tempo
  // Lower tempo = weight higher on arm (further from pivot)
  // Higher tempo = weight lower on arm (closer to pivot)
  const getWeightPosition = (bpm: number): number => {
    const normalizedTempo = (bpm - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN);
    // Invert: high tempo = low position (0.2), low tempo = high position (0.85)
    const position = 0.85 - normalizedTempo * 0.65;
    return position;
  };

  // Animation loop for the swinging arm
  useEffect(() => {
    if (!isEnabled || !isPlaying) {
      // Reset to center when not playing
      setSwingAngle(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTimeRef.current) / 1000; // in seconds
      const beatsPerSecond = tempo / 60;
      const swingFrequency = beatsPerSecond / 2; // Full swing (left to right to left) = 2 beats
      
      // Sine wave oscillation
      const angle = Math.sin(elapsed * swingFrequency * Math.PI * 2) * MAX_SWING_ANGLE;
      setSwingAngle(angle);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isEnabled, isPlaying, tempo]);

  // Calculate arm end point based on swing angle
  const angleRad = (swingAngle * Math.PI) / 180;
  const armEndX = PIVOT_X - Math.sin(angleRad) * ARM_LENGTH;
  const armEndY = PIVOT_Y - Math.cos(angleRad) * ARM_LENGTH;

  // Calculate weight position on the arm
  const weightPos = getWeightPosition(tempo);
  const weightX = PIVOT_X - Math.sin(angleRad) * (ARM_LENGTH * weightPos);
  const weightY = PIVOT_Y - Math.cos(angleRad) * (ARM_LENGTH * weightPos);

  // Generate tick marks
  const tickMarks = TICK_MARKS.map((tick, index) => {
    const tickAngleRad = (tick.angle * Math.PI) / 180;
    const tickStartRadius = ARM_LENGTH - 4; // Scaled from 5
    const tickLength = Math.round(tick.length * 0.76923); // Scale tick length
    const tickEndRadius = tickStartRadius + tickLength;
    
    const x1 = PIVOT_X - Math.sin(tickAngleRad) * tickStartRadius;
    const y1 = PIVOT_Y - Math.cos(tickAngleRad) * tickStartRadius;
    const x2 = PIVOT_X - Math.sin(tickAngleRad) * tickEndRadius;
    const y2 = PIVOT_Y - Math.cos(tickAngleRad) * tickEndRadius;

    return (
      <line
        key={`tick-${index}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  });

  return (
    <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Tick marks */}
        {tickMarks}

        {/* Swinging arm */}
        <line
          x1={PIVOT_X}
          y1={PIVOT_Y}
          x2={armEndX}
          y2={armEndY}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Weight circle */}
        <circle
          cx={weightX}
          cy={weightY}
          r={WEIGHT_RADIUS}
          fill="black"
          stroke="white"
          strokeWidth="1"
        />

        {/* METRO button box */}
        <rect
          x={PIVOT_X - BUTTON_WIDTH / 2}
          y={BUTTON_Y}
          width={BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          stroke="white"
          strokeWidth="2"
          fill={isEnabled ? 'white' : 'none'}
        />

        {/* METRO text */}
        <text
          x={PIVOT_X}
          y={BUTTON_Y + BUTTON_HEIGHT / 2 + 1}
          fill={isEnabled ? 'black' : 'white'}
          fontSize="10"
          fontFamily="'Barlow Condensed', sans-serif"
          fontWeight="500"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ userSelect: 'none' }}
        >
          METRO
        </text>
      </svg>

      {/* Clickable overlay for the button */}
      <button
        onClick={onToggle}
        className="absolute border-0 bg-transparent cursor-pointer"
        style={{
          left: PIVOT_X - BUTTON_WIDTH / 2,
          top: BUTTON_Y,
          width: BUTTON_WIDTH,
          height: BUTTON_HEIGHT,
        }}
        title="Toggle metronome [M]"
      />
    </div>
  );
};

export default Metronome;

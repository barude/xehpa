import React, { useState, useCallback } from 'react';
import Knob from './Knob';
import FilterToggle from './FilterToggle';
import MiniSegmentDisplay from './MiniSegmentDisplay';
import { PadConfig } from '../types';

interface EffectsPanelProps {
  pad: PadConfig | null;
  onPadChange: (updates: Partial<PadConfig>) => void;
}

// Positions extracted from Figma SVG (converted to panel coordinates)
// Panel origin is at frame position (400, 535), size 488x247
// Knob centers and label positions from SVG
// Label offsets are calculated from knob center to label center
const KNOB_CONFIG = {
  // Large knobs (74px diameter, radius 37)
  pitch: { 
    cx: 80, cy: 38,
    labelOffset: { x: -47, y: -34 },  // upper-left
  },
  filter: { 
    cx: 244, cy: 61,
    labelOffset: { x: 0, y: -57 },  // directly above
  },
  gain: { 
    cx: 408, cy: 38,
    labelOffset: { x: 47, y: -34 },  // upper-right
  },
  
  // Small knobs (43px diameter, radius 21.5)
  reverb: { 
    cx: 22, cy: 97,
    labelOffset: { x: 46, y: 15 },  // lower-right
  },
  atk: { 
    cx: 170, cy: 97,
    labelOffset: { x: -12, y: -35 },  // above-left
  },
  sus: { 
    cx: 319, cy: 97,
    labelOffset: { x: 12, y: -35 },  // above-right
  },
  pan: { 
    cx: 467, cy: 97,
    labelOffset: { x: -38, y: 15 },  // lower-left
  },
  dec: { 
    cx: 127, cy: 147,
    labelOffset: { x: -12, y: 36 },  // below-left
  },
  rel: { 
    cx: 362, cy: 147,
    labelOffset: { x: 12, y: 36 },  // below-right
  },
  
  // Medium knobs (58px diameter, radius 29)
  env: { 
    cx: 200, cy: 175,
    labelOffset: { x: -20, y: 42 },  // below-left
  },
  res: { 
    cx: 288, cy: 175,
    labelOffset: { x: 20, y: 42 },  // below-right
  },
  
  // Filter toggle (30px diameter, radius 15)
  filterType: { cx: 244, cy: 126 },  // SVG: cx=644.004, cy=661.004
  
  // Segment display (41x14)
  display: { x: 224, y: 232 },  // SVG: x=624, y=767
};

const SIZES = {
  large: { diameter: 74, radius: 37 },
  medium: { diameter: 58, radius: 29 },
  small: { diameter: 43, radius: 21.5 },
  toggle: { diameter: 30, radius: 15 },
};

const EffectsPanel: React.FC<EffectsPanelProps> = ({ pad, onPadChange }) => {
  const [displayValue, setDisplayValue] = useState<string>('0.00');

  const handleHover = useCallback((knobId: string, isHovered: boolean, value: number | string | null) => {
    if (isHovered && value !== null) {
      if (typeof value === 'string') {
        // Ensure string values are exactly 4 characters (pad right for labels like "LOW")
        const padded = value.padEnd(4, ' ').slice(0, 4);
        setDisplayValue(padded);
      } else {
        const formatted = formatKnobValue(knobId, value);
        setDisplayValue(formatted);
      }
    } else {
      // Clear display when not hovering
      setDisplayValue('0.00');
    }
  }, []);

  const formatKnobValue = (knobId: string, value: number): string => {
    // All values must be exactly 4 characters for the display
    switch (knobId) {
      case 'pitch':
        // Format: " 12" or "-12" or "  0"
        const pitchVal = Math.round(value);
        if (pitchVal === 0) return '  0 ';
        const pitchStr = (pitchVal < 0 ? '-' : '') + Math.abs(pitchVal).toString().padStart(2, '0');
        return pitchStr.padStart(4, ' ');
      case 'filter':
        // Format: "20k" or "1.5k" or " 900"
        // Clamp value to valid range first
        const filterVal = Math.max(20, Math.min(20000, Math.round(value)));
        if (filterVal >= 10000) {
          const kVal = Math.round(filterVal / 1000);
          return (kVal.toString() + 'k').padStart(4, ' ');
        }
        if (filterVal >= 1000) {
          const kVal = (filterVal / 1000).toFixed(1);
          // Remove trailing zero if not needed (e.g., "1.0k" -> "1k" but we need 4 chars, so keep it)
          return (kVal + 'k').padStart(4, ' ');
        }
        return filterVal.toString().padStart(4, ' ');
      case 'gain':
        // Format: "150%" or "  0%"
        const gainPercent = Math.round(value * 100);
        return (gainPercent.toString() + '%').padStart(4, ' ');
      case 'reverb':
        // Format: "100%" or " 50%" or "  0%"
        const reverbPercent = Math.round(value * 100);
        return (reverbPercent.toString() + '%').padStart(4, ' ');
      case 'pan':
        // Format: " 1.0" or "-1.0" or " 0.0"
        const panRounded = parseFloat(value.toFixed(1));
        if (panRounded === 0) return ' 0.0';
        const panVal = Math.abs(panRounded).toFixed(1);
        return ((panRounded < 0 ? '-' : '') + panVal).padStart(4, ' ');
      case 'atk':
      case 'dec':
      case 'rel':
        // Format: "2.00" or "0.05"
        return value.toFixed(2).padStart(4, ' ');
      case 'sus':
        // Format: "100%" or " 50%"
        const susPercent = Math.round(value * 100);
        return (susPercent.toString() + '%').padStart(4, ' ');
      case 'env':
        // Format: " 1.0" or "-1.0" or " 0.0"
        const envRounded = parseFloat(value.toFixed(1));
        if (envRounded === 0) return ' 0.0';
        const envVal = Math.abs(envRounded).toFixed(1);
        return ((envRounded < 0 ? '-' : '') + envVal).padStart(4, ' ');
      case 'res':
        // Format: "15.0" or " 0.0"
        return value.toFixed(1).padStart(4, ' ');
      case 'filterType':
        // Format: "LP  " or "HP  " or "BP  "
        if (typeof value === 'string') {
          return value.toUpperCase().padEnd(4, ' ');
        }
        return '    ';
      default:
        return value.toFixed(2).padStart(4, ' ');
    }
  };

  // Helper to get top-left position from center
  const getPosition = (cx: number, cy: number, radius: number) => ({
    left: cx - radius,
    top: cy - radius,
  });

  // Use default values when pad is null (effects won't work without sound anyway)
  const defaultPad: PadConfig = {
    id: 0,
    sampleId: null,
    keyCode: '',
    keyLabel: '',
    start: 0,
    end: 0.001,
    playMode: 'POLY',
    tune: 0,
    fineTune: 0,
    isReversed: false,
    volume: 1,
    pan: 0,
    attack: 0,
    decay: 0,
    sustain: 1,
    release: 0.1,
    filterType: 'lowpass',
    cutoff: 20000,
    resonance: 0,
    filterEnv: 0,
    reverbSend: 0,
  };

  const activePad = pad || defaultPad;

  const largeR = SIZES.large.radius;
  const mediumR = SIZES.medium.radius;
  const smallR = SIZES.small.radius;
  const toggleR = SIZES.toggle.radius;

  return (
    <div 
      className="relative"
      style={{ 
        width: '488px', 
        height: '247px',
      }}
    >
      {/* PITCH - Large knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.pitch.cx, KNOB_CONFIG.pitch.cy, largeR)}
      >
        <Knob
          value={activePad.tune}
          min={-12}
          max={12}
          step={1}
          size="large"
          label="PITCH"
          labelOffset={KNOB_CONFIG.pitch.labelOffset}
          onChange={(v) => onPadChange({ tune: v })}
          onHover={(h, v) => handleHover('pitch', h, v)}
        />
      </div>

      {/* FILTER - Large knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.filter.cx, KNOB_CONFIG.filter.cy, largeR)}
      >
        <Knob
          value={activePad.cutoff}
          min={20}
          max={20000}
          step={10}
          size="large"
          label="FILTER"
          labelOffset={KNOB_CONFIG.filter.labelOffset}
          onChange={(v) => onPadChange({ cutoff: v })}
          onHover={(h, v) => handleHover('filter', h, v)}
        />
      </div>

      {/* GAIN - Large knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.gain.cx, KNOB_CONFIG.gain.cy, largeR)}
      >
        <Knob
          value={activePad.volume}
          min={0}
          max={1.5}
          step={0.01}
          size="large"
          label="GAIN"
          labelOffset={KNOB_CONFIG.gain.labelOffset}
          onChange={(v) => onPadChange({ volume: v })}
          onHover={(h, v) => handleHover('gain', h, v)}
        />
      </div>

      {/* REVERB - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.reverb.cx, KNOB_CONFIG.reverb.cy, smallR)}
      >
        <Knob
          value={activePad.reverbSend}
          min={0}
          max={1}
          step={0.01}
          size="small"
          label="REVERB"
          labelOffset={KNOB_CONFIG.reverb.labelOffset}
          onChange={(v) => onPadChange({ reverbSend: v })}
          onHover={(h, v) => handleHover('reverb', h, v)}
        />
      </div>

      {/* ATK - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.atk.cx, KNOB_CONFIG.atk.cy, smallR)}
      >
        <Knob
          value={activePad.attack}
          min={0}
          max={2}
          step={0.01}
          size="small"
          label="ATK"
          labelOffset={KNOB_CONFIG.atk.labelOffset}
          onChange={(v) => onPadChange({ attack: v })}
          onHover={(h, v) => handleHover('atk', h, v)}
        />
      </div>

      {/* SUS - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.sus.cx, KNOB_CONFIG.sus.cy, smallR)}
      >
        <Knob
          value={activePad.sustain ?? 1}
          min={0}
          max={1}
          step={0.01}
          size="small"
          label="SUS"
          labelOffset={KNOB_CONFIG.sus.labelOffset}
          onChange={(v) => onPadChange({ sustain: v })}
          onHover={(h, v) => handleHover('sus', h, v)}
        />
      </div>

      {/* PAN - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.pan.cx, KNOB_CONFIG.pan.cy, smallR)}
      >
        <Knob
          value={activePad.pan}
          min={-1}
          max={1}
          step={0.1}
          size="small"
          label="PAN"
          labelOffset={KNOB_CONFIG.pan.labelOffset}
          onChange={(v) => onPadChange({ pan: v })}
          onHover={(h, v) => handleHover('pan', h, v)}
        />
      </div>

      {/* DEC - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.dec.cx, KNOB_CONFIG.dec.cy, smallR)}
      >
        <Knob
          value={activePad.decay ?? 0}
          min={0}
          max={2}
          step={0.01}
          size="small"
          label="DEC"
          labelOffset={KNOB_CONFIG.dec.labelOffset}
          onChange={(v) => onPadChange({ decay: v })}
          onHover={(h, v) => handleHover('dec', h, v)}
        />
      </div>

      {/* REL - Small knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.rel.cx, KNOB_CONFIG.rel.cy, smallR)}
      >
        <Knob
          value={activePad.release}
          min={0.005}
          max={2}
          step={0.01}
          size="small"
          label="REL"
          labelOffset={KNOB_CONFIG.rel.labelOffset}
          onChange={(v) => onPadChange({ release: v })}
          onHover={(h, v) => handleHover('rel', h, v)}
        />
      </div>

      {/* ENV - Medium knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.env.cx, KNOB_CONFIG.env.cy, mediumR)}
      >
        <Knob
          value={activePad.filterEnv ?? 0}
          min={-1}
          max={1}
          step={0.01}
          size="medium"
          label="ENV"
          labelOffset={KNOB_CONFIG.env.labelOffset}
          onChange={(v) => onPadChange({ filterEnv: v })}
          onHover={(h, v) => handleHover('env', h, v)}
        />
      </div>

      {/* RES - Medium knob */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.res.cx, KNOB_CONFIG.res.cy, mediumR)}
      >
        <Knob
          value={activePad.resonance}
          min={0}
          max={15}
          step={0.1}
          size="medium"
          label="RES"
          labelOffset={KNOB_CONFIG.res.labelOffset}
          onChange={(v) => onPadChange({ resonance: v })}
          onHover={(h, v) => handleHover('res', h, v)}
        />
      </div>

      {/* Filter Type Toggle - Text inside */}
      <div 
        className="absolute"
        style={getPosition(KNOB_CONFIG.filterType.cx, KNOB_CONFIG.filterType.cy, toggleR)}
      >
        <FilterToggle
          value={activePad.filterType ?? 'lowpass'}
          onChange={(v) => onPadChange({ filterType: v })}
          onHover={(h, label) => handleHover('filterType', h, label)}
        />
      </div>

      {/* Segment Display */}
      <div 
        className="absolute"
        style={{ 
          left: KNOB_CONFIG.display.x,
          top: KNOB_CONFIG.display.y,
        }}
      >
        <MiniSegmentDisplay value={displayValue} />
      </div>
    </div>
  );
};

export default EffectsPanel;

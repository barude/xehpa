import React, { useCallback } from 'react';
import { useHint } from './HintDisplay';

type FilterType = 'lowpass' | 'highpass' | 'bandpass';

interface FilterToggleProps {
  value: FilterType;
  onChange: (value: FilterType) => void;
  onHover?: (isHovered: boolean, label: string | null) => void;
}

const FILTER_CYCLE: FilterType[] = ['lowpass', 'highpass', 'bandpass'];
const FILTER_LABELS: Record<FilterType, string> = {
  lowpass: 'LP',
  highpass: 'HP',
  bandpass: 'BP',
};
const FILTER_DISPLAY_LABELS: Record<FilterType, string> = {
  lowpass: 'LOW',
  highpass: 'HIGH',
  bandpass: 'BAND',
};

const FilterToggle: React.FC<FilterToggleProps> = ({ value, onChange, onHover }) => {
  const { setHint } = useHint();
  const diameter = 30;
  const strokeWidth = 2;
  const center = diameter / 2;

  const handleClick = useCallback(() => {
    const currentIdx = FILTER_CYCLE.indexOf(value);
    const nextIdx = (currentIdx + 1) % FILTER_CYCLE.length;
    onChange(FILTER_CYCLE[nextIdx]);
    onHover?.(true, FILTER_DISPLAY_LABELS[FILTER_CYCLE[nextIdx]]);
  }, [value, onChange, onHover]);

  const handleMouseEnter = useCallback(() => {
    setHint('FILTER TYPE · TOGGLE');
    onHover?.(true, FILTER_DISPLAY_LABELS[value]);
  }, [onHover, value, setHint]);

  const handleMouseLeave = useCallback(() => {
    setHint(null);
    onHover?.(false, null);
  }, [onHover, setHint]);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative cursor-pointer select-none"
      style={{ width: diameter, height: diameter }}
    >
      <svg width={diameter} height={diameter}>
        {/* Outer circle */}
        <circle
          cx={center}
          cy={center}
          r={center - strokeWidth}
          fill="transparent"
          stroke="#FFFFFF"
          strokeWidth={strokeWidth}
        />
        {/* Text inside the circle */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#FFFFFF"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            fontWeight: 500,
            textTransform: 'uppercase',
          }}
        >
          {FILTER_LABELS[value]}
        </text>
      </svg>
    </div>
  );
};

export default FilterToggle;

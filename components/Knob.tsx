import React, { useRef, useCallback, useEffect, useState } from 'react';

export type KnobSize = 'large' | 'medium' | 'small';
export type LabelPosition = 'above' | 'below' | 'left' | 'right' | 'above-left' | 'above-right';

interface LabelOffset {
  x: number;  // offset from knob center
  y: number;  // offset from knob center
}

interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  size: KnobSize;
  label: string;
  labelPosition?: LabelPosition;
  labelOffset?: LabelOffset;  // Custom offset overrides labelPosition
  showLabel?: boolean;
  onChange: (value: number) => void;
  onHover?: (isHovered: boolean, value: number | null) => void;
}

const SIZE_CONFIG = {
  large: { diameter: 74, indicatorLength: 22, strokeWidth: 2 },
  medium: { diameter: 58, indicatorLength: 17, strokeWidth: 2 },
  small: { diameter: 43, indicatorLength: 13, strokeWidth: 2 },
};

const Knob: React.FC<KnobProps> = ({
  value,
  min,
  max,
  step = 1,
  size,
  label,
  labelPosition = 'below',
  labelOffset,
  showLabel = true,
  onChange,
  onHover,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  const config = SIZE_CONFIG[size];
  const { diameter, indicatorLength, strokeWidth } = config;

  // Map value to rotation angle (from -135deg to +135deg, 270deg total range)
  const normalizedValue = (value - min) / (max - min);
  const rotation = -135 + normalizedValue * 270;

  const clampValue = useCallback(
    (val: number) => {
      const clamped = Math.min(max, Math.max(min, val));
      // Round to the nearest step, handling decimal steps properly
      const steps = Math.round(clamped / step);
      const result = steps * step;
      // Round to appropriate decimal places to avoid floating point errors
      const decimals = step.toString().split('.')[1]?.length || 0;
      return parseFloat(result.toFixed(decimals));
    },
    [min, max, step]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartValue.current = value;
      document.body.style.cursor = 'ns-resize';
    },
    [value]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Only process if THIS knob is being dragged
      if (!isDragging.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const deltaY = dragStartY.current - e.clientY;
      const range = max - min;
      const sensitivity = range / 200;
      const newValue = clampValue(dragStartValue.current + deltaY * sensitivity);
      
      if (Math.abs(newValue - dragStartValue.current) > step / 2) {
        dragStartValue.current = newValue;
        dragStartY.current = e.clientY;
        onChange(newValue);
        onHover?.(true, newValue);
      }
    },
    [max, min, step, clampValue, onChange, onHover]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      // Only process if THIS knob was being dragged
      if (!isDragging.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDragging.current = false;
      document.body.style.cursor = '';
      // Clear hover state when dragging stops
      onHover?.(false, null);
    },
    [onHover]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -step : step;
      const newValue = clampValue(value + delta);
      if (Math.abs(newValue - value) > step / 2) {
        onChange(newValue);
        onHover?.(true, newValue);
      }
    },
    [value, step, clampValue, onChange, onHover]
  );

  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const element = knobRef.current;
    if (!element) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -step : step;
      const newValue = clampValue(value + delta);
      if (Math.abs(newValue - value) > step / 2) {
        onChange(newValue);
        onHover?.(true, newValue);
      }
    };
    
    element.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheelHandler);
    };
  }, [value, step, clampValue, onChange, onHover]);

  const handleMouseEnter = useCallback(() => {
    if (!isDragging.current) {
      onHover?.(true, value);
    }
  }, [onHover, value]);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging.current) {
      onHover?.(false, null);
    }
  }, [onHover]);

  useEffect(() => {
    // Use capture phase and non-passive to ensure we can preventDefault
    const options = { capture: true, passive: false };
    document.addEventListener('mousemove', handleMouseMove, options);
    document.addEventListener('mouseup', handleMouseUp, options);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, options);
      document.removeEventListener('mouseup', handleMouseUp, options);
    };
  }, [handleMouseMove, handleMouseUp]);

  const center = diameter / 2;
  
  // Calculate the indicator line end point based on rotation
  const angleRad = (rotation * Math.PI) / 180;
  const lineEndX = center + Math.sin(angleRad) * indicatorLength;
  const lineEndY = center - Math.cos(angleRad) * indicatorLength;

  // Label styling based on position
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: '13px',
    lineHeight: '16px',
    fontWeight: 500,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    position: 'absolute',
    whiteSpace: 'nowrap',
  };

  // Position the label relative to the knob
  const getLabelPositionStyle = (): React.CSSProperties => {
    // If custom labelOffset is provided, use absolute positioning from knob center
    if (labelOffset) {
      return {
        left: `${center + labelOffset.x}px`,
        top: `${center + labelOffset.y}px`,
        transform: 'translate(-50%, -50%)',
      };
    }
    
    switch (labelPosition) {
      case 'above':
        return { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '4px' };
      case 'below':
        return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '4px' };
      case 'left':
        return { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px', textAlign: 'right' };
      case 'right':
        return { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' };
      case 'above-left':
        return { bottom: '100%', right: '0', marginBottom: '4px', textAlign: 'right' };
      case 'above-right':
        return { bottom: '100%', left: '0', marginBottom: '4px' };
      default:
        return { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '4px' };
    }
  };

  return (
    <div
      className="relative select-none"
      style={{ width: diameter, height: diameter }}
    >
      <div
        ref={knobRef}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-ns-resize"
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
          {/* Indicator line - from center outward */}
          <line
            x1={center}
            y1={center}
            x2={lineEndX}
            y2={lineEndY}
            stroke="#FFFFFF"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {showLabel && (
        <span
          style={{
            ...labelStyle,
            ...getLabelPositionStyle(),
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default Knob;

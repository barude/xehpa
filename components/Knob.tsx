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
  const dragStartValue = useRef(0);
  const accumulatedDelta = useRef(0);
  const lastClientY = useRef<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);
  
  // Visual state is active when hovered OR being interacted with
  const showActiveState = isHovered || isActive;

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
    async (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      setIsActive(true);
      dragStartValue.current = value;
      accumulatedDelta.current = 0;
      lastClientY.current = e.clientY;
      
      // Request pointer lock for infinite drag behavior
      const element = knobRef.current;
      if (element) {
        try {
          await element.requestPointerLock();
        } catch (err) {
          // Pointer lock may fail in some browsers or contexts
          console.warn('Pointer lock failed:', err);
        }
      }
      
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
      
      // Use movementY for relative movement (works with pointer lock)
      // Fall back to clientY delta if pointer lock is not available
      let deltaY: number;
      if (e.movementY !== undefined && document.pointerLockElement) {
        // Pointer lock is active - use relative movement
        deltaY = -e.movementY;
      } else {
        // Fallback: calculate delta from clientY position
        if (lastClientY.current !== null) {
          deltaY = lastClientY.current - e.clientY;
          lastClientY.current = e.clientY;
        } else {
          deltaY = 0;
          lastClientY.current = e.clientY;
        }
      }
      
      // Accumulate delta for smooth continuous adjustment
      accumulatedDelta.current += deltaY;
      
      const range = max - min;
      const sensitivity = range / 200;
      const newValue = clampValue(dragStartValue.current + accumulatedDelta.current * sensitivity);
      
      // Update value if it has changed significantly
      if (Math.abs(newValue - value) >= step / 2) {
        onChange(newValue);
        onHover?.(true, newValue);
      }
    },
    [max, min, step, clampValue, onChange, onHover, value]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      // Only process if THIS knob was being dragged
      if (!isDragging.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDragging.current = false;
      setIsActive(false);
      lastClientY.current = null;
      
      // Exit pointer lock
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      
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
      // Use range-based sensitivity similar to drag sensitivity for consistency
      // For small ranges, ensure we use at least the step size for responsiveness
      // For large ranges, scale proportionally for smooth scrolling
      const range = max - min;
      const rangeBasedSensitivity = range / 50; // More sensitive than drag (50 vs 200)
      const scrollSensitivity = Math.max(step, rangeBasedSensitivity);
      const scrollDelta = e.deltaY > 0 ? -scrollSensitivity : scrollSensitivity;
      const newValue = clampValue(value + scrollDelta);
      // Only update if change is significant enough (at least half a step)
      if (Math.abs(newValue - value) >= step / 2) {
        onChange(newValue);
        onHover?.(true, newValue);
      }
    },
    [value, min, max, step, clampValue, onChange, onHover]
  );

  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const element = knobRef.current;
    if (!element) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Use range-based sensitivity similar to drag sensitivity for consistency
      // For small ranges, ensure we use at least the step size for responsiveness
      // For large ranges, scale proportionally for smooth scrolling
      const range = max - min;
      const rangeBasedSensitivity = range / 50; // More sensitive than drag (50 vs 200)
      const scrollSensitivity = Math.max(step, rangeBasedSensitivity);
      const scrollDelta = e.deltaY > 0 ? -scrollSensitivity : scrollSensitivity;
      const newValue = clampValue(value + scrollDelta);
      // Only update if change is significant enough (at least half a step)
      if (Math.abs(newValue - value) >= step / 2) {
        onChange(newValue);
        onHover?.(true, newValue);
      }
    };
    
    element.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheelHandler);
    };
  }, [value, min, max, step, clampValue, onChange, onHover]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (!isDragging.current) {
      onHover?.(true, value);
    }
  }, [onHover, value]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (!isDragging.current) {
      onHover?.(false, null);
    }
  }, [onHover]);

  useEffect(() => {
    // Use capture phase and non-passive to ensure we can preventDefault
    const options = { capture: true, passive: false };
    document.addEventListener('mousemove', handleMouseMove, options);
    document.addEventListener('mouseup', handleMouseUp, options);
    
    // Handle pointer lock change events
    const handlePointerLockChange = () => {
      // If pointer lock was released (e.g., ESC key), stop dragging
      if (!document.pointerLockElement && isDragging.current) {
        isDragging.current = false;
        setIsActive(false);
        lastClientY.current = null;
        document.body.style.cursor = '';
        onHover?.(false, null);
      }
    };
    
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove, options);
      document.removeEventListener('mouseup', handleMouseUp, options);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [handleMouseMove, handleMouseUp, onHover]);

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
    color: 'var(--color-text)',
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
        onWheel={handleWheel}
        className="cursor-ns-resize"
        style={{ width: diameter, height: diameter }}
      >
        <svg width={diameter} height={diameter}>
          {/* Outer circle */}
          <circle
            cx={center}
            cy={center}
            r={center - strokeWidth}
            fill={showActiveState ? 'var(--color-active-bg)' : 'transparent'}
            stroke="var(--color-outline)"
            strokeWidth={strokeWidth}
            style={{ transition: 'fill 0.1s ease' }}
          />
          {/* Indicator line - from center outward */}
          <line
            x1={center}
            y1={center}
            x2={lineEndX}
            y2={lineEndY}
            stroke={showActiveState ? 'var(--color-active-fg)' : 'var(--color-outline)'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: 'stroke 0.1s ease' }}
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

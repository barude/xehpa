import React, { useState, useCallback } from 'react';
import { useHint } from './HintDisplay';
import { Theme } from '../App';

interface ThemeToggleButtonProps {
  theme: Theme;
  onThemeToggle: () => void;
}

// Component dimensions
const BUTTON_SIZE = 29;

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  theme,
  onThemeToggle,
}) => {
  const { setHint } = useHint();
  const [isHovered, setIsHovered] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);

  const handleClick = useCallback(() => {
    onThemeToggle();
    // Flash to default state (transparent bg, white text)
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
    }, 150);
  }, [onThemeToggle]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setHint('THEME: TOGGLE [CMD+I]');
  }, [setHint]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setHint(null);
  }, [setHint]);

  // THEME button colors (default is active bg/active fg, flash to transparent bg/foreground text)
  const backgroundColor = isFlashing
    ? 'transparent'
    : (isHovered ? 'var(--color-hover-bg)' : 'var(--color-active-bg)');
  
  const textColor = isFlashing
    ? 'var(--color-text)'
    : (isHovered ? 'var(--color-hover-fg)' : 'var(--color-active-fg)');

  const borderColor = isFlashing ? '1px solid var(--color-border)' : 'none';

  return (
    <div className="flex flex-col items-center" style={{ width: BUTTON_SIZE }}>
      {/* THEME Label */}
      <span
        className="uppercase text-center"
        style={{
          color: 'var(--color-text)',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '10px',
          lineHeight: '12px',
          fontWeight: 500,
        }}
      >
        THEME
      </span>
      
      {/* THEME Toggle Button - 6px below label */}
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor,
          border: borderColor,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            lineHeight: '12px',
            fontWeight: 500,
            color: textColor,
            textAlign: 'center',
          }}
        >
          {theme.slice(0, 3).toUpperCase()}
        </span>
      </button>
    </div>
  );
};

export default ThemeToggleButton;

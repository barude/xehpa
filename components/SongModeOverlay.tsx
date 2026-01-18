import React, { useState, useCallback, useRef } from 'react';
import { useHint } from './HintDisplay';

interface SongModeOverlayProps {
  isSongMode: boolean;
  onToggle: () => void;
}

// Component dimensions
const BUTTON_SIZE = 29;

const SongModeOverlay: React.FC<SongModeOverlayProps> = ({
  isSongMode,
  onToggle,
}) => {
  const { setHint } = useHint();
  const [isHovered, setIsHovered] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const flashingToStateRef = useRef<boolean | null>(null);

  const handleClick = useCallback(() => {
    // Remember the state BEFORE toggle (this is what we'll flash to)
    const stateBeforeToggle = isSongMode;
    flashingToStateRef.current = stateBeforeToggle;
    onToggle();
    // Flash to the state before toggle
    setIsFlashing(true);
    setTimeout(() => {
      setIsFlashing(false);
      flashingToStateRef.current = null;
    }, 150);
  }, [isSongMode, onToggle]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setHint('SONG MODE: TOGGLE');
  }, [setHint]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setHint(null);
  }, [setHint]);

  // Determine colors based on state
  // When flashing: always show transparent bg/white text (inactive visual state)
  // This provides consistent visual feedback regardless of hover or active state
  // When not flashing and hovered: white bg, black text
  // When not flashing and not hovered: default state based on isSongMode
  const backgroundColor = isFlashing 
    ? 'transparent'
    : (isHovered ? 'white' : (isSongMode ? 'white' : 'transparent'));
  
  const textColor = isFlashing
    ? 'white'
    : (isHovered ? 'black' : (isSongMode ? 'black' : 'white'));

  const borderColor = 'white'; // Always white

  return (
    <div className="flex flex-col items-center" style={{ width: BUTTON_SIZE }}>
      {/* SONG Label */}
      <span
        className="text-white uppercase text-center"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '10px',
          lineHeight: '12px',
          fontWeight: 500,
        }}
      >
        SONG
      </span>
      
      {/* SONG Toggle Button - 6px below label */}
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
          border: `1px solid ${borderColor}`,
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
          {isSongMode ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
};

export default SongModeOverlay;


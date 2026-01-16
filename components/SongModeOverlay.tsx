import React from 'react';

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
        onClick={onToggle}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: isSongMode ? 'white' : 'transparent',
          border: '1px solid white',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            lineHeight: '12px',
            fontWeight: 500,
            color: isSongMode ? 'black' : 'white',
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


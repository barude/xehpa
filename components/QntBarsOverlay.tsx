import React, { useState, useCallback, useRef } from 'react';
import { QuantizeMode } from '../constants';
import { useHint } from './HintDisplay';

interface QntBarsOverlayProps {
  quantizeMode: QuantizeMode;
  onQuantizeModeChange: () => void;
  bars: number;
  onBarsChange: () => void;
}

// Component dimensions
const BUTTON_SIZE = 29;

const QntBarsOverlay: React.FC<QntBarsOverlayProps> = ({
  quantizeMode,
  onQuantizeModeChange,
  bars,
  onBarsChange,
}) => {
  const { setHint } = useHint();
  const isQuantizeActive = quantizeMode !== 'none';
  const [isQntHovered, setIsQntHovered] = useState(false);
  const [isQntFlashing, setIsQntFlashing] = useState(false);
  const [isBarsHovered, setIsBarsHovered] = useState(false);
  const [isBarsFlashing, setIsBarsFlashing] = useState(false);
  const flashingToQntStateRef = useRef<boolean | null>(null);

  const handleQntClick = useCallback(() => {
    // Remember the state BEFORE toggle (this is what we'll flash to)
    // We need to capture the actual quantizeMode value, not just active/inactive
    const modeBeforeToggle = quantizeMode;
    const wasActiveBeforeToggle = modeBeforeToggle !== 'none';
    flashingToQntStateRef.current = wasActiveBeforeToggle;
    onQuantizeModeChange();
    // Flash to the non-hovered default state of the old value
    setIsQntFlashing(true);
    setTimeout(() => {
      setIsQntFlashing(false);
      flashingToQntStateRef.current = null;
    }, 150);
  }, [quantizeMode, onQuantizeModeChange]);

  const handleBarsClick = useCallback(() => {
    onBarsChange();
    // Flash to default state (transparent bg, white text)
    setIsBarsFlashing(true);
    setTimeout(() => {
      setIsBarsFlashing(false);
    }, 150);
  }, [onBarsChange]);

  // QNT button colors
  // When flashing: always show transparent bg/white text (inactive visual state)
  // This provides consistent visual feedback regardless of hover or active state
  const qntBackgroundColor = isQntFlashing 
    ? 'transparent'
    : (isQntHovered ? 'white' : (isQuantizeActive ? 'white' : 'transparent'));
  
  const qntTextColor = isQntFlashing
    ? 'white'
    : (isQntHovered ? 'black' : (isQuantizeActive ? 'black' : 'white'));

  // BARS button colors (default is white bg/black text, flash to transparent bg/white text)
  const barsBackgroundColor = isBarsFlashing
    ? 'transparent'
    : (isBarsHovered ? 'white' : 'white');
  
  const barsTextColor = isBarsFlashing
    ? 'white'
    : (isBarsHovered ? 'black' : 'black');

  const barsBorderColor = isBarsFlashing ? '1px solid white' : 'none';

  return (
    <div className="flex flex-col items-center" style={{ width: BUTTON_SIZE }}>
      {/* QNT Section */}
      <span
        className="text-white uppercase text-center"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '10px',
          lineHeight: '12px',
          fontWeight: 500,
        }}
      >
        QNT
      </span>
      
      {/* QNT Toggle Button - 6px below label */}
      <button
        onClick={handleQntClick}
        onMouseEnter={() => {
          setIsQntHovered(true);
          setHint('QUANTIZE: TOGGLE');
        }}
        onMouseLeave={() => {
          setIsQntHovered(false);
          setHint(null);
        }}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: qntBackgroundColor,
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
            color: qntTextColor,
            textAlign: 'center',
          }}
        >
          {quantizeMode === 'none' ? 'OFF' : quantizeMode}
        </span>
      </button>

      {/* BARS Label - 12px below QNT button */}
      <span
        className="text-white uppercase text-center"
        style={{
          marginTop: '12px',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: '10px',
          lineHeight: '12px',
          fontWeight: 500,
        }}
      >
        BARS
      </span>

      {/* BARS Toggle Button - 6px below label */}
      <button
        onClick={handleBarsClick}
        onMouseEnter={() => {
          setIsBarsHovered(true);
          setHint('PATTERN BARS: ADJUST LENGTH');
        }}
        onMouseLeave={() => {
          setIsBarsHovered(false);
          setHint(null);
        }}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: barsBackgroundColor,
          border: barsBorderColor,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            lineHeight: '12px',
            fontWeight: 500,
            color: barsTextColor,
            textAlign: 'center',
          }}
        >
          {bars}
        </span>
      </button>
    </div>
  );
};

export default QntBarsOverlay;


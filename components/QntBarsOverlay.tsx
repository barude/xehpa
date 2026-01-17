import React from 'react';
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
        onClick={onQuantizeModeChange}
        onMouseEnter={() => setHint('QUANTIZE: TOGGLE')}
        onMouseLeave={() => setHint(null)}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: isQuantizeActive ? 'white' : 'transparent',
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
            color: isQuantizeActive ? 'black' : 'white',
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

      {/* BARS Toggle Button - 6px below label, always solid white */}
      <button
        onClick={onBarsChange}
        onMouseEnter={() => setHint('PATTERN BARS: ADJUST LENGTH')}
        onMouseLeave={() => setHint(null)}
        className="circular-button flex items-center justify-center transition-none"
        style={{
          marginTop: '6px',
          width: `${BUTTON_SIZE}px`,
          height: `${BUTTON_SIZE}px`,
          minWidth: `${BUTTON_SIZE}px`,
          minHeight: `${BUTTON_SIZE}px`,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: 'white',
          border: 'none',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '10px',
            lineHeight: '12px',
            fontWeight: 500,
            color: 'black',
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


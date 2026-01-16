import React from 'react';

interface SegmentDisplayProps {
  value: string;
  size?: 'large' | 'small';
}

/**
 * A classic 7-segment display logic with bold styling.
 */
const SegmentCell: React.FC<{ char: string; size: 'large' | 'small' }> = ({ char, size }) => {
  const isLarge = size === 'large';
  const width = isLarge ? 28 : 12;
  const height = isLarge ? 42 : 18;
  
  const getActiveSegments = (c: string) => {
    const segments: number[] = [];
    if (c === ':') return [18, 19];
    if (c === '.') return [37];
    
    const n = parseInt(c);
    if (isNaN(n)) return [];

    // Standard 7-segment indices: 
    // 0: top, 1: top-right, 2: bottom-right, 3: bottom, 4: bottom-left, 5: top-left, 6: middle
    const map: Record<number, number[]> = {
      0: [0, 1, 2, 3, 4, 5],
      1: [1, 2],
      2: [0, 1, 6, 4, 3],
      3: [0, 1, 6, 2, 3],
      4: [5, 6, 1, 2],
      5: [0, 5, 6, 2, 3],
      6: [0, 5, 4, 3, 2, 6],
      7: [0, 1, 2],
      8: [0, 1, 2, 3, 4, 5, 6],
      9: [0, 1, 2, 3, 5, 6]
    };

    return map[n] || [];
  };

  const active = getActiveSegments(char);
  const sThickness = 12; // Bolder segments

  return (
    <svg width={width} height={height} viewBox="0 0 100 150" className="inline-block mx-[1px]">
      {/* 0: Top */}
      <rect x="15" y="5" width="70" height={sThickness} rx="2" className={active.includes(0) ? 'segment-active' : 'segment-inactive'} />
      {/* 1: Top-Right */}
      <rect x="83" y="12" width={sThickness} height="58" rx="2" className={active.includes(1) ? 'segment-active' : 'segment-inactive'} />
      {/* 2: Bottom-Right */}
      <rect x="83" y="80" width={sThickness} height="58" rx="2" className={active.includes(2) ? 'segment-active' : 'segment-inactive'} />
      {/* 3: Bottom */}
      <rect x="15" y="133" width="70" height={sThickness} rx="2" className={active.includes(3) ? 'segment-active' : 'segment-inactive'} />
      {/* 4: Bottom-Left */}
      <rect x="5" y="80" width={sThickness} height="58" rx="2" className={active.includes(4) ? 'segment-active' : 'segment-inactive'} />
      {/* 5: Top-Left */}
      <rect x="5" y="12" width={sThickness} height="58" rx="2" className={active.includes(5) ? 'segment-active' : 'segment-inactive'} />
      {/* 6: Middle */}
      <rect x="15" y="69" width="70" height={sThickness} rx="2" className={active.includes(6) ? 'segment-active' : 'segment-inactive'} />

      {/* Center separators */}
      {char === ':' && (
        <>
          <rect x="42" y="35" width="16" height="16" className="segment-active" />
          <rect x="42" y="95" width="16" height="16" className="segment-active" />
        </>
      )}

      {/* Dot */}
      {char === '.' && <rect x="42" y="130" width="16" height="16" className="segment-active" />}
    </svg>
  );
};

const SegmentDisplay: React.FC<SegmentDisplayProps> = ({ value, size = 'large' }) => {
  const containerWidth = size === 'large' ? '236px' : '110px';
  const containerHeight = size === 'large' ? '40px' : '17px';
  
  return (
    <div 
      className="flex items-center justify-center"
      style={{
        width: containerWidth,
        height: containerHeight
      }}
    >
      {value.split('').map((char, i) => (
        <SegmentCell key={i} char={char} size={size} />
      ))}
    </div>
  );
};

export default SegmentDisplay;
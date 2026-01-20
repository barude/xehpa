import React from 'react';

interface MiniSegmentDisplayProps {
  value: string;
}

const MiniSegmentCell: React.FC<{ char: string }> = ({ char }) => {
  const width = 10;
  const height = 15;
  
  const getActiveSegments = (c: string) => {
    if (c === ':') return [18, 19];
    if (c === '.') return [37];
    if (c === ' ') return [];
    
    const n = parseInt(c);
    if (isNaN(n)) {
      if (c === '+') return [5, 1, 6, 4, 2];
      if (c === '-') return [6];
      if (c === '%') return [0, 1, 2, 3, 4, 5];
      if (c === 'k' || c === 'K') return [0, 5, 6, 2, 3];
      // Special handling for LOW display: L uses [3,4,5]
      if (c === 'L' || c === 'l') return [3, 4, 5];
      if (c === 'P' || c === 'p') return [0, 5, 1, 6];
      if (c === 'H' || c === 'h') return [5, 1, 6, 4, 2];
      if (c === 'B' || c === 'b') return [0, 5, 1, 6, 2, 3, 4];
      // O uses [0,1,2,3,4,5]
      if (c === 'O' || c === 'o') return [0, 1, 2, 3, 4, 5];
      // W split over two positions: first part [2,3,4,5], second part [1,2,3,4]
      // Use special markers: \u0001 for W part 1, \u0002 for W part 2
      if (c === '\u0001') return [2, 3, 4, 5]; // W part 1
      if (c === '\u0002') return [1, 2, 3, 4]; // W part 2
      // Regular W (for other contexts)
      if (c === 'W' || c === 'w') return [2, 3, 4, 5];
      if (c === 'I' || c === 'i') return [1, 2];
      if (c === 'G' || c === 'g') return [0, 2, 3, 4, 5, 6];
      if (c === 'A' || c === 'a') return [0, 1, 2, 4, 5, 6];
      if (c === 'N' || c === 'n') return [0, 1, 2, 4, 5];
      if (c === 'D' || c === 'd') return [1, 2, 3, 4, 6];
      return [];
    }

    const map: Record<number, number[]> = {
      0: [0, 1, 2, 3, 4, 5], 1: [1, 2], 2: [0, 1, 6, 4, 3], 3: [0, 1, 6, 2, 3],
      4: [5, 6, 1, 2], 5: [0, 5, 6, 2, 3], 6: [0, 5, 4, 3, 2, 6], 7: [0, 1, 2],
      8: [0, 1, 2, 3, 4, 5, 6], 9: [0, 1, 2, 3, 5, 6]
    };
    return map[n] || [];
  };

  const active = getActiveSegments(char);
  const sThickness = 1.5;

  return (
    <svg width={width} height={height} viewBox="0 0 100 150" className="inline-block" style={{ marginRight: '1px' }}>
      <rect x="15" y="5" width="70" height={sThickness * 10} rx="1" fill={active.includes(0) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="83" y="12" width={sThickness * 10} height="58" rx="1" fill={active.includes(1) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="83" y="80" width={sThickness * 10} height="58" rx="1" fill={active.includes(2) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="15" y="133" width="70" height={sThickness * 10} rx="1" fill={active.includes(3) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="5" y="80" width={sThickness * 10} height="58" rx="1" fill={active.includes(4) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="5" y="12" width={sThickness * 10} height="58" rx="1" fill={active.includes(5) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      <rect x="15" y="69" width="70" height={sThickness * 10} rx="1" fill={active.includes(6) ? 'var(--color-segment-active)' : 'var(--color-segment-inactive)'} />
      {char === ':' && (
        <>
          <rect x="42" y="35" width="16" height="16" fill="var(--color-segment-active)" />
          <rect x="42" y="95" width="16" height="16" fill="var(--color-segment-active)" />
        </>
      )}
      {char === '.' && <rect x="42" y="130" width="16" height="16" fill="var(--color-segment-active)" />}
    </svg>
  );
};

const MiniSegmentDisplay: React.FC<MiniSegmentDisplayProps> = ({ value }) => {
  // Special handling for "LOW": transform to L + O + W_part1 + W_part2
  // LOW becomes: [3,4,5][0,1,2,3,4,5][2,3,4,5][1,2,3,4]
  let processedValue: string;
  if (value.trim().toUpperCase() === 'LOW') {
    processedValue = 'L' + 'O' + '\u0001' + '\u0002'; // L, O, W_part1, W_part2
  } else {
    processedValue = value.padEnd(4, ' ').slice(0, 4);
  }
  
  return (
    <div className="flex items-center justify-center" style={{ width: '50px', height: '17px' }}>
      {processedValue.split('').map((char, i) => (
        <MiniSegmentCell key={i} char={char} />
      ))}
    </div>
  );
};

export default MiniSegmentDisplay;

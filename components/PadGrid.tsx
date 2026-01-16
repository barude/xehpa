
import React, { useState } from 'react';
import { PadConfig } from '../types';

interface PadGridProps {
  pads: PadConfig[];
  activePadIds: Set<number>;
  selectedPadId: number | null;
  onPadClick: (id: number) => void;
}

const PadGrid: React.FC<PadGridProps> = ({ pads, activePadIds, selectedPadId, onPadClick }) => {
  const [hoveredPadId, setHoveredPadId] = useState<number | null>(null);
  
  return (
    <div 
      style={{
        width: '416px',  // 384 (4×96) + 30 (3×10 gaps) + 2 (1px outline outside on each edge)
        height: '292px', // 260 (4×65) + 30 (3×10 gaps) + 2 (1px outline outside on each edge)
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 96px)',
        gridTemplateRows: 'repeat(4, 65px)',
        gap: '10px 10px', // 10px CSS gap = 8px visual gap (accounting for 1px outline outside each pad)
        justifyContent: 'center',
        alignContent: 'center'
      }}
    >
      {pads.map((pad) => {
        const isActive = activePadIds.has(pad.id);
        const isHovered = hoveredPadId === pad.id;
        // Show hover style when hovered but not when active (flashing)
        const showHoverStyle = isHovered && !isActive;
        
        return (
          <button
            key={pad.id}
            onMouseDown={() => onPadClick(pad.id)}
            onMouseEnter={() => setHoveredPadId(pad.id)}
            onMouseLeave={() => setHoveredPadId(null)}
            className={isActive ? 'pad-active' : ''}
            style={{
              width: '96px',
              height: '65px',
              border: 'none',
              outline: '2px solid #FFFFFF',
              outlineOffset: '-1px', // Center-aligned stroke: 1px inside, 1px outside
              backgroundColor: showHoverStyle ? '#FFFFFF' : '#000000',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              transition: 'none'
            }}
          >
            {/* Top corner - Sample indicator dot */}
            {pad.sampleId && (
              <div 
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  width: '4px',
                  height: '4px',
                  backgroundColor: (isActive || showHoverStyle) ? '#000000' : '#FFFFFF',
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }}
              />
            )}

            {/* Key label center */}
            <span 
              style={{
                width: '49px',
                height: '28px',
                fontFamily: 'Barlow Condensed',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '13px',
                lineHeight: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: (isActive || showHoverStyle) ? '#000000' : '#FFFFFF',
                textTransform: 'uppercase'
              }}
            >
              {pad.keyLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default PadGrid;

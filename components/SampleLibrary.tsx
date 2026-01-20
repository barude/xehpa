import React, { useState, useEffect } from 'react';
import { SampleData } from '../types';
import { deleteSampleFromDB } from '../services/db';
import { useHint } from './HintDisplay';

interface SampleLibraryProps {
  samples: SampleData[];
  onLoadSample: () => void;
  onSampleSelect: (sampleId: string | null) => void;
  selectedSampleId: string | null;
  onSamplesChange: (samples: SampleData[]) => void;
}

const SampleLibrary: React.FC<SampleLibraryProps> = ({
  samples,
  onLoadSample,
  onSampleSelect,
  selectedSampleId,
  onSamplesChange
}) => {
  const [hoveredSampleId, setHoveredSampleId] = useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = useState<'load-sample' | 'delete' | null>(null);
  const [pressedButton, setPressedButton] = useState<'load-sample' | 'delete' | null>(null);
  const { setHint } = useHint();

  const handleDelete = async (sampleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this sample?')) {
      try {
        await deleteSampleFromDB(sampleId);
        onSamplesChange(samples.filter(s => s.id !== sampleId));
      } catch (err) {
        console.error('Failed to delete sample:', err);
        alert('Failed to delete sample');
      }
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:45',message:'Component render with state',data:{hoveredButton, pressedButton, hoveredSampleId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // Check CSS variable values
    const root = getComputedStyle(document.documentElement);
    const hoverBg = root.getPropertyValue('--color-hover-bg').trim();
    const hoverFg = root.getPropertyValue('--color-hover-fg').trim();
    const activeBg = root.getPropertyValue('--color-active-bg').trim();
    const activeFg = root.getPropertyValue('--color-active-fg').trim();
    fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:52',message:'CSS variable values',data:{hoverBg, hoverFg, activeBg, activeFg},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  }, [hoveredButton, pressedButton, hoveredSampleId]);
  // #endregion

  return (
    <div
      className="sample-library-container"
      style={{
        boxSizing: 'border-box',
        width: '313px',
        height: '214px',
        border: '2px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg)'
      }}
    >
      {/* Sticky Button Bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          width: '309px',
          height: '17px',
          margin: '0 auto',
          display: 'flex',
          border: '2px solid var(--color-active-fg)',
          backgroundColor: 'var(--color-active-bg)'
        }}
      >
        {/* LOAD SAMPLE Button */}
        <button
          onClick={onLoadSample}
          onMouseEnter={() => {
            // #region agent log
            fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:75',message:'onMouseEnter fired for LOAD SAMPLE',data:{hoveredButton, pressedButton},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            setHint('LOAD SAMPLE · MULTIPLE FILES');
            setHoveredButton('load-sample');
            // #region agent log
            fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:80',message:'setHoveredButton called with load-sample',data:{previousHoveredButton:hoveredButton},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
          }}
          onMouseLeave={() => {
            // #region agent log
            fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:84',message:'onMouseLeave fired for LOAD SAMPLE',data:{hoveredButton, pressedButton},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            setHint(null);
            setHoveredButton(null);
          }}
          onMouseDown={() => {
            setPressedButton('load-sample');
          }}
          onMouseUp={() => {
            setTimeout(() => {
              setPressedButton(null);
            }, 100);
          }}
          style={{
            flex: 1,
            height: '13px',
            fontFamily: 'Barlow Condensed',
            fontStyle: 'normal',
            fontWeight: 500,
            fontSize: '10px',
            lineHeight: '12px',
            color: (() => {
              // #region agent log
              const isHovered = hoveredButton === 'load-sample' || pressedButton === 'load-sample';
              // Sample library buttons need inverted hover: black bg, white text (opposite of default white bg, black text)
              const colorValue = isHovered ? 'var(--color-fg)' : 'var(--color-active-fg)';
              fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:101',message:'LOAD SAMPLE color style evaluation',data:{hoveredButton, pressedButton, isHovered, colorValue},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix3',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              return colorValue;
            })(),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: (() => {
              // #region agent log
              const isHovered = hoveredButton === 'load-sample' || pressedButton === 'load-sample';
              // Sample library buttons need inverted hover: black bg, white text (opposite of default white bg, black text)
              const bgValue = isHovered ? 'var(--color-bg)' : 'var(--color-active-bg)';
              fetch('http://127.0.0.1:7248/ingest/0a4e9d8e-cf73-4c80-b6bc-2336f886527e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SampleLibrary.tsx:108',message:'LOAD SAMPLE backgroundColor style evaluation',data:{hoveredButton, pressedButton, isHovered, bgValue},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix2',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              return bgValue;
            })(),
            cursor: 'pointer',
            padding: 0,
            margin: 0,
            border: 'none',
            borderRight: '2px solid var(--color-active-fg)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxSizing: 'border-box',
            transition: 'none'
          }}
        >
          LOAD SAMPLE
        </button>
        {/* DELETE Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (selectedSampleId) {
              handleDelete(selectedSampleId, e);
            }
          }}
          disabled={!selectedSampleId}
          onMouseEnter={() => {
            if (selectedSampleId) {
              setHint('DELETE · REMOVE SAMPLE');
              setHoveredButton('delete');
            }
          }}
          onMouseLeave={() => {
            setHint(null);
            setHoveredButton(null);
          }}
          onMouseDown={() => {
            if (selectedSampleId) {
              setPressedButton('delete');
            }
          }}
          onMouseUp={() => {
            if (selectedSampleId) {
              setTimeout(() => {
                setPressedButton(null);
              }, 100);
            }
          }}
          style={{
            flex: 1,
            height: '13px',
            fontFamily: 'Barlow Condensed',
            fontStyle: 'normal',
            fontWeight: 500,
            fontSize: '10px',
            lineHeight: '12px',
            color: selectedSampleId 
              ? ((hoveredButton === 'delete' || pressedButton === 'delete') ? 'var(--color-fg)' : 'var(--color-active-fg)')
              : 'var(--color-disabled-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selectedSampleId
              ? ((hoveredButton === 'delete' || pressedButton === 'delete') ? 'var(--color-bg)' : 'var(--color-active-bg)')
              : 'var(--color-active-bg)',
            cursor: selectedSampleId ? 'pointer' : 'not-allowed',
            padding: 0,
            margin: 0,
            border: 'none',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxSizing: 'border-box',
            transition: 'none'
          }}
        >
          DELETE
        </button>
      </div>

      {/* Sample List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          width: '309px',
          margin: '0 auto'
        }}
      >
        {samples.map((sample, index) => {
          const isSelected = selectedSampleId === sample.id;
          const isHovered = hoveredSampleId === sample.id;
          const duration = formatDuration(sample.buffer.duration);
          
          // Calculate max width for sample name (287px - 33px - 20px = 234px max)
          // Sample name starts at 33px, duration starts at 287px, so we have 287 - 33 - 20 = 234px
          const maxNameWidth = 287 - 33 - 20; // 234px

          return (
            <div
              key={sample.id}
              onClick={() => onSampleSelect(isSelected ? null : sample.id)}
              onMouseEnter={() => {
                setHoveredSampleId(sample.id);
                // Truncate to fit in hint display: "SAMPLE · " (9 chars) + sample name (max 48 chars) = ~57 chars
                const maxSampleNameLength = 48;
                const truncatedName = sample.name.length > maxSampleNameLength 
                  ? sample.name.slice(0, maxSampleNameLength) + '...' 
                  : sample.name;
                setHint(`SAMPLE · ${truncatedName.toUpperCase()}`);
              }}
              onMouseLeave={() => {
                setHoveredSampleId(null);
                setHint(null);
              }}
              style={{
                width: '309px',
                height: '11px',
                backgroundColor: (isSelected || isHovered) ? 'var(--color-active-bg)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              {/* Sample Number */}
              <div
                style={{
                  position: 'absolute',
                  left: '7px',
                  fontFamily: 'Barlow Condensed',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '10px',
                  lineHeight: '12px',
                  color: (isSelected || isHovered) ? 'var(--color-active-fg)' : 'var(--color-text)',
                  width: '7px',
                  height: '12px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {index + 1}
              </div>

              {/* Sample Name */}
              <div
                style={{
                  position: 'absolute',
                  left: '33px',
                  fontFamily: 'Barlow Condensed',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '10px',
                  lineHeight: '12px',
                  color: (isSelected || isHovered) ? 'var(--color-active-fg)' : 'var(--color-text)',
                  width: `${maxNameWidth}px`,
                  height: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={sample.name}
              >
                {sample.name.toUpperCase()}
              </div>

              {/* Sample Duration */}
              <div
                style={{
                  position: 'absolute',
                  left: '287px',
                  fontFamily: 'Barlow Condensed',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '10px',
                  lineHeight: '12px',
                  color: (isSelected || isHovered) ? 'var(--color-active-fg)' : 'var(--color-text)',
                  width: '14px',
                  height: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end'
                }}
              >
                {duration}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SampleLibrary;


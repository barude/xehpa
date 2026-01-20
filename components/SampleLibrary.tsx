import React, { useState } from 'react';
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
            setHint('LOAD SAMPLE · MULTIPLE FILES');
            setHoveredButton('load-sample');
          }}
          onMouseLeave={() => {
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
              const isHovered = hoveredButton === 'load-sample' || pressedButton === 'load-sample';
              // Sample library buttons need inverted hover: black bg, white text (opposite of default white bg, black text)
              return isHovered ? 'var(--color-fg)' : 'var(--color-active-fg)';
            })(),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: (() => {
              const isHovered = hoveredButton === 'load-sample' || pressedButton === 'load-sample';
              // Sample library buttons need inverted hover: black bg, white text (opposite of default white bg, black text)
              return isHovered ? 'var(--color-bg)' : 'var(--color-active-bg)';
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


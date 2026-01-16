import React, { useState } from 'react';
import { SampleData } from '../types';
import { deleteSampleFromDB } from '../services/db';

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
      style={{
        boxSizing: 'border-box',
        width: '313px',
        height: '214px',
        border: '2px solid #FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000000'
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
          border: '2px solid #000000',
          backgroundColor: '#FFFFFF'
        }}
      >
        {/* LOAD SAMPLE Button */}
        <button
          onClick={onLoadSample}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#000000';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
            e.currentTarget.style.color = '#000000';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.backgroundColor = '#000000';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseUp={(e) => {
            setTimeout(() => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.color = '#000000';
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
            color: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            cursor: 'pointer',
            padding: 0,
            margin: 0,
            border: 'none',
            borderRight: '2px solid #000000',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxSizing: 'border-box'
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
          onMouseEnter={(e) => {
            if (selectedSampleId) {
              e.currentTarget.style.backgroundColor = '#000000';
              e.currentTarget.style.color = '#FFFFFF';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
            e.currentTarget.style.color = selectedSampleId ? '#000000' : '#999999';
          }}
          onMouseDown={(e) => {
            if (selectedSampleId) {
              e.currentTarget.style.backgroundColor = '#000000';
              e.currentTarget.style.color = '#FFFFFF';
            }
          }}
          onMouseUp={(e) => {
            if (selectedSampleId) {
              setTimeout(() => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.color = '#000000';
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
            color: selectedSampleId ? '#000000' : '#999999',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            cursor: selectedSampleId ? 'pointer' : 'not-allowed',
            padding: 0,
            margin: 0,
            border: 'none',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxSizing: 'border-box'
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
              onMouseEnter={() => setHoveredSampleId(sample.id)}
              onMouseLeave={() => setHoveredSampleId(null)}
              style={{
                width: '309px',
                height: '11px',
                backgroundColor: (isSelected || isHovered) ? '#FFFFFF' : 'transparent',
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
                  color: (isSelected || isHovered) ? '#000000' : '#FFFFFF',
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
                  color: (isSelected || isHovered) ? '#000000' : '#FFFFFF',
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
                  color: (isSelected || isHovered) ? '#000000' : '#FFFFFF',
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


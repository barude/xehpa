import React from 'react';
import { TransportStatus } from '../types';
import { useHint } from './HintDisplay';

interface TransportButtonsProps {
  transport: TransportStatus;
  onPlayStop: () => void;
  onRecord: () => void;
}

const TransportButtons: React.FC<TransportButtonsProps> = ({ transport, onPlayStop, onRecord }) => {
  const { setHint } = useHint();

  return (
    <div style={{ position: 'absolute', left: '50%', top: '0', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button 
        onClick={onPlayStop} 
        className="circular-button" 
        onMouseEnter={() => setHint('PLAY/STOP [SPACE]')}
        onMouseLeave={() => setHint(null)}
        style={{ boxSizing: 'border-box', width: '29px', height: '29px', border: '2px solid #FFFFFF', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        {transport === TransportStatus.STOPPED ? (
          <div style={{ width: '10.58px', height: '10.58px', background: '#FFFFFF', clipPath: 'polygon(0 0, 0 100%, 100% 50%)', transform: 'translateX(1px)' }} />
        ) : (
          <div style={{ width: '8px', height: '8px', background: '#FFFFFF' }} />
        )}
      </button>
      <button 
        onClick={onRecord} 
        className="circular-button" 
        onMouseEnter={() => setHint('RECORD [ALT+SPACE]')}
        onMouseLeave={() => setHint(null)}
        style={{ boxSizing: 'border-box', width: '29px', height: '29px', border: '2px solid #FFFFFF', borderRadius: '50%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <div className="circular-button" style={{ width: '11px', height: '11px', background: transport === TransportStatus.RECORDING ? '#FF0000' : '#FFFFFF', borderRadius: '50%' }} />
      </button>
    </div>
  );
};

export default TransportButtons;


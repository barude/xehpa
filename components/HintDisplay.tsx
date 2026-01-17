import React, { createContext, useContext, useState, ReactNode } from 'react';

interface HintContextType {
  hint: string | null;
  setHint: (hint: string | null) => void;
}

const HintContext = createContext<HintContextType | undefined>(undefined);

export const useHint = () => {
  const context = useContext(HintContext);
  if (!context) {
    throw new Error('useHint must be used within HintProvider');
  }
  return context;
};

interface HintProviderProps {
  children: ReactNode;
}

export const HintProvider: React.FC<HintProviderProps> = ({ children }) => {
  const [hint, setHint] = useState<string | null>(null);

  return (
    <HintContext.Provider value={{ hint, setHint }}>
      {children}
    </HintContext.Provider>
  );
};

interface HintDisplayProps {
  defaultHint: string | null;
}

export const HintDisplay: React.FC<HintDisplayProps> = ({ defaultHint }) => {
  const { hint } = useHint();
  const displayText = hint || defaultHint || '';

  // Truncate long hints to fit on one line (approximately 60 characters for 488px width)
  const truncatedText = displayText.length > 60 ? displayText.slice(0, 57) + '...' : displayText;

  return (
    <div
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: '11px',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'center',
        marginTop: '13px',
        minHeight: '16px',
        opacity: displayText ? 1 : 0,
        transition: 'opacity 0.2s ease',
        width: '488px', // Match EffectsPanel width
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {truncatedText}
    </div>
  );
};


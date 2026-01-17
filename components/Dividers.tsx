import React from 'react';

interface AudioAnalysisData {
  left: { bass: number; mid: number; treble: number; overall: number };
  right: { bass: number; mid: number; treble: number; overall: number };
  mid: { bass: number; mid: number; treble: number; overall: number };
}

interface DividersProps {
  audioData?: AudioAnalysisData;
  isPlaying?: boolean;
}

/**
 * Dividers component - reactive double-sided spectrum bars
 * Uses exact original coordinates from design SVG
 */
const Dividers: React.FC<DividersProps> = ({ audioData, isPlaying = false }) => {
  const MAX_EXTENSION = 12; // 12px away from any element/component

  // Calculate extension amount with increased sensitivity for more movement
  const getExtension = (audioLevel: number): number => {
    if (!audioData) return 0;
    // Normalize and amplify - make it more sensitive
    const normalized = Math.min(1, audioLevel / 180); // Lower threshold (180 instead of 255) for more reaction
    // Use linear mapping instead of easing for more direct response
    return MAX_EXTENSION * normalized;
  };

  // Left channel helpers
  const getLeftExtension = (band: 'bass' | 'mid' | 'treble' | 'overall' = 'overall'): number => {
    return getExtension(audioData?.left?.[band] || 0);
  };

  // Right channel helpers
  const getRightExtension = (band: 'bass' | 'mid' | 'treble' | 'overall' = 'overall'): number => {
    return getExtension(audioData?.right?.[band] || 0);
  };

  // Mid channel helpers
  const getMidExtension = (band: 'bass' | 'mid' | 'treble' | 'overall' = 'overall'): number => {
    return getExtension(audioData?.mid?.[band] || 0);
  };

  return (
    <svg
      width="1288"
      height="833"
      viewBox="0 0 1288 833"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* EXACT ORIGINAL COORDINATES FROM SVG - with extensions applied */}
      {/* Left vertical dividers */}
      <line x1="72.0001" y1={142 - getLeftExtension('overall')} x2="72.0001" y2={164 + getLeftExtension('overall')} stroke="white" strokeWidth="4" />
      <line x1="22" y1="155" x2={-2.6226e-06 - getLeftExtension('overall')} y2="155" stroke="white" strokeWidth="4" />
      <line x1="22" y1="542" x2={-2.6226e-06 - getLeftExtension('overall')} y2="542" stroke="white" strokeWidth="4" />
      <line x1="130" y1={142 - getLeftExtension('bass')} x2="130" y2={164 + getLeftExtension('bass')} stroke="white" strokeWidth="4" />
      <line x1="188" y1={142 - getLeftExtension('mid')} x2="188" y2={164 + getLeftExtension('mid')} stroke="white" strokeWidth="4" />
      <line x1="246" y1={142 - getLeftExtension('treble')} x2="246" y2={164 + getLeftExtension('treble')} stroke="white" strokeWidth="4" />
      <line x1="304" y1={142 - getLeftExtension('overall')} x2="304" y2={164 + getLeftExtension('overall')} stroke="white" strokeWidth="4" />
      <line x1="72.0001" y1={531 - getLeftExtension('overall')} x2="72.0001" y2={553 + getLeftExtension('overall')} stroke="white" strokeWidth="4" />
      <line x1="130" y1={531 - getLeftExtension('bass')} x2="130" y2={553 + getLeftExtension('bass')} stroke="white" strokeWidth="4" />
      <line x1="188" y1={531 - getLeftExtension('mid')} x2="188" y2={553 + getLeftExtension('mid')} stroke="white" strokeWidth="4" />
      <line x1="246" y1={531 - getLeftExtension('treble')} x2="246" y2={553 + getLeftExtension('treble')} stroke="white" strokeWidth="4" />
      <line x1="304" y1={531 - getLeftExtension('overall')} x2="304" y2={553 + getLeftExtension('overall')} stroke="white" strokeWidth="4" />

      {/* Middle horizontal dividers */}
      <line x1={396 + getMidExtension('bass')} y1="232" x2={374 - getMidExtension('bass')} y2="232" stroke="white" strokeWidth="4" />
      <line x1={396 + getMidExtension('mid')} y1="290" x2={374 - getMidExtension('mid')} y2="290" stroke="white" strokeWidth="4" />
      <line x1={396 + getMidExtension('treble')} y1="348" x2={374 - getMidExtension('treble')} y2="348" stroke="white" strokeWidth="4" />
      <line x1={396 + getMidExtension('mid')} y1="406" x2={374 - getMidExtension('mid')} y2="406" stroke="white" strokeWidth="4" />
      <line x1={396 + getMidExtension('bass')} y1="464" x2={374 - getMidExtension('bass')} y2="464" stroke="white" strokeWidth="4" />

      {/* Right vertical dividers - applying extensions in local space before transform */}
      {/* transform="matrix(0 1 1 0 x y)" rotates horizontal to vertical: extends y1 down, x2 extends down */}
      <line y1={-2 - getRightExtension('overall')} x2={22 + getRightExtension('overall')} y2="-2" transform="matrix(0 1 1 0 1218 142)" stroke="white" strokeWidth="4" />
      <line x1={1287 - getRightExtension('overall')} y1="155" x2="1265" y2="155" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('overall')} x2={22 + getRightExtension('overall')} y2="-2" transform="matrix(-1 0 0 1 1287 544)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('bass')} x2={22 + getRightExtension('bass')} y2="-2" transform="matrix(0 1 1 0 1160 142)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('mid')} x2={22 + getRightExtension('mid')} y2="-2" transform="matrix(0 1 1 0 1102 142)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('treble')} x2={22 + getRightExtension('treble')} y2="-2" transform="matrix(0 1 1 0 1044 142)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('overall')} x2={22 + getRightExtension('overall')} y2="-2" transform="matrix(0 1 1 0 986 142)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('overall')} x2={22 + getRightExtension('overall')} y2="-2" transform="matrix(0 1 1 0 1218 533)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('bass')} x2={22 + getRightExtension('bass')} y2="-2" transform="matrix(0 1 1 0 1160 533)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('mid')} x2={22 + getRightExtension('mid')} y2="-2" transform="matrix(0 1 1 0 1102 533)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('treble')} x2={22 + getRightExtension('treble')} y2="-2" transform="matrix(0 1 1 0 1044 533)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getRightExtension('overall')} x2={22 + getRightExtension('overall')} y2="-2" transform="matrix(0 1 1 0 986 533)" stroke="white" strokeWidth="4" />

      {/* Middle vertical dividers (x=892) - applying extensions in local space before transform */}
      {/* transform="matrix(1 0 0 -1 x y)" flips vertically: extend by changing y1 and x2 */}
      <line y1={-2 - getMidExtension('mid')} x2={22 + getMidExtension('mid')} y2="-2" transform="matrix(1 0 0 -1 892 230)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getMidExtension('bass')} x2={22 + getMidExtension('bass')} y2="-2" transform="matrix(1 0 0 -1 892 288)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getMidExtension('treble')} x2={22 + getMidExtension('treble')} y2="-2" transform="matrix(1 0 0 -1 892 346)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getMidExtension('mid')} x2={22 + getMidExtension('mid')} y2="-2" transform="matrix(1 0 0 -1 892 404)" stroke="white" strokeWidth="4" />
      <line y1={-2 - getMidExtension('overall')} x2={22 + getMidExtension('overall')} y2="-2" transform="matrix(1 0 0 -1 892 462)" stroke="white" strokeWidth="4" />

      {/* Top/bottom edge horizontal dividers - applying extensions in local space before transform */}
      {/* transform="matrix(0 -1 -1 0 x y)" rotates and flips: extend by changing y1 and x2 */}
      <line y1={-2 - getMidExtension('overall')} x2={22 + getMidExtension('overall')} y2="-2" transform="matrix(0 -1 -1 0 903 23)" stroke="white" strokeWidth="4" />
      <line x1="383" y1={23.0001 + getMidExtension('overall')} x2="383" y2="1.00012" stroke="white" strokeWidth="4" />
      <line y1={-2 - getMidExtension('overall')} x2={22 + getMidExtension('overall')} y2="-2" transform="matrix(0 -1 -1 0 903 832)" stroke="white" strokeWidth="4" />
      <line x1="383" y1={832 - getMidExtension('overall')} x2="383" y2="810" stroke="white" strokeWidth="4" />

      {/* Border rectangle (always static) */}
      <rect x="0.5" y="0.5" width="1287" height="832" stroke="white" />
    </svg>
  );
};

export default Dividers;

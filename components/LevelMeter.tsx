import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../services/audioEngine';

interface LevelMeterProps {
  channel: 'left' | 'right';
  frequencyBand: 'low' | 'high';
}

/**
 * LevelMeter component - MPC-style stereo level meters
 * Displays real-time output levels for a single column
 * Each column reacts to different frequency bands for independent movement
 */
const LevelMeter: React.FC<LevelMeterProps> = ({ channel, frequencyBand }) => {
  const [level, setLevel] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const levelRef = useRef(0);

  useEffect(() => {
    const analysers = audioEngine.getStereoAnalysers();
    if (!analysers.left || !analysers.right) return;

    const analyser = channel === 'left' ? analysers.left : analysers.right;
    
    // Determine if this is an outermost bar (leftmost or rightmost)
    // Outermost bars: Drums/Transients (high frequencies) - Peak-based for percussive hits
    // Inner bars: Bass (low frequencies) - RMS-based for sustained basslines
    const isOutermost = (channel === 'left' && frequencyBand === 'low') || 
                         (channel === 'right' && frequencyBand === 'low');
    
    // Configure analyser based on musical role
    analyser.fftSize = 512; // Larger FFT for better frequency resolution
    
    // Assign metering algorithms per column:
    // - Outermost (Drums/Transients): Peak with lower smoothing (~0.2) for sharp reactions
    // - Inner (Bass): RMS with higher smoothing (~0.65) for optimal balance between sustain and attack
    // Use lower smoothing values for faster response when audio stops
    const smoothingConstant = isOutermost ? 0.2 : 0.65;
    analyser.smoothingTimeConstant = smoothingConstant;
    
    const bufferLength = analyser.frequencyBinCount;
    
    // Get actual sample rate from audio context
    const sampleRate = audioEngine.ctx.sampleRate;
    const nyquist = sampleRate / 2;
    
    // Prepare buffers for both time-domain (RMS) and frequency-domain (Peak) analysis
    const frequencyData = new Uint8Array(bufferLength);
    const timeData = new Float32Array(bufferLength);
    
    // Track peak values with fast attack, slow release for more dynamic visuals
    let peakHold = 0;
    let peakDecay = 0.92; // Decay rate for peak hold (92% per frame = slow release)
    
    // Short-term peak hold for drums/transients (30-50ms visual hold before decay)
    // This captures the sharp attack of snare/cymbal hits
    let shortTermPeakHold = 0;
    const shortTermPeakDecay = 0.92; // Decay rate for short-term peak
    const shortTermHoldDuration = 40; // milliseconds of hold before decay
    const shortTermHoldFrames = Math.ceil((shortTermHoldDuration / 1000) * 60); // Convert to frames at ~60fps
    let shortTermHoldCounter = 0;

    const updateLevels = () => {
      let bandBlended: number;
      
      if (isOutermost) {
        // OUTERMOST BARS: DRUMS/TRANSIENTS - Peak detection with frequency-domain analysis
        // Analyze high-frequency content (drums/percussion) for immediate, sharp reactions
        analyser.getByteFrequencyData(frequencyData);
        
        // Refined drum frequency bands based on instrument fundamentals:
        // Snare body: 180-400Hz (fundamental resonance)
        // Snare snap: 2-5kHz (transient attack)
        // Hi-hat/cymbal: 5-12kHz (brightness and presence)
        // Overhead cymbals: 12-20kHz (air and shimmer)
        const snareBodyStart = Math.floor((180 / nyquist) * bufferLength);   // 180Hz
        const snareBodyEnd = Math.floor((400 / nyquist) * bufferLength);     // 400Hz
        const snareSnapStart = Math.floor((2000 / nyquist) * bufferLength);  // 2kHz
        const snareSnapEnd = Math.floor((5000 / nyquist) * bufferLength);    // 5kHz
        const cymbalStart = Math.floor((5000 / nyquist) * bufferLength);     // 5kHz
        const cymbalEnd = Math.floor((12000 / nyquist) * bufferLength);      // 12kHz
        const overheadStart = Math.floor((12000 / nyquist) * bufferLength);  // 12kHz
        
        let bandPeak = 0;
        
        for (let i = snareBodyStart; i < bufferLength; i++) {
          const value = frequencyData[i] / 255;
          
          // Weight based on instrument-specific frequency ranges
          let weight = 1.0;
          
          if (i < snareBodyEnd) {
            // Snare body: moderate weight (fundamental resonance)
            // Peak at ~250Hz (snare fundamental)
            const centerFreq = 250;
            const centerIndex = Math.floor((centerFreq / nyquist) * bufferLength);
            const distanceFromCenter = Math.abs(i - centerIndex);
            const maxDistance = Math.abs(snareBodyEnd - centerIndex);
            weight = 1.0 + (1.0 - distanceFromCenter / maxDistance) * 0.5; // 1.0 to 1.5
          } else if (i < snareSnapStart) {
            // Mid-range: lower weight (less transient content)
            weight = 0.8;
          } else if (i < snareSnapEnd) {
            // Snare snap/attack: highest weight (most transients)
            // Peak at ~3.5kHz (snare crack)
            const centerFreq = 3500;
            const centerIndex = Math.floor((centerFreq / nyquist) * bufferLength);
            const distanceFromCenter = Math.abs(i - centerIndex);
            const maxDistance = Math.abs(snareSnapEnd - centerIndex);
            weight = 1.6 + (1.0 - distanceFromCenter / maxDistance) * 0.4; // 1.6 to 2.0
          } else if (i < cymbalEnd) {
            // Hi-hat/cymbal: high weight (bright transient content)
            weight = 1.5;
          } else if (i < overheadStart) {
            // High cymbal: moderate weight
            weight = 1.2;
          } else {
            // Very high frequencies: lower weight (less energy, more air)
            weight = 0.9;
          }
          
          const weightedValue = value * weight;
          if (weightedValue > bandPeak) {
            bandPeak = weightedValue;
          }
        }
        
        // True-peak detection: catch inter-sample peaks for accurate peak detection
        // Oversample time-domain data to detect peaks between samples
        analyser.getFloatTimeDomainData(timeData);
        
        let maxTruePeak = 0;
        // True-peak detection: catch inter-sample peaks for accurate peak detection
        // Oversample time-domain data to detect peaks between samples
        // This prevents invisible digital clipping by catching peaks that occur between sample points
        for (let i = 1; i < timeData.length; i++) {
          const current = timeData[i];
          const previous = timeData[i - 1];
          const currentAbs = Math.abs(current);
          const previousAbs = Math.abs(previous);
          
          // Detect inter-sample peaks when samples cross zero (zero-crossing detection)
          // Zero-crossings indicate peaks between samples that could be missed
          if (Math.sign(current) !== Math.sign(previous)) {
            // Zero-crossing: peak is likely at the zero point between samples
            // Estimate using linear interpolation (simplified for performance)
            const slope = current - previous;
            if (slope !== 0) {
              // Find zero-crossing point and estimate peak magnitude
              const zeroPoint = -previous / slope;
              if (zeroPoint >= 0 && zeroPoint <= 1) {
                // Linear interpolation at zero-crossing (peak magnitude is 0 at crossing)
                // But we check adjacent samples for peak magnitude
                const interpolatedPeak = Math.abs(current - previous) * 0.5;
                maxTruePeak = Math.max(maxTruePeak, interpolatedPeak);
              }
            }
          } else if (Math.abs(currentAbs - previousAbs) > 0.1) {
            // Significant difference: estimate peak using linear interpolation
            // Steep slopes indicate potential inter-sample peaks
            const slope = current - previous;
            const magnitudeChange = Math.abs(slope);
            // Estimate peak at midpoint (could be higher if curve is steep)
            const interpolatedPeak = Math.max(currentAbs, previousAbs) + magnitudeChange * 0.3;
            maxTruePeak = Math.max(maxTruePeak, interpolatedPeak);
          } else {
            // No inter-sample peak detected, use sample value
            maxTruePeak = Math.max(maxTruePeak, currentAbs);
          }
        }
        
        // Combine frequency-domain peak with true-peak for accuracy
        // True-peak ensures we catch inter-sample peaks that could cause invisible digital clipping
        // Use maximum of frequency peak and true-peak to ensure no peaks are missed
        const truePeakNormalized = maxTruePeak; // Already normalized (Float32Array is -1 to 1)
        const combinedPeak = Math.max(bandPeak, truePeakNormalized * 0.90); // Scale true-peak slightly
        bandBlended = combinedPeak;
        
        // Short-term peak hold for visual attack clarity (40ms hold)
        // This captures the sharp transient before decay begins, making hits more pronounced
        // The hold duration (40ms) is optimized to capture snare/cymbal attack without obscuring rhythm
        if (bandBlended > shortTermPeakHold) {
          // New peak detected: reset hold and update peak
          shortTermPeakHold = bandBlended;
          shortTermHoldCounter = shortTermHoldFrames; // Reset hold counter (40ms at ~60fps)
        } else if (shortTermHoldCounter > 0) {
          // Hold period active: maintain peak for visual clarity
          shortTermHoldCounter--;
          // Peak maintained during hold (no decay)
        } else {
          // Hold period expired: apply fast decay
          shortTermPeakHold *= shortTermPeakDecay;
        }
        
        // Blend short-term peak hold with current peak for natural transition
        // Use 85% of held peak to maintain visual impact while allowing natural decay
        // This makes snare/cymbal hits more pronounced and satisfying
        bandBlended = Math.max(bandBlended, shortTermPeakHold * 0.85);
        
      } else {
        // INNER BARS: BASS - RMS-based analysis with time-domain data
        // Use time-domain RMS for accurate perceived loudness and smooth basslines
        analyser.getFloatTimeDomainData(timeData);
        
        // Calculate RMS (Root Mean Square) for accurate loudness perception
        // Use full buffer length for optimal balance between smooth sustain and attack reaction
        // Longer buffer = smoother sustain, shorter = faster reaction to note plucks
        // Current buffer length (256 samples @ 44.1kHz ≈ 5.8ms) provides good balance
        let sumOfSquares = 0;
        for (let i = 0; i < timeData.length; i++) {
          sumOfSquares += timeData[i] * timeData[i];
        }
        const rms = Math.sqrt(sumOfSquares / timeData.length);
        
        // Optional: For even smoother sustain while maintaining attack, could use weighted RMS
        // Weight recent samples slightly more to react to note plucks
        // This is commented out as current RMS already provides good balance
        // let weightedSum = 0;
        // let weightSum = 0;
        // for (let i = 0; i < timeData.length; i++) {
        //   const weight = 1.0 + (i / timeData.length) * 0.2; // 20% more weight to recent samples
        //   weightedSum += timeData[i] * timeData[i] * weight;
        //   weightSum += weight;
        // }
        // const rms = Math.sqrt(weightedSum / weightSum);
        
        // Apply frequency-domain band-limiting to focus on bass fundamentals
        // Bass fundamentals: 40-250Hz (where bass guitar and kick drum fundamentals lie)
        // Bass harmonics: 250Hz-2kHz (where bass overtones and body reside)
        analyser.getByteFrequencyData(frequencyData);
        const bassFundamentalStart = Math.floor((40 / nyquist) * bufferLength);   // 40Hz (low E on bass)
        const bassFundamentalEnd = Math.floor((250 / nyquist) * bufferLength);    // 250Hz (fundamental range end)
        const bassHarmonicEnd = Math.floor((2000 / nyquist) * bufferLength);      // 2kHz (harmonic extension)
        
        // Band-limited RMS: weight RMS by bass frequency content
        // Use multi-band weighting for accurate bass representation
        let bassEnergy = 0;
        let bassEnergyCount = 0;
        
        for (let i = 0; i < bassHarmonicEnd; i++) {
          const freqValue = frequencyData[i] / 255;
          let weight = 0;
          
          if (i < bassFundamentalStart) {
            // Sub-bass (below 40Hz): minimal weight (mostly rumble)
            weight = 0.3;
          } else if (i < bassFundamentalEnd) {
            // Fundamental range (40-250Hz): maximum weight (strong bass emphasis)
            // Peak weight at ~100Hz (typical bass guitar fundamental)
            const centerFreq = 100;
            const centerIndex = Math.floor((centerFreq / nyquist) * bufferLength);
            const distanceFromCenter = Math.abs(i - centerIndex);
            const maxDistance = Math.abs(bassFundamentalEnd - centerIndex);
            const centerWeight = 1.8; // Peak at center
            const edgeWeight = 1.4;   // Weight at edges
            weight = centerWeight - (distanceFromCenter / maxDistance) * (centerWeight - edgeWeight);
          } else {
            // Harmonic range (250Hz-2kHz): decaying weight
            const harmonicDecay = (i - bassFundamentalEnd) / (bassHarmonicEnd - bassFundamentalEnd);
            weight = 1.4 - harmonicDecay * 0.8; // Decay from 1.4 to 0.6
          }
          
          bassEnergy += freqValue * weight;
          bassEnergyCount++;
        }
        const bassWeight = bassEnergyCount > 0 ? bassEnergy / bassEnergyCount : 0;
        
        // Combine time-domain RMS with frequency-domain bass weighting
        // RMS (60%) provides smooth perceived loudness for sustained basslines
        // Frequency weighting (40%) focuses on bass-specific content
        bandBlended = rms * 0.6 + (rms * bassWeight) * 0.4;
      }
      
      // Peak hold with decay - adjust based on algorithm type and current level
      // When level is low (music stopped), decay much faster
      // Drums (Peak - outermost): faster decay for transient clarity
      // Bass (RMS - inner): slower decay for smooth sustain
      const isLowLevel = bandBlended < 0.05; // Consider low when below 5%
      const baseDecayRate = isOutermost ? 0.88 : 0.94; // Drums: 12% decay, Bass: 6% decay
      // Accelerate decay when level is low (music stopped)
      const peakDecayRate = isLowLevel ? (isOutermost ? 0.75 : 0.82) : baseDecayRate; // Faster decay when low
      
      if (bandBlended > peakHold) {
        peakHold = bandBlended; // Fast attack for both
      } else {
        peakHold *= peakDecayRate; // Variable release - faster when music stops
      }
      
      // Mix current level with peak hold based on algorithm
      // When level is low, use more current level (less peak hold) for faster response
      // Drums (Peak - outermost): more current level for immediate transient response
      // Bass (RMS - inner): more peak hold for smooth, sustained visuals
      const baseCurrentMix = isOutermost ? 0.90 : 0.75; // Drums: 90% current/10% peak, Bass: 75% current/25% peak
      const currentMix = isLowLevel ? 0.95 : baseCurrentMix; // More current when low for faster drop
      const peakMix = 1.0 - currentMix;
      const dynamicLevel = bandBlended * currentMix + peakHold * peakMix;
      
      // Apply compression based on algorithm sensitivity
      // Drums (Peak - outermost): more compression to prevent excessive peaks
      // Bass (RMS - inner): less compression for natural bass response
      const compressionFactor = isOutermost ? 0.32 : 0.40; // Drums: 0.32, Bass: 0.40
      const bandScaled = dynamicLevel * compressionFactor;
      
      // Convert to dB scale with wider dynamic range
      const db = Math.max(-70, 20 * Math.log10(bandScaled + 0.0001));
      
      // Normalize: -70dB = 0, 0dB = 1
      const normalized = Math.max(0, Math.min(1, (db + 70) / 70));
      
      levelRef.current = normalized;
      setLevel(normalized);
      
      animationFrameRef.current = requestAnimationFrame(updateLevels);
    };

    animationFrameRef.current = requestAnimationFrame(updateLevels);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [channel, frequencyBand]);

  // Number of bar segments per column - fewer, wider bars
  const NUM_SEGMENTS = 14;
  const SEGMENT_HEIGHT = 4; // Height of  each segment in pixels
  const SEGMENT_GAP = 4; // Gap between segments in pixels
  const COLUMN_GAP = 4; // Gap between columns in pixels (matches segment gap)
  const COLUMN_WIDTH = 24; // Width of each column in pixels (wider by 5px)

  // Calculate number of active segments based on level
  // Map from [threshold, 1] to [0, NUM_SEGMENTS]
  // Idle (level <= threshold) shows 0 bars, bars only appear when music starts playing
  const getActiveSegments = (level: number): number => {
    // Threshold below which we consider the state idle (no bars visible)
    const idleThreshold = 0.01; // ~1% level threshold for idle detection
    
    if (level <= idleThreshold) {
      return 0; // Idle state: no bars visible
    }
    
    // Use exponential scaling to compress dynamic range and prevent clipping
    // Apply moderate exponential curve: level^1.8 to make response less dramatic
    // This gives better visual range without hitting max on soft sounds
    // Normalize level from [threshold, 1] to [0, 1] before scaling
    const normalizedLevel = (level - idleThreshold) / (1 - idleThreshold);
    const scaledLevel = Math.pow(normalizedLevel, 1.8); // Moderate exponential curve for balanced sensitivity
    
    // Map scaled level to segments: scale from 1 to NUM_SEGMENTS
    const segments = Math.floor(1 + (scaledLevel * (NUM_SEGMENTS - 1)));
    return Math.max(0, Math.min(NUM_SEGMENTS, segments));
  };

  const active = getActiveSegments(level);

  // Color segments - inactive bars are black (background), only active bars are white
  const getSegmentColor = (segmentIndex: number, isActive: boolean): string => {
    if (!isActive) return '#000000'; // Inactive segments - black background
    
    // Active segments - white, reacting to music
    return '#FFFFFF';
  };

  // Calculate total height of the meter
  const totalHeight = NUM_SEGMENTS * (SEGMENT_HEIGHT + SEGMENT_GAP) - SEGMENT_GAP;
  
  // Total time SegmentDisplay bottom edge positioning:
  // User indicated the SegmentDisplay div is at top=124px (absolute)
  // display-bg has marginTop: 22px, so relative to display-bg: 124 - 22 = 102px
  // SegmentDisplay height is 17px, so bottom is at: 102 + 17 = 119px from top of display-bg
  // Move up 1px for perfect alignment: 119 - 1 = 118px
  const segmentDisplayBottom = 118;
  
  // Align bottom of meters with bottom of SegmentDisplay
  // Since bars grow upward (alignItems: flex-end), set top to segmentDisplayBottom - totalHeight
  const topPosition = segmentDisplayBottom - totalHeight;
  
  // Determine horizontal position based on channel and frequency band for symmetry
  // Leftmost: left channel, low freq
  // Second from left: left channel, high freq
  // Second from right: right channel, high freq
  // Rightmost: right channel, low freq
  const getLeftPosition = () => {
    if (channel === 'left' && frequencyBand === 'low') {
      return '0px'; // Leftmost - left channel low freq
    } else if (channel === 'left' && frequencyBand === 'high') {
      return `${COLUMN_WIDTH + COLUMN_GAP}px`; // Second from left - left channel high freq (column width + gap)
    } else {
      return 'auto'; // Right side columns
    }
  };
  
  const getRightPosition = () => {
    if (channel === 'right' && frequencyBand === 'low') {
      return '0px'; // Rightmost - right channel low freq
    } else if (channel === 'right' && frequencyBand === 'high') {
      return `${COLUMN_WIDTH + COLUMN_GAP}px`; // Second from right - right channel high freq (column width + gap)
    } else {
      return 'auto'; // Left side columns
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: `${topPosition}px`,
        left: getLeftPosition(),
        right: getRightPosition(),
        display: 'flex',
        flexDirection: 'column',
        gap: SEGMENT_GAP,
        alignItems: 'center',
        height: totalHeight,
        justifyContent: 'flex-end',
      }}
    >
      {/* Single column of bars */}
      {Array.from({ length: NUM_SEGMENTS }, (_, i) => {
        const segmentIndex = NUM_SEGMENTS - 1 - i; // Reverse order (top to bottom)
        const isActive = segmentIndex < active;
        return (
          <div
            key={`${channel}-${frequencyBand}-${i}`}
            style={{
              width: COLUMN_WIDTH,
              height: SEGMENT_HEIGHT,
              backgroundColor: getSegmentColor(segmentIndex, isActive),
              transition: 'none', // No transition for instant reactivity
            }}
          />
        );
      })}
    </div>
  );
};

export default LevelMeter;


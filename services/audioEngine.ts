import { SampleData, PadConfig, LoopHit, Pattern, SongStep } from '../types';

export interface TriggerInfo {
  startTime: number;
  offset: number;
  duration: number;
  rate: number;
  isReversed: boolean;
  release: number;
  originalStart: number; // Original pad.start for playhead calculation
  originalEnd: number; // Original pad.end for playhead calculation
  source: AudioBufferSourceNode;
  padId: number;
  chokeGroupId: string | null;
  nodes: {
    gain: GainNode;
    panner: StereoPannerNode;
    filter: BiquadFilterNode;
    reverbSend: GainNode;
  };
}

class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  reverbNode: ConvolverNode;
  reverbGain: GainNode;
  analyser: AnalyserNode | null = null;
  leftAnalyser: AnalyserNode | null = null;
  rightAnalyser: AnalyserNode | null = null;
  private activeTriggers: Set<TriggerInfo> = new Set();
  private exclusiveTriggers: Map<string, TriggerInfo> = new Map();
  private scheduledStopTimes: WeakMap<AudioBufferSourceNode, number> = new WeakMap();
  private metronomeOscillators: Set<OscillatorNode> = new Set();
  private stateChangeHandler: () => void;
  private reversedBufferCache = new WeakMap<AudioBuffer, Map<string, AudioBuffer>>();
  private lastPlayTime = 0; // For performance monitoring

  constructor() {
    // Feature detection for AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser");
    }
    
    // Use 'playback' latencyHint for lowest latency across all output devices
    // This ensures minimal delay on headphones, speakers, and built-in speakers
    this.ctx = new AudioContextClass({ 
      sampleRate: 44100,
      latencyHint: 'playback' // Optimize for lowest latency playback
    });
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.4, this.ctx.currentTime); // Set reasonable reverb wet level for natural blend
    this.reverbNode = this.ctx.createConvolver();
    this.reverbGain.connect(this.reverbNode);
    this.reverbNode.connect(this.masterGain);
    this.generateReverbImpulse();
    
    // Handle AudioContext state changes with auto-recovery for live performance
    this.stateChangeHandler = () => {
      if (this.ctx.state === 'suspended') {
        console.warn("AudioContext suspended - attempting auto-resume");
        // Aggressively attempt to resume for live performance
        this.ctx.resume().catch(err => {
          console.error("Failed to auto-resume AudioContext:", err);
          // Retry after short delay
          setTimeout(() => {
            if (this.ctx.state === 'suspended') {
              this.ctx.resume().catch(e => console.error("Retry resume failed:", e));
            }
          }, 100);
        });
      } else if (this.ctx.state === 'interrupted') {
        console.warn("AudioContext interrupted - will auto-resume");
        // Auto-resume after interruption
        setTimeout(() => {
          if (this.ctx.state === 'interrupted') {
            this.ctx.resume().catch(err => console.error("Failed to resume after interruption:", err));
          }
        }, 100);
      } else if (this.ctx.state === 'closed') {
        console.error("AudioContext closed - cannot recover");
      }
    };
    this.ctx.addEventListener('statechange', this.stateChangeHandler);
  }

  destroy() {
    // Remove event listener to prevent memory leak
    this.ctx.removeEventListener('statechange', this.stateChangeHandler);
    this.stopAll();
  }

  getAnalyser(): AnalyserNode | null {
    // Lazy initialization: only create analyser when needed
    if (!this.analyser) {
      try {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.analyser.smoothingTimeConstant = 0.75;
        this.analyser.fftSize = 512;
        // Connect analyser to masterGain in parallel (passive tap)
        // This does NOT interrupt the existing masterGain -> destination connection
        this.masterGain.connect(this.analyser);
      } catch (e) {
        console.error("Failed to create analyser:", e);
        return null;
      }
    }
    return this.analyser;
  }

  getStereoAnalysers(): { left: AnalyserNode | null; right: AnalyserNode | null } {
    // Lazy initialization: create stereo analysers when needed
    if (!this.leftAnalyser || !this.rightAnalyser) {
      try {
        // Create channel splitter to separate left and right channels
        const splitter = this.ctx.createChannelSplitter(2);
        this.masterGain.connect(splitter);

        // Create separate analysers for left and right channels
        this.leftAnalyser = this.ctx.createAnalyser();
        this.leftAnalyser.minDecibels = -90;
        this.leftAnalyser.maxDecibels = -10;
        this.leftAnalyser.smoothingTimeConstant = 0.75;
        this.leftAnalyser.fftSize = 512;

        this.rightAnalyser = this.ctx.createAnalyser();
        this.rightAnalyser.minDecibels = -90;
        this.rightAnalyser.maxDecibels = -10;
        this.rightAnalyser.smoothingTimeConstant = 0.75;
        this.rightAnalyser.fftSize = 512;

        // Connect splitter outputs to respective analysers
        // Channel 0 = left, Channel 1 = right
        splitter.connect(this.leftAnalyser, 0);
        splitter.connect(this.rightAnalyser, 1);
      } catch (e) {
        console.error("Failed to create stereo analysers:", e);
        return { left: null, right: null };
      }
    }
    return { left: this.leftAnalyser, right: this.rightAnalyser };
  }

  private generateReverbImpulse() {
    // High-quality reverb: 3-second decay with realistic room simulation
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 3.0); // 3 seconds for natural decay
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    
    // Generate realistic stereo reverb with early reflections and late tail
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      
      // Clear buffer
      for (let i = 0; i < length; i++) {
        channelData[i] = 0;
      }
      
      // Early reflections (first 50ms) - discrete echoes for spatial realism
      const earlyReflections = [
        { delay: Math.floor(sampleRate * 0.003), gain: 0.6 }, // 3ms
        { delay: Math.floor(sampleRate * 0.008), gain: 0.45 }, // 8ms
        { delay: Math.floor(sampleRate * 0.015), gain: 0.35 }, // 15ms
        { delay: Math.floor(sampleRate * 0.023), gain: 0.28 }, // 23ms
        { delay: Math.floor(sampleRate * 0.032), gain: 0.22 }, // 32ms
        { delay: Math.floor(sampleRate * 0.042), gain: 0.18 }, // 42ms
      ];
      
      // Add early reflections with slight randomization for stereo width
      earlyReflections.forEach((reflection, idx) => {
        const delay = reflection.delay + (channel === 0 ? idx * 2 : -idx * 2); // Stereo offset
        if (delay < length) {
          const noise = (Math.random() * 2 - 1) * 0.3;
          channelData[delay] += reflection.gain * (1 + noise);
        }
      });
      
      // Main reverb tail - smooth exponential decay with filtered noise
      // Use multiple decay components for richness
      const decayTime = length;
      const fadeStart = Math.floor(sampleRate * 0.1); // Start main tail after early reflections
      
      for (let i = fadeStart; i < length; i++) {
        const t = (i - fadeStart) / (decayTime - fadeStart);
        
        // Exponential decay with slight variation
        const decay = Math.pow(1 - t, 1.8); // Slightly steeper than linear for natural sound
        
        // High-quality filtered noise (low-pass for warmth)
        const noise = (Math.random() * 2 - 1);
        const filteredNoise = noise * (1 - t * 0.7); // High frequencies decay faster
        
        // Add subtle modulation for movement
        const modulation = Math.sin(i * 0.0001 + channel * Math.PI) * 0.1 * (1 - t);
        
        // Combine components with channel-specific phase for stereo width
        channelData[i] += filteredNoise * decay * (1 + modulation) * (channel === 0 ? 0.95 : 1.05);
      }
      
      // Apply gentle low-pass filtering to reduce harshness in the tail
      for (let i = fadeStart; i < length - 1; i++) {
        channelData[i] = channelData[i] * 0.7 + channelData[i + 1] * 0.3;
      }
      
      // Normalize to prevent clipping
      let max = 0;
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > max) max = abs;
      }
      if (max > 0.95) {
        const scale = 0.95 / max;
        for (let i = 0; i < length; i++) {
          channelData[i] *= scale;
        }
      }
    }
    
    this.reverbNode.buffer = impulse;
  }

  async resume() {
    // Aggressively resume AudioContext - critical for live performance
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
        // If still not running after resume attempt, log warning
        if (this.ctx.state !== 'running') {
          console.warn(`AudioContext state after resume: ${this.ctx.state}`);
        }
      } catch (e) {
        console.error("Failed to resume AudioContext:", e);
        // Retry once after short delay
        setTimeout(async () => {
          if (this.ctx.state !== 'running') {
            try {
              await this.ctx.resume();
            } catch (retryErr) {
              console.error("Retry resume failed:", retryErr);
            }
          }
        }, 50);
      }
    }
  }

  async decode(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    try {
      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error("Failed to decode audio data:", e);
      throw new Error(`Audio decoding failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  private createReversedRegionBuffer(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
    // Cache reversed buffers to avoid recreating them
    const cacheKey = `${start.toFixed(6)}-${end.toFixed(6)}`;
    let bufferCache = this.reversedBufferCache.get(buffer);
    
    if (!bufferCache) {
      bufferCache = new Map();
      this.reversedBufferCache.set(buffer, bufferCache);
    }
    
    // Return cached buffer if available
    if (bufferCache.has(cacheKey)) {
      return bufferCache.get(cacheKey)!;
    }
    
    // Reverse only the selected region [start, end], not the entire buffer
    // This creates a small buffer containing just the reversed region
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const regionLength = endSample - startSample;
    
    if (regionLength <= 0) {
      throw new Error("Invalid region: start must be less than end");
    }
    
    const reversed = this.ctx.createBuffer(buffer.numberOfChannels, regionLength, sampleRate);
    
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      const channelData = buffer.getChannelData(i);
      const reversedData = reversed.getChannelData(i);
      
      // Copy the region backwards: original[end-1] -> reversed[0], original[start] -> reversed[regionLength-1]
      for (let j = 0; j < regionLength; j++) {
        const originalIndex = endSample - 1 - j; // Read backwards from end
        reversedData[j] = channelData[originalIndex];
      }
    }
    
    // Cache the reversed buffer
    bufferCache.set(cacheKey, reversed);
    return reversed;
  }

  private trackTrigger(trigger: TriggerInfo, chokeGroupId: string | null) {
    this.activeTriggers.add(trigger);
    if (chokeGroupId) this.exclusiveTriggers.set(chokeGroupId, trigger);
    trigger.source.onended = () => {
      this.activeTriggers.delete(trigger);
      if (chokeGroupId && this.exclusiveTriggers.get(chokeGroupId) === trigger) {
        this.exclusiveTriggers.delete(chokeGroupId);
      }
    };
  }

  stopAll() {
    this.activeTriggers.forEach(t => {
      try {
        // Disconnect all nodes in the chain to ensure complete cleanup
        t.source.disconnect();
        t.nodes.filter.disconnect();
        t.nodes.panner.disconnect();
        t.nodes.gain.disconnect();
        t.nodes.reverbSend.disconnect();
        t.source.stop();
      } catch (e) {
        // Ignore errors from nodes that may already be disconnected
      }
    });
    this.activeTriggers.clear();
    this.exclusiveTriggers.clear();
    this.metronomeOscillators.forEach(o => {
      try { o.stop(); o.disconnect(); } catch (e) {}
    });
    this.metronomeOscillators.clear();
  }

  stopExclusiveScheduled(time: number, chokeGroupId: string) {
    const t = this.exclusiveTriggers.get(chokeGroupId);
    if (t) this.scheduleStop(t, time);
  }

  private scheduleStop(t: TriggerInfo, time: number) {
    if (this.scheduledStopTimes.has(t.source)) return;
    try {
      t.nodes.gain.gain.cancelScheduledValues(time);
      t.nodes.gain.gain.setValueAtTime(t.nodes.gain.gain.value, time);
      t.nodes.gain.gain.linearRampToValueAtTime(0, time + 0.005);
      t.source.stop(time + 0.01);
      this.scheduledStopTimes.set(t.source, time + 0.01);
    } catch (e) {}
  }

  private buildSignalChain(pad: PadConfig, time: number, playbackDuration: number, context: BaseAudioContext, isLooping: boolean = false) {
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const filter = context.createBiquadFilter();
    const reverbSend = context.createGain();

    // Extract envelope parameters with backward-compatible defaults
    const attack = Math.max(0.001, pad.attack);
    const decay = Math.max(0, pad.decay ?? 0); // Default 0 for instant transition (backward compatible)
    const sustain = Math.max(0, Math.min(1, pad.sustain ?? 1)); // Default 1 (full level, backward compatible)
    const release = Math.max(0.005, pad.release);
    
    // Calculate envelope stages
    const peakLevel = pad.volume; // Peak after attack
    const sustainLevel = peakLevel * sustain; // Level after decay
    
    // AMP ENVELOPE - Full ADSR implementation
    gain.gain.setValueAtTime(0, time);
    
    // Attack phase: 0 -> peakLevel
    gain.gain.linearRampToValueAtTime(peakLevel, time + attack);
    
    const attackEndTime = time + attack;

    if (!isLooping) {
      // Decay phase: peakLevel -> sustainLevel (if decay > 0 and sustain < 1)
      const decayEndTime = attackEndTime + decay;
      if (decay > 0 && sustain < 1) {
        gain.gain.linearRampToValueAtTime(sustainLevel, decayEndTime);
      } else {
        // If no decay or sustain at peak, hold at peak/sustain
        gain.gain.setValueAtTime(sustainLevel, attackEndTime);
      }
      
      // Sustain phase: hold at sustainLevel until release starts
      const adsDuration = attack + decay; // Total AD + S time
      const releaseStartTime = time + playbackDuration - Math.min(release, Math.max(0, playbackDuration - adsDuration));
      
      // Ensure we have a sustain phase before release
      const actualReleaseStart = Math.max(attackEndTime + decay, releaseStartTime);
      
      // Hold at sustain level until release
      if (actualReleaseStart > attackEndTime + decay) {
        gain.gain.setValueAtTime(sustainLevel, Math.max(attackEndTime + decay, actualReleaseStart));
      }
      
      // Release phase: sustainLevel -> 0
      gain.gain.linearRampToValueAtTime(0, time + playbackDuration);
    } else {
      // For looping, use simplified envelope: Attack -> Sustain, no release
      if (decay > 0 && sustain < 1) {
        gain.gain.linearRampToValueAtTime(sustainLevel, attackEndTime + decay);
      } else {
        gain.gain.setValueAtTime(sustainLevel, attackEndTime);
      }
    }

    // FILTER - Switchable type with envelope modulation
    const filterType = pad.filterType ?? 'lowpass'; // Backward compatible default
    filter.type = filterType;
    
    // Base cutoff frequency
    const baseCutoff = Math.max(20, Math.min(20000, pad.cutoff));
    
    // Filter envelope amount (bipolar: negative closes, positive opens)
    const filterEnvAmount = pad.filterEnv ?? 0; // Default 0 (no modulation, backward compatible)
    
    if (filterEnvAmount === 0 || isLooping) {
      // No filter envelope or looping mode: static filter
      filter.frequency.setValueAtTime(baseCutoff, time);
    } else {
      // Filter envelope follows AMP envelope shape
      // At attack start: cutoff is baseCutoff
      // During attack: modulate cutoff based on filterEnvAmount
      // At decay/sustain: modulate based on envelope position
      
      // Calculate filter modulation range (musical, not linear)
      const maxModHz = filterEnvAmount > 0 
        ? Math.min(20000 - baseCutoff, baseCutoff * 0.8) // Positive: open up
        : Math.min(baseCutoff - 20, baseCutoff * 0.8); // Negative: close down
      
      const modDepth = Math.abs(filterEnvAmount); // 0-1 range
      
      // At attack start: no modulation (at base cutoff)
      filter.frequency.setValueAtTime(baseCutoff, time);
      
      // During attack: filter opens/closes with envelope to peak modulation
      const attackModFreq = baseCutoff + (maxModHz * modDepth); // At peak of attack
      filter.frequency.linearRampToValueAtTime(attackModFreq, attackEndTime);
      
      if (!isLooping && decay > 0) {
        const decayEndTime = attackEndTime + decay;
        // During decay: filter follows envelope proportionally to sustain level
        const sustainModFreq = baseCutoff + (maxModHz * modDepth * sustain); // sustain is 0-1 ratio
        filter.frequency.linearRampToValueAtTime(sustainModFreq, decayEndTime);
        
        // Hold filter at sustain modulation during sustain phase
        const releaseStartTime = time + playbackDuration - Math.min(release, Math.max(0, playbackDuration - (attack + decay)));
        filter.frequency.setValueAtTime(sustainModFreq, Math.max(decayEndTime, releaseStartTime));
        
        // During release: filter returns to base
        filter.frequency.linearRampToValueAtTime(baseCutoff, time + playbackDuration);
      } else if (!isLooping) {
        // No decay: filter holds during sustain, returns during release
        const releaseStartTime = time + playbackDuration - Math.min(release, Math.max(0, playbackDuration - attack));
        filter.frequency.setValueAtTime(attackModFreq, Math.max(attackEndTime, releaseStartTime));
        filter.frequency.linearRampToValueAtTime(baseCutoff, time + playbackDuration);
      }
    }
    
    // Resonance: Cap at 15 to avoid harsh self-oscillation
    filter.Q.setValueAtTime(Math.max(0, Math.min(15, pad.resonance)), time);
    
    // Panning
    panner.pan.setValueAtTime(pad.pan, time);
    
    // Reverb send (post-filter, post-pan)
    reverbSend.gain.setValueAtTime(pad.reverbSend, time);

    // Signal chain: Filter -> Pan -> Gain -> [Master + Reverb Send]
    filter.connect(panner);
    panner.connect(gain);
    
    if (context instanceof AudioContext) {
        gain.connect(this.masterGain);
        gain.connect(reverbSend);
        reverbSend.connect(this.reverbGain);
    } else {
        gain.connect(context.destination);
    }

    return { gain, panner, filter, reverbSend };
  }

  playPad(buffer: AudioBuffer, pad: PadConfig, offsetOverride?: number, contextId: string = 'global', isLooping: boolean = false): TriggerInfo {
    // Aggressive resume before every playback for live performance reliability
    if (this.ctx.state !== 'running') {
      this.resume();
    }
    
    // Performance monitoring: detect potential dropouts
    const now = performance.now();
    if (this.lastPlayTime > 0) {
      const gap = now - this.lastPlayTime;
      const dropoutThreshold = 100; // 100ms threshold for dropout detection
      if (gap > dropoutThreshold) {
        console.warn(`Potential audio dropout detected: ${gap.toFixed(2)}ms gap since last playback`);
      }
    }
    this.lastPlayTime = now;
    
    // For preview (offsetOverride), allow playback from anywhere in the buffer
    // For normal playback, use pad start/end constraints
    // When looping is enabled, always use pad's start/end region, not preview offset
    const playStart = (isLooping || offsetOverride === undefined) ? pad.start : offsetOverride;
    const playEnd = (isLooping || offsetOverride === undefined) ? pad.end : buffer.duration;
    
    // Validate pad configuration for normal playback and looping
    if (offsetOverride === undefined || isLooping) {
      if (pad.end <= pad.start || pad.end - pad.start < 0.001) {
        console.error("Invalid pad configuration: end must be greater than start");
        throw new Error("Invalid pad configuration");
      }
    }
    
    // Validate preview offset is within buffer bounds and has valid duration (only for non-looping preview)
    if (offsetOverride !== undefined && !isLooping) {
      if (playStart < 0 || playStart >= buffer.duration) {
        console.error("Invalid preview offset: must be within buffer duration");
        throw new Error("Invalid preview offset");
      }
      if (playEnd - playStart < 0.001) {
        console.error("Invalid preview offset: insufficient duration remaining");
        throw new Error("Invalid preview offset");
      }
    }
    
    const triggerTime = this.ctx.currentTime;
    this.stopExclusiveScheduled(triggerTime, contextId);

    const chokeGroupId = pad.playMode === 'MONO' ? contextId : null;

    // For reversed playback, reverse only the selected region
    let adjustedPlayStart = playStart;
    let adjustedPlayEnd = playEnd;
    let activeBuffer = buffer;
    
    if (pad.isReversed) {
      // Create a reversed buffer containing only the selected region (no caching)
      // playStart/playEnd are already set correctly (pad.start/pad.end when looping)
      activeBuffer = this.createReversedRegionBuffer(buffer, playStart, playEnd);
      // In the reversed region buffer, we play from 0 to (playEnd - playStart)
      adjustedPlayStart = 0;
      adjustedPlayEnd = playEnd - playStart;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = activeBuffer;
    const rate = Math.pow(2, (pad.tune || 0) / 12);
    if (rate <= 0) {
      console.error("Invalid playback rate:", rate);
      throw new Error("Invalid playback rate");
    }
    source.playbackRate.value = rate;
    source.detune.value = pad.fineTune || 0;

    // Total duration in physical seconds, relative to current playback rate
    const playbackDuration = (adjustedPlayEnd - adjustedPlayStart) / rate;

    const nodes = this.buildSignalChain(pad, triggerTime, playbackDuration, this.ctx, isLooping);
    source.connect(nodes.filter);
    
    if (isLooping) {
      source.loop = true;
      // For looping, set loop points in seconds relative to buffer start (0)
      // The buffer is either the original (for forward) or reversed region (for reverse)
      const bufferDuration = activeBuffer.duration;
      // For reversed playback: loopStart=0, loopEnd=regionDuration (buffer duration)
      // For forward playback: loopStart=start, loopEnd=end (both within original buffer)
      source.loopStart = Math.max(0, adjustedPlayStart);
      // Ensure loopEnd equals exactly the buffer duration for reversed region buffer
      // For forward, ensure it doesn't exceed buffer duration
      source.loopEnd = pad.isReversed 
        ? bufferDuration  // For reversed region buffer, loop the entire buffer
        : Math.min(bufferDuration, adjustedPlayEnd);  // For forward, clamp to buffer
      // Start playback at the loop start position
      source.start(triggerTime, adjustedPlayStart);
      // Don't call stop() for looping - it will loop indefinitely between loopStart and loopEnd
    } else {
      // Hardware stop: strictly limit playback to the selected region
      // Using source.stop and the 3rd arg of start to ensure zero leakage
      source.start(triggerTime, adjustedPlayStart, adjustedPlayEnd - adjustedPlayStart);
      source.stop(triggerTime + playbackDuration);
    }
    
    const trigger = { 
        startTime: triggerTime, 
        offset: adjustedPlayStart, 
        duration: isLooping ? Infinity : playbackDuration, 
        rate, 
        isReversed: pad.isReversed, 
        release: pad.release,
        originalStart: playStart, // Original start position for playhead calculation
        originalEnd: playEnd, // Original end position for playhead calculation
        source, 
        padId: pad.id, 
        chokeGroupId, 
        nodes 
    };
    this.trackTrigger(trigger, chokeGroupId);
    return trigger;
  }

  playPadScheduled(buffer: AudioBuffer, pad: PadConfig, time: number, contextId: string): TriggerInfo {
    // Ensure AudioContext is running before scheduled playback
    if (this.ctx.state !== 'running') {
      this.resume();
    }
    
    this.stopExclusiveScheduled(time, contextId);
    const chokeGroupId = pad.playMode === 'MONO' ? contextId : null;

    // For reversed playback, reverse only the selected region
    let adjustedPlayStart = pad.start;
    let adjustedPlayEnd = pad.end;
    let activeBuffer = buffer;
    
    if (pad.isReversed) {
      // Create a reversed buffer containing only the selected region (no caching)
      activeBuffer = this.createReversedRegionBuffer(buffer, pad.start, pad.end);
      // In the reversed region buffer, we play from 0 to (end - start)
      adjustedPlayStart = 0;
      adjustedPlayEnd = pad.end - pad.start;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = activeBuffer;
    const rate = Math.pow(2, (pad.tune || 0) / 12);
    source.playbackRate.value = rate;
    source.detune.value = pad.fineTune || 0;

    const playbackDuration = (adjustedPlayEnd - adjustedPlayStart) / rate;

    const nodes = this.buildSignalChain(pad, time, playbackDuration, this.ctx);
    source.connect(nodes.filter);
    
    source.start(time, adjustedPlayStart, adjustedPlayEnd - adjustedPlayStart);
    source.stop(time + playbackDuration);
    
    const trigger = { 
        startTime: time, 
        offset: adjustedPlayStart, 
        duration: playbackDuration, 
        rate, 
        isReversed: pad.isReversed, 
        release: pad.release,
        originalStart: pad.start, // Original start position for playhead calculation
        originalEnd: pad.end, // Original end position for playhead calculation
        source, 
        padId: pad.id, 
        chokeGroupId, 
        nodes 
    };
    this.trackTrigger(trigger, chokeGroupId);
    return trigger;
  }

  playMetronome(time: number, isDownbeat: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    // Use a StereoPannerNode with pan=0 to ensure mono oscillator goes to both channels
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(0, time); // Center pan = both channels
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);
    env.gain.setValueAtTime(0.1, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(env);
    env.connect(panner);
    panner.connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.05);
    this.metronomeOscillators.add(osc);
    osc.onended = () => this.metronomeOscillators.delete(osc);
  }

  stopMetronome() {
    this.metronomeOscillators.forEach(o => {
      try { o.stop(); o.disconnect(); } catch (e) {}
    });
    this.metronomeOscillators.clear();
  }

  async exportWAV(steps: SongStep[], patterns: Pattern[], tempo: number, pads: PadConfig[], samples: SampleData[]): Promise<Blob> {
    const beatDur = 60 / tempo;
    let totalDur = 0;
    steps.forEach(s => {
        const activePats = s.activePatternIds.map(id => patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
        const maxDur = activePats.reduce((max, p) => Math.max(max, p.bars * 4 * beatDur), 0);
        totalDur += maxDur * s.repeats;
    });

    if (totalDur === 0) return new Blob();
    
    const padding = 0.05;
    const offlineCtx = new OfflineAudioContext(2, Math.floor((totalDur + padding + 1) * 44100), 44100);
    const offReverb = offlineCtx.createConvolver();
    offReverb.buffer = this.reverbNode.buffer;
    offReverb.connect(offlineCtx.destination);

    let currentOffset = padding;
    for (const step of steps) {
      const activePats = step.activePatternIds.map(id => patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
      const stepBaseDur = activePats.reduce((max, p) => Math.max(max, p.bars * 4 * beatDur), 0);
      for (let r = 0; r < step.repeats; r++) {
        for (const pattern of activePats) {
          for (const hit of pattern.hits) {
            const pad = pads.find(p => p.id === hit.padId);
            const sample = samples.find(s => s.id === pad?.sampleId);
            if (!pad || !sample) continue;
            const absoluteHitTime = currentOffset + (r * stepBaseDur) + (hit.beatOffset * beatDur);
            const rate = Math.pow(2, (pad.tune || 0) / 12);
            
            // For reversed playback, reverse only the selected region
            let adjustedPlayStart = pad.start;
            let adjustedPlayEnd = pad.end;
            let activeBuffer = sample.buffer;
            
            if (pad.isReversed) {
              // Create a reversed buffer containing only the selected region (no caching)
              activeBuffer = this.createReversedRegionBuffer(sample.buffer, pad.start, pad.end);
              // In the reversed region buffer, we play from 0 to (end - start)
              adjustedPlayStart = 0;
              adjustedPlayEnd = pad.end - pad.start;
            }
            
            const playbackDuration = (adjustedPlayEnd - adjustedPlayStart) / rate;
            
            // Extract envelope parameters with backward-compatible defaults
            const attack = Math.max(0.001, pad.attack);
            const decay = Math.max(0, pad.decay ?? 0);
            const sustain = Math.max(0, Math.min(1, pad.sustain ?? 1));
            const release = Math.max(0.005, pad.release);
            
            const peakLevel = pad.volume;
            const sustainLevel = peakLevel * sustain;

            const offGain = offlineCtx.createGain();
            const offPan = offlineCtx.createStereoPanner();
            const offFilt = offlineCtx.createBiquadFilter();
            const offRevSend = offlineCtx.createGain();

            // Filter setup
            const filterType = pad.filterType ?? 'lowpass';
            offFilt.type = filterType;
            const baseCutoff = Math.max(20, Math.min(20000, pad.cutoff));
            const filterEnvAmount = pad.filterEnv ?? 0;
            
            // AMP ENVELOPE - Full ADSR
            offGain.gain.setValueAtTime(0, absoluteHitTime);
            offGain.gain.linearRampToValueAtTime(peakLevel, absoluteHitTime + attack);
            
            const attackEndTime = absoluteHitTime + attack;
            const decayEndTime = attackEndTime + decay;
            
            if (decay > 0 && sustain < 1) {
              offGain.gain.linearRampToValueAtTime(sustainLevel, decayEndTime);
            } else {
              offGain.gain.setValueAtTime(sustainLevel, attackEndTime);
            }
            
            const adsDuration = attack + decay;
            const releaseStartTime = absoluteHitTime + playbackDuration - Math.min(release, Math.max(0, playbackDuration - adsDuration));
            const actualReleaseStart = Math.max(decayEndTime, releaseStartTime);
            
            offGain.gain.setValueAtTime(sustainLevel, actualReleaseStart);
            offGain.gain.linearRampToValueAtTime(0, absoluteHitTime + playbackDuration);
            
            // FILTER with envelope modulation
            if (filterEnvAmount === 0) {
              offFilt.frequency.setValueAtTime(baseCutoff, absoluteHitTime);
            } else {
              const maxModHz = filterEnvAmount > 0 
                ? Math.min(20000 - baseCutoff, baseCutoff * 0.8)
                : Math.min(baseCutoff - 20, baseCutoff * 0.8);
              const modDepth = Math.abs(filterEnvAmount);
              
              offFilt.frequency.setValueAtTime(baseCutoff, absoluteHitTime);
              const attackModFreq = baseCutoff + (maxModHz * modDepth);
              offFilt.frequency.linearRampToValueAtTime(attackModFreq, attackEndTime);
              
              if (decay > 0) {
                // During decay: filter follows envelope proportionally to sustain level
                const sustainModFreq = baseCutoff + (maxModHz * modDepth * sustain); // sustain is 0-1 ratio
                offFilt.frequency.linearRampToValueAtTime(sustainModFreq, decayEndTime);
                offFilt.frequency.setValueAtTime(sustainModFreq, actualReleaseStart);
                offFilt.frequency.linearRampToValueAtTime(baseCutoff, absoluteHitTime + playbackDuration);
              } else {
                // No decay: filter holds at attack modulation during sustain, returns during release
                offFilt.frequency.setValueAtTime(attackModFreq, actualReleaseStart);
                offFilt.frequency.linearRampToValueAtTime(baseCutoff, absoluteHitTime + playbackDuration);
              }
            }
            
            offFilt.Q.setValueAtTime(Math.max(0, Math.min(15, pad.resonance)), absoluteHitTime);
            offPan.pan.setValueAtTime(pad.pan, absoluteHitTime);
            offRevSend.gain.setValueAtTime(pad.reverbSend, absoluteHitTime);

            const source = offlineCtx.createBufferSource();
            source.buffer = activeBuffer;
            source.playbackRate.value = rate;
            source.connect(offFilt); offFilt.connect(offPan); offPan.connect(offGain); 
            offGain.connect(offlineCtx.destination); offGain.connect(offRevSend); offRevSend.connect(offReverb);
            
            // Use remapped positions (already calculated above)
            source.start(absoluteHitTime, adjustedPlayStart, adjustedPlayEnd - adjustedPlayStart);
            source.stop(absoluteHitTime + playbackDuration);
          }
        }
      }
      currentOffset += stepBaseDur * step.repeats;
    }

    const rendered = await offlineCtx.startRendering();
    return this.encodeWAV(rendered, true); // Use high quality 32-bit float
  }

  private encodeWAV(buffer: AudioBuffer, useHighQuality: boolean = true): Blob {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    
    if (useHighQuality) {
      // 32-bit float WAV (highest quality)
      // Header structure: RIFF (12) + fmt chunk (26: "fmt " + size + 18 bytes data) + data header (8) = 46 bytes
      const bytesPerSample = 4;
      const dataLength = buffer.length * numOfChan * bytesPerSample;
      const headerSize = 46; // RIFF (12) + fmt (26) + data header (8)
      const length = dataLength + headerSize;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
      let pos = 0;
      
      const writeString = (s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i));
      };
      
      // RIFF header (12 bytes)
      writeString('RIFF');
      view.setUint32(pos, length - 8, true); pos += 4;
      writeString('WAVE');
      
      // fmt chunk (26 bytes total: "fmt " + size + 18 bytes of data)
      writeString('fmt ');
      view.setUint32(pos, 18, true); pos += 4; // fmt chunk size
      view.setUint16(pos, 3, true); pos += 2; // Format tag (3 = IEEE float)
      view.setUint16(pos, numOfChan, true); pos += 2;
      view.setUint32(pos, sampleRate, true); pos += 4;
      view.setUint32(pos, sampleRate * numOfChan * bytesPerSample, true); pos += 4; // Byte rate
      view.setUint16(pos, numOfChan * bytesPerSample, true); pos += 2; // Block align
      view.setUint16(pos, 32, true); pos += 2; // Bits per sample
      view.setUint16(pos, 0, true); pos += 2; // Extension size
      
      // data chunk header (8 bytes)
      writeString('data');
      view.setUint32(pos, dataLength, true); pos += 4;
      
      // Write audio data as 32-bit float
      for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
          const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
          view.setFloat32(pos, sample, true);
          pos += 4;
        }
      }
      
      return new Blob([bufferArr], { type: 'audio/wav' });
    } else {
      // Original 16-bit encoding (for backward compatibility if needed)
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
    let pos = 0;
      const writeString = (s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i));
      };
      writeString('RIFF');
      view.setUint32(pos, length - 8, true); pos += 4;
      writeString('WAVEfmt ');
      view.setUint32(pos, 16, true); pos += 4;
      view.setUint16(pos, 1, true); pos += 2;
      view.setUint16(pos, numOfChan, true); pos += 2;
      view.setUint32(pos, sampleRate, true); pos += 4;
      view.setUint32(pos, sampleRate * 2 * numOfChan, true); pos += 4;
      view.setUint16(pos, numOfChan * 2, true); pos += 2;
      view.setUint16(pos, 16, true); pos += 2;
      writeString('data');
      view.setUint32(pos, length - pos - 4, true); pos += 4;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        let sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
          view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          pos += 2;
        }
      }
      return new Blob([bufferArr], { type: 'audio/wav' });
    }
  }

  async exportStems(
    steps: SongStep[],
    patterns: Pattern[],
    tempo: number,
    pads: PadConfig[],
    samples: SampleData[]
  ): Promise<Blob> {
    const beatDur = 60 / tempo;
    
    // Calculate total song duration
    let totalDur = 0;
    steps.forEach(step => {
      const activePats = step.activePatternIds
        .map(id => patterns.find(p => p.id === id))
        .filter(Boolean) as Pattern[];
      const maxDur = activePats.reduce((max, p) => Math.max(max, p.bars * 4 * beatDur), 0);
      totalDur += maxDur * step.repeats;
    });
    
    if (totalDur === 0) return new Blob();
    
    // Get unique pattern IDs from arrangement
    const uniquePatternIds = new Set<string>();
    steps.forEach(step => {
      step.activePatternIds.forEach(id => uniquePatternIds.add(id));
    });
    
    const stems: Array<{ filename: string; audio: Blob }> = [];
    
    // Render each pattern as a stem
    for (const patternId of uniquePatternIds) {
      const pattern = patterns.find(p => p.id === patternId);
      if (!pattern) continue;
      
      const stemBlob = await this.renderPatternStem(
        pattern,
        steps,
        patterns,
        tempo,
        pads,
        samples,
        totalDur
      );
      
      // Sanitize pattern name for filename
      const safeName = pattern.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      stems.push({
        filename: `${safeName}_Stem.wav`,
        audio: stemBlob
      });
    }
    
    // Create ZIP file with stems and metadata
    // Load JSZip using shim that handles CDN loading
    const loadJSZip = (await import('./jszip-shim')).default;
    let JSZip;
    try {
      JSZip = await loadJSZip();
    } catch (error) {
      throw error;
    }
    const zip = new JSZip();
    
    // Add stem files
    stems.forEach(stem => {
      zip.file(`stems/${stem.filename}`, stem.audio);
    });
    
    // Add metadata
    const metadata = {
      tempo,
      totalDuration: totalDur,
      arrangement: steps.map(step => ({
        name: step.name,
        patternIds: step.activePatternIds,
        repeats: step.repeats
      })),
      patterns: patterns
        .filter(p => uniquePatternIds.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          bars: p.bars
        }))
    };
    
    zip.file('arrangement.json', JSON.stringify(metadata, null, 2));
    
    // Add README
    const readme = `XEHPA STEMS EXPORT
==================

Import Instructions:
1. Extract all files from this ZIP
2. Import all WAV files from the 'stems' folder into your DAW
3. Place all stems at the beginning of the timeline (0:00)
4. All stems are synchronized and aligned according to the arrangement
5. Each stem represents one pattern, positioned at all its arrangement locations

Tempo: ${tempo} BPM
Total Duration: ${totalDur.toFixed(2)} seconds

For arrangement details, see arrangement.json`;
    
    zip.file('README.txt', readme);
    
    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return zipBlob;
  }

  private async renderPatternStem(
    targetPattern: Pattern,
    steps: SongStep[],
    allPatterns: Pattern[],
    tempo: number,
    pads: PadConfig[],
    samples: SampleData[],
    totalDuration: number
  ): Promise<Blob> {
    const beatDur = 60 / tempo;
    const sampleRate = 44100;
    const padding = 0.1; // Small padding at end for reverb tails
    const offlineCtx = new OfflineAudioContext(2, Math.ceil((totalDuration + padding) * sampleRate), sampleRate);
    
    // Set up reverb (same as main export)
    const offReverb = offlineCtx.createConvolver();
    offReverb.buffer = this.reverbNode.buffer;
    offReverb.connect(offlineCtx.destination);
    
    // Find all positions where this pattern appears
    let currentTime = 0;
    
    for (const step of steps) {
      const stepPatterns = step.activePatternIds
        .map(id => allPatterns.find(p => p.id === id))
        .filter(Boolean) as Pattern[];
      
      const stepDuration = stepPatterns.reduce((max, p) => 
        Math.max(max, p.bars * 4 * beatDur), 0
      );
      
      // Check if our target pattern is in this step
      if (step.activePatternIds.includes(targetPattern.id)) {
        // Render this pattern at all its repeat positions
        for (let repeat = 0; repeat < step.repeats; repeat++) {
          const patternStartTime = currentTime + (repeat * stepDuration);
          
          // Render one cycle of the pattern
          targetPattern.hits.forEach(hit => {
            const pad = pads.find(p => p.id === hit.padId);
            const sample = samples.find(s => s.id === pad?.sampleId);
            if (!pad || !sample) return;
            
            const absoluteHitTime = patternStartTime + (hit.beatOffset * beatDur);
            const rate = Math.pow(2, (pad.tune || 0) / 12);
            
            // Handle reversed playback
            let adjustedPlayStart = pad.start;
            let adjustedPlayEnd = pad.end;
            let activeBuffer = sample.buffer;
            
            if (pad.isReversed) {
              activeBuffer = this.createReversedRegionBuffer(sample.buffer, pad.start, pad.end);
              adjustedPlayStart = 0;
              adjustedPlayEnd = pad.end - pad.start;
            }
            
            const playbackDuration = (adjustedPlayEnd - adjustedPlayStart) / rate;
            
            // Extract envelope parameters
            const attack = Math.max(0.001, pad.attack);
            const decay = Math.max(0, pad.decay ?? 0);
            const sustain = Math.max(0, Math.min(1, pad.sustain ?? 1));
            const release = Math.max(0.005, pad.release);
            const peakLevel = pad.volume;
            const sustainLevel = peakLevel * sustain;
            
            // Create audio nodes
            const offGain = offlineCtx.createGain();
            const offPan = offlineCtx.createStereoPanner();
            const offFilt = offlineCtx.createBiquadFilter();
            const offRevSend = offlineCtx.createGain();
            
            // Filter setup
            const filterType = pad.filterType ?? 'lowpass';
            offFilt.type = filterType;
            const baseCutoff = Math.max(20, Math.min(20000, pad.cutoff));
            const filterEnvAmount = pad.filterEnv ?? 0;
            
            // AMP ENVELOPE
            offGain.gain.setValueAtTime(0, absoluteHitTime);
            offGain.gain.linearRampToValueAtTime(peakLevel, absoluteHitTime + attack);
            
            const attackEndTime = absoluteHitTime + attack;
            const decayEndTime = attackEndTime + decay;
            
            if (decay > 0 && sustain < 1) {
              offGain.gain.linearRampToValueAtTime(sustainLevel, decayEndTime);
            } else {
              offGain.gain.setValueAtTime(sustainLevel, attackEndTime);
            }
            
            const adsDuration = attack + decay;
            const releaseStartTime = absoluteHitTime + playbackDuration - Math.min(release, Math.max(0, playbackDuration - adsDuration));
            const actualReleaseStart = Math.max(decayEndTime, releaseStartTime);
            
            offGain.gain.setValueAtTime(sustainLevel, actualReleaseStart);
            offGain.gain.linearRampToValueAtTime(0, absoluteHitTime + playbackDuration);
            
            // FILTER with envelope
            if (filterEnvAmount === 0) {
              offFilt.frequency.setValueAtTime(baseCutoff, absoluteHitTime);
            } else {
              const maxModHz = filterEnvAmount > 0
                ? Math.min(20000 - baseCutoff, baseCutoff * 0.8)
                : Math.min(baseCutoff - 20, baseCutoff * 0.8);
              const modDepth = Math.abs(filterEnvAmount);
              
              offFilt.frequency.setValueAtTime(baseCutoff, absoluteHitTime);
              const attackModFreq = baseCutoff + (maxModHz * modDepth);
              offFilt.frequency.linearRampToValueAtTime(attackModFreq, attackEndTime);
              
              if (decay > 0) {
                const sustainModFreq = baseCutoff + (maxModHz * modDepth * sustain);
                offFilt.frequency.linearRampToValueAtTime(sustainModFreq, decayEndTime);
                offFilt.frequency.setValueAtTime(sustainModFreq, actualReleaseStart);
                offFilt.frequency.linearRampToValueAtTime(baseCutoff, absoluteHitTime + playbackDuration);
              } else {
                offFilt.frequency.setValueAtTime(attackModFreq, actualReleaseStart);
                offFilt.frequency.linearRampToValueAtTime(baseCutoff, absoluteHitTime + playbackDuration);
              }
            }
            
            offFilt.Q.setValueAtTime(Math.max(0, Math.min(15, pad.resonance)), absoluteHitTime);
            offPan.pan.setValueAtTime(pad.pan, absoluteHitTime);
            offRevSend.gain.setValueAtTime(pad.reverbSend, absoluteHitTime);
            
            // Connect and play
            const source = offlineCtx.createBufferSource();
            source.buffer = activeBuffer;
            source.playbackRate.value = rate;
            source.connect(offFilt);
            offFilt.connect(offPan);
            offPan.connect(offGain);
            offGain.connect(offlineCtx.destination);
            offGain.connect(offRevSend);
            offRevSend.connect(offReverb);
            
            source.start(absoluteHitTime, adjustedPlayStart, adjustedPlayEnd - adjustedPlayStart);
            source.stop(absoluteHitTime + playbackDuration);
          });
        }
      }
      
      currentTime += stepDuration * step.repeats;
    }
    
    const rendered = await offlineCtx.startRendering();
    return this.encodeWAV(rendered, true); // High quality
  }
}

// Initialize AudioEngine with error handling
let audioEngine: AudioEngine;
try {
  audioEngine = new AudioEngine();
} catch (e) {
  console.error("Failed to initialize AudioEngine:", e);
  // If AudioEngine fails to initialize, the app can't work, but at least it won't crash silently
  throw new Error("Web Audio API initialization failed. Please refresh the page.");
}

export { audioEngine };

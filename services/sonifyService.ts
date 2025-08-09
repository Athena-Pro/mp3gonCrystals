import * as THREE from 'three';
import { bufferToWav } from './wavEncoder';

export interface SonificationParams {
    bitrate: number; // e.g., 32 to 320
    stereoMode: 'pan' | 'swirl';
    durationSecs: number;
}

export interface GeneratedGeometryData {
    geometry: THREE.BufferGeometry;
    timeSegments: number;
    freqBins: number;
}


function getQuantizationSteps(bitrate: number): number {
    // Non-linear mapping for perceived quality. Low bitrates have very few steps.
    return Math.floor(Math.pow(bitrate / 32, 1.8) + 16);
}

/**
 * The core sonification logic. Turns geometry back into an AudioBuffer.
 * Now accepts an AudioContext and a destination node to connect to.
 * @param audioContext The shared AudioContext.
 * @param destination The node to connect the output to (e.g., a master compressor).
 * @param geometryData The geometry data from the visualizer.
 * @param params Sonification parameters (bitrate, etc.).
 * @returns A promise that resolves with the generated AudioBuffer.
 */
export async function sonifyGeometry(
    audioContext: AudioContext,
    destination: AudioNode,
    geometryData: GeneratedGeometryData, 
    params: SonificationParams
): Promise<AudioBuffer> {
    const { geometry, timeSegments, freqBins } = geometryData;
    
    // Using an OfflineAudioContext allows for faster-than-realtime processing
    // and ensures the output is a clean buffer that can be played back.
    const offlineCtx = new OfflineAudioContext(2, Math.floor(params.durationSecs * audioContext.sampleRate), audioContext.sampleRate);
    const gainNode = offlineCtx.createGain();
    gainNode.connect(offlineCtx.destination);
    
    try {
        if (!geometry.attributes.position) {
            throw new Error("Geometry is missing position data.");
        }
        
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal?.array;
        const vertexCount = positions.length / 3;
        
        let effectiveTimeSegments = vertexCount !== timeSegments * freqBins ? Math.floor(Math.sqrt(vertexCount)) : timeSegments;
        let effectiveFreqBins = vertexCount !== timeSegments * freqBins ? Math.floor(vertexCount / effectiveTimeSegments) : freqBins;

        const steps = getQuantizationSteps(params.bitrate);
        const samplesPerSegment = Math.max(1, Math.floor(offlineCtx.length / effectiveTimeSegments));

        for (let t = 0; t < effectiveTimeSegments; t++) {
            const timeSliceStartVertex = t * effectiveFreqBins;
            const segmentStartTime = t * (samplesPerSegment / offlineCtx.sampleRate);
            
            // Additive synthesis for each vertex in the time slice
            for (let f = 0; f < effectiveFreqBins; f++) {
                const v = timeSliceStartVertex + f;
                if (v >= vertexCount) continue;
                
                const i = v * 3;
                
                // Quantize vertex positions based on bitrate
                const qx = Math.round(positions[i] * steps) / steps;
                const qy = Math.round(positions[i+1] * steps) / steps;
                const qz = Math.round(positions[i+2] * steps) / steps;

                // Map vertex data to oscillator params
                const freq = Math.abs(qy) * 800 + 80; // y -> frequency
                const amp = Math.pow(Math.abs(qz), 1.5) * 0.05; // z -> amplitude (non-linear)
                
                const osc = offlineCtx.createOscillator();
                osc.frequency.value = freq;
                
                const panner = offlineCtx.createStereoPanner();

                if(params.stereoMode === 'swirl' && normals) {
                   const nx = normals[i];
                   const ny = normals[i+1];
                   panner.pan.value = (Math.atan2(ny, nx) / Math.PI);
                } else {
                   const pan = (qx + 5) / 10;
                   panner.pan.value = Math.max(-1, Math.min(1, pan * 2 - 1));
                }

                const oscGain = offlineCtx.createGain();
                // Apply phase modulation via a short delay
                const delay = offlineCtx.createDelay();
                delay.delayTime.value = Math.abs(qx) * 0.001;
                osc.connect(delay);
                delay.connect(oscGain);
                
                oscGain.gain.value = amp / Math.sqrt(effectiveFreqBins); // Normalize based on number of oscillators
                oscGain.connect(panner);
                panner.connect(gainNode);

                osc.start(segmentStartTime);
                osc.stop(segmentStartTime + samplesPerSegment / offlineCtx.sampleRate);
            }
        }

        const renderedBuffer = await offlineCtx.startRendering();

        // Final normalization to prevent clipping before it hits the main compressor
        let maxAmp = 0;
        for (let chan = 0; chan < renderedBuffer.numberOfChannels; chan++) {
            const data = renderedBuffer.getChannelData(chan);
            for(let i=0; i<data.length; i++) {
                if (Math.abs(data[i]) > maxAmp) maxAmp = Math.abs(data[i]);
            }
        }
        if (maxAmp > 0.01) {
            gainNode.gain.value = 0.98 / maxAmp;
        }

        return await offlineCtx.startRendering();

    } catch(e) {
        console.error("Sonification failed:", e);
        throw e;
    }
}
// --- START: Sonification Manager ---

export interface SonificationState {
    activeAudioName: string | null;
    isPlaying: boolean;
    isSonifying: boolean;
    currentTime: number;
    duration: number;
    error: string | null;
}

type AudioFactory = () => Promise<AudioBuffer | null>;

class SonificationManager extends EventTarget {
    private state: SonificationState;
    private audioContext: AudioContext;
    private masterBus: DynamicsCompressorNode;
    private bufferSource: AudioBufferSourceNode | null = null;
    private animationFrameId: number | null = null;

    constructor() {
        super();
        this.state = this.getInitialState();
        
        // Create a single, persistent AudioContext for the app
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Create a master bus with a compressor acting as a limiter
        this.masterBus = this.audioContext.createDynamicsCompressor();
        // Fast attack/release to catch transients without pumping, high ratio for limiting effect.
        this.masterBus.threshold.setValueAtTime(-3.0, this.audioContext.currentTime); // Don't touch anything below -3dB
        this.masterBus.knee.setValueAtTime(6.0, this.audioContext.currentTime); // Smooth transition
        this.masterBus.ratio.setValueAtTime(12.0, this.audioContext.currentTime); // Strong compression
        this.masterBus.attack.setValueAtTime(0.003, this.audioContext.currentTime); // Fast attack
        this.masterBus.release.setValueAtTime(0.25, this.audioContext.currentTime); // Medium release
        
        this.masterBus.connect(this.audioContext.destination);
    }

    private getInitialState(): SonificationState {
        return {
            activeAudioName: null,
            isPlaying: false,
            isSonifying: false,
            currentTime: 0,
            duration: 0,
            error: null,
        };
    }

    private setState(newState: Partial<SonificationState>) {
        this.state = { ...this.state, ...newState };
        this.dispatchEvent(new CustomEvent('change', { detail: { ...this.state } }));
    }

    public getState(): SonificationState {
        return this.state;
    }
    
    private pollTime = () => {
        if(this.bufferSource) {
            // A more accurate way to get time for a buffer source
            const elapsedTime = this.audioContext.currentTime - (this.bufferSource as any)._startTime;
            this.setState({ currentTime: Math.min(elapsedTime, this.state.duration) });
        }
        if (this.state.isPlaying) {
            this.animationFrameId = requestAnimationFrame(this.pollTime);
        }
    }

    private onEnded = () => {
        this.setState({ isPlaying: false, currentTime: this.state.duration });
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.bufferSource = null;
    }

    private cleanupAudio() {
        this.bufferSource?.stop();
        this.bufferSource?.disconnect();
        this.bufferSource = null;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.setState(this.getInitialState());
    }

    public async sonify(geometryData: GeneratedGeometryData, params: SonificationParams): Promise<AudioBuffer | null> {
        // Sonify now uses the manager's persistent context and master bus
        return await sonifyGeometry(this.audioContext, this.masterBus, geometryData, params);
    }
    
    public async togglePlayPause(audioName: string, audioFactory: AudioFactory) {
        if (this.state.isSonifying) return;
        
        // Resume context if suspended (e.g., by browser policy)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        if (this.state.activeAudioName !== audioName || !this.bufferSource) {
            this.cleanupAudio();
            this.setState({ isSonifying: true, error: null, activeAudioName: audioName });

            try {
                const audioBuffer = await audioFactory();
                if(!audioBuffer) {
                    throw new Error("Audio generation failed.");
                }

                this.bufferSource = this.audioContext.createBufferSource();
                this.bufferSource.buffer = audioBuffer;
                this.bufferSource.connect(this.masterBus);
                this.bufferSource.onended = this.onEnded;
                
                (this.bufferSource as any)._startTime = this.audioContext.currentTime;
                this.bufferSource.start(0);

                this.setState({ 
                    isSonifying: false, 
                    isPlaying: true,
                    duration: audioBuffer.duration
                });
                this.pollTime();

            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : "Could not generate audio from the shape.";
                this.cleanupAudio();
                this.setState({ isSonifying: false, error: errorMsg, activeAudioName: audioName });
            }
        } else {
            if (this.audioContext.state === 'running') {
                this.audioContext.suspend();
                this.setState({ isPlaying: false });
                if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            } else if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
                this.setState({ isPlaying: true });
                this.pollTime();
            }
        }
    }
    
    public resetForAudio(audioName: string) {
        if (this.state.activeAudioName === audioName) {
            this.cleanupAudio();
        }
    }
}

export const sonificationManager = new SonificationManager();
// --- END: Sonification Manager ---

import { FFT_SIZE, BAND_FREQUENCIES, EPSILON } from '../constants';
import { TransformationType } from '../types';
import type { TransformationParams } from '../types';
import { bufferToWav } from './wavEncoder';

// --- FFT Implementation ---
// A self-contained, simple Radix-2 FFT implementation.
const fftCache = new Map();
export function getFFT(size: number) {
    if (size <= 0 || (size & (size - 1)) !== 0) {
        throw new Error('FFT size must be a power of two');
    }
    if (fftCache.has(size)) return fftCache.get(size);
    
    const bitReverse = new Uint32Array(size);
    const log2size = Math.log2(size);
    for (let i = 0; i < size; i++) {
        let p = 0;
        for (let j = 0; j < log2size; j++) {
            if ((i >> j) & 1) {
                p |= 1 << (log2size - 1 - j);
            }
        }
        bitReverse[i] = p;
    }

    const sinTable = new Float32Array(size);
    const cosTable = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        sinTable[i] = Math.sin(Math.PI * i / size);
        cosTable[i] = Math.cos(Math.PI * i / size);
    }
    
    const fft = (real: Float32Array, imag: Float32Array, invert: boolean) => {
        // Bit-reversal permutation
        for (let i = 0; i < size; i++) {
            const j = bitReverse[i];
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        // Cooley-Tukey FFT
        for (let len = 2; len <= size; len <<= 1) {
            const halfLen = len >> 1;
            const tableStep = size / len;
            for (let i = 0; i < size; i += len) {
                for (let j = 0; j < halfLen; j++) {
                    const k = j * tableStep;
                    const t_re = cosTable[k];
                    const t_im = (invert ? -1 : 1) * sinTable[k];
                    const p_re = real[i + j + halfLen];
                    const p_im = imag[i + j + halfLen];
                    const u_re = real[i + j];
                    const u_im = imag[i + j];
                    
                    real[i + j] = u_re + p_re * t_re - p_im * t_im;
                    imag[i + j] = u_im + p_re * t_im + p_im * t_re;
                    real[i + j + halfLen] = u_re - (p_re * t_re - p_im * t_im);
                    imag[i + j + halfLen] = u_im - (p_re * t_im + p_im * t_re);
                }
            }
        }
        if(invert){
            for(let i=0; i<size; i++){
                real[i] /= size;
                imag[i] /= size;
            }
        }
    };
    fftCache.set(size, fft);
    return fft;
}


// --- Core Transformation Logic ---

/**
 * Applies the amplitude envelope of a source buffer to a target buffer.
 */
export async function applyAmplitudeMapping(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer): Promise<AudioBuffer> {
    const sourceEnvelope = await getAmplitudeEnvelope(sourceBuffer);
    return applyEnvelopeToBuffer(sourceEnvelope, targetBuffer);
}

/**
 * Applies a "spiky" rhythmic envelope from the source to the target, creating a gating effect.
 */
export async function applyRhythmicGating(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { gateThreshold = 0.2 } = params;
    const sourceEnvelope = await getAmplitudeEnvelope(sourceBuffer, 0.998); // Use slower smoothing for better gating
    const gateBuffer = new OfflineAudioContext(sourceEnvelope.numberOfChannels, sourceEnvelope.length, sourceEnvelope.sampleRate).createBuffer(sourceEnvelope.numberOfChannels, sourceEnvelope.length, sourceEnvelope.sampleRate);
    
    for (let channel = 0; channel < sourceEnvelope.numberOfChannels; channel++) {
        const envelopeData = sourceEnvelope.getChannelData(channel);
        const gateData = gateBuffer.getChannelData(channel);

        for (let i = 0; i < envelopeData.length; i++) {
            // A simple hard gate based on the threshold
            gateData[i] = envelopeData[i] > gateThreshold ? 1.0 : 0.0;
        }
    }
    return applyEnvelopeToBuffer(gateBuffer, targetBuffer);
}


/**
 * Dynamically reshapes the spectral content of the target buffer to match the source buffer
 * using a vocoder-style filter bank approach.
 */
export async function applySpectralShaping(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { spectralMix = 1.0 } = params;
    const offlineCtx = new OfflineAudioContext(targetBuffer.numberOfChannels, targetBuffer.length, targetBuffer.sampleRate);
    
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = sourceBuffer;
    
    const targetNode = offlineCtx.createBufferSource();
    targetNode.buffer = targetBuffer;
    
    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = spectralMix;
    
    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 1.0 - spectralMix;

    // Dry path
    targetNode.connect(dryGain);
    dryGain.connect(offlineCtx.destination);
    
    // Wet path
    const wetBus = offlineCtx.createGain();
    targetNode.connect(wetBus);
    
    BAND_FREQUENCIES.forEach((freq) => {
        const sourceFilter = offlineCtx.createBiquadFilter();
        sourceFilter.type = 'bandpass';
        sourceFilter.frequency.value = freq;
        sourceFilter.Q.value = 5;

        const sourceEnvelopeFollower = createEnvelopeFollower(offlineCtx);

        const targetFilter = offlineCtx.createBiquadFilter();
        targetFilter.type = 'bandpass';
        targetFilter.frequency.value = freq;
        targetFilter.Q.value = 5;

        const targetGain = offlineCtx.createGain();

        sourceNode.connect(sourceFilter);
        sourceFilter.connect(sourceEnvelopeFollower);
        wetBus.connect(targetFilter);
        targetFilter.connect(targetGain);
        sourceEnvelopeFollower.connect(targetGain.gain);
        targetGain.connect(wetGain);
    });
    wetGain.connect(offlineCtx.destination);

    sourceNode.start(0);
    targetNode.start(0);
    return await offlineCtx.startRendering();
}

/**
 * Convolves the target with the source, using the source as an impulse response.
 */
export async function applyConvolution(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer): Promise<AudioBuffer> {
    const newLength = sourceBuffer.length + targetBuffer.length - 1;
    const offlineCtx = new OfflineAudioContext(targetBuffer.numberOfChannels, newLength, targetBuffer.sampleRate);
    const targetSource = offlineCtx.createBufferSource();
    targetSource.buffer = targetBuffer;
    const convolver = offlineCtx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = sourceBuffer;
    targetSource.connect(convolver);
    convolver.connect(offlineCtx.destination);
    targetSource.start(0);
    const renderedBuffer = await offlineCtx.startRendering();
    return trimSilence(renderedBuffer);
}

/**
 * Stretches and compresses segments of the target buffer to match the rhythm of the source.
 */
export async function applyTimeScaleWarping(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { transientSensitivity = 1.8 } = params;
    const sourceTransients = detectTransients(sourceBuffer, transientSensitivity);
    const targetTransients = detectTransients(targetBuffer, transientSensitivity);
    
    let totalDuration = 0;
    const numSegments = Math.min(sourceTransients.length, targetTransients.length) - 1;
    if (numSegments <= 0) return targetBuffer; // Not enough transients to process

    for (let i = 0; i < numSegments; i++) {
        const sourceDuration = (sourceTransients[i + 1] - sourceTransients[i]) / sourceBuffer.sampleRate;
        totalDuration += sourceDuration;
    }
    
    const offlineCtx = new OfflineAudioContext(targetBuffer.numberOfChannels, Math.ceil(totalDuration * targetBuffer.sampleRate), targetBuffer.sampleRate);
    
    let currentTime = 0;
    for (let i = 0; i < numSegments; i++) {
        const sourceSegmentStart = sourceTransients[i];
        const sourceSegmentEnd = sourceTransients[i + 1];
        const sourceDuration = (sourceSegmentEnd - sourceSegmentStart) / sourceBuffer.sampleRate;

        const targetSegmentStart = targetTransients[i];
        const targetSegmentEnd = targetTransients[i + 1];
        const targetDuration = (targetSegmentEnd - targetSegmentStart) / targetBuffer.sampleRate;

        if (targetDuration < 0.01 || sourceDuration < 0.01) continue;

        const playbackRate = targetDuration / sourceDuration;
        const segmentPlayer = offlineCtx.createBufferSource();
        segmentPlayer.buffer = targetBuffer;
        segmentPlayer.playbackRate.value = playbackRate;
        segmentPlayer.start(currentTime, targetSegmentStart / targetBuffer.sampleRate, targetDuration);
        
        currentTime += sourceDuration;
    }

    return await offlineCtx.startRendering();
}

/**
 * Uses the source's waveform shape to re-sequence the target's sonic texture.
 */
export async function applySurfaceTranslationMapping(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { surfaceJitter = 0 } = params;
    const sourceData = sourceBuffer.getChannelData(0);
    const targetData = targetBuffer.getChannelData(0);
    const sortedTargetData = new Float32Array(targetData).sort();
    
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const resultBuffer = audioCtx.createBuffer(1, sourceBuffer.length, sourceBuffer.sampleRate);
    const resultData = resultBuffer.getChannelData(0);

    const sortedLength = sortedTargetData.length;
    const jitterAmount = surfaceJitter * sortedLength * 0.05; // Jitter can affect up to 5% of the texture range

    for (let i = 0; i < sourceData.length; i++) {
        const sourceSample = sourceData[i]; // Value from -1 to 1
        const normalizedIndex = (sourceSample + 1) / 2; // Map to [0, 1]
        const baseTargetIndex = Math.floor(normalizedIndex * (sortedLength - 1));
        
        const randomOffset = (Math.random() - 0.5) * jitterAmount;
        const finalIndex = Math.round(baseTargetIndex + randomOffset);
        
        // Clamp index to be within bounds
        const clampedIndex = Math.max(0, Math.min(sortedLength - 1, finalIndex));
        
        resultData[i] = sortedTargetData[clampedIndex];
    }
    
    return resultBuffer;
}

/**
 * Combines the magnitude of the source's spectrum with the phase of the target's spectrum.
 */
export async function applyFourierMasking(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer): Promise<AudioBuffer> {
    const fftSize = 2048;
    const hopSize = fftSize / 4;
    const fft = getFFT(fftSize);
    
    const length = Math.min(sourceBuffer.length, targetBuffer.length);
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const resultBuffer = audioContext.createBuffer(1, length, sourceBuffer.sampleRate);
    const resultData = resultBuffer.getChannelData(0);

    const sourceData = sourceBuffer.getChannelData(0);
    const targetData = targetBuffer.getChannelData(0);

    const fftWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        fftWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }
    
    for (let i = 0; (i + fftSize) <= length; i += hopSize) {
        const sourceReal = new Float32Array(fftSize);
        const targetReal = new Float32Array(fftSize);
        for(let j=0; j<fftSize; j++){
            sourceReal[j] = sourceData[i+j] * fftWindow[j];
            targetReal[j] = targetData[i+j] * fftWindow[j];
        }
        const sourceImag = new Float32Array(fftSize).fill(0);
        const targetImag = new Float32Array(fftSize).fill(0);

        fft(sourceReal, sourceImag, false);
        fft(targetReal, targetImag, false);
        
        const newReal = new Float32Array(fftSize);
        const newImag = new Float32Array(fftSize);

        for (let j = 0; j < fftSize; j++) {
            const sourceMag = Math.sqrt(sourceReal[j] ** 2 + sourceImag[j] ** 2);
            const targetPhase = Math.atan2(targetImag[j], targetReal[j]);
            newReal[j] = sourceMag * Math.cos(targetPhase);
            newImag[j] = sourceMag * Math.sin(targetPhase);
        }

        fft(newReal, newImag, true); // Inverse FFT

        for (let j = 0; j < fftSize; j++) {
            resultData[i + j] += newReal[j] * fftWindow[j];
        }
    }

    return resultBuffer;
}

/**
 * Imprints the harmonic structure of the source onto the target using resonant filters.
 */
export async function applyHarmonicImprinting(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { numHarmonics = 12, harmonicQ = 30 } = params;
    const harmonics = detectHarmonics(sourceBuffer, numHarmonics, targetBuffer.sampleRate);
    if(harmonics.length === 0) return targetBuffer;

    const offlineCtx = new OfflineAudioContext(targetBuffer.numberOfChannels, targetBuffer.length, targetBuffer.sampleRate);
    const targetNode = offlineCtx.createBufferSource();
    targetNode.buffer = targetBuffer;
    
    let lastNode: AudioNode = targetNode;
    
    harmonics.forEach(freq => {
        if(freq > 0 && freq < offlineCtx.sampleRate / 2) {
            const peakFilter = offlineCtx.createBiquadFilter();
            peakFilter.type = 'peaking';
            peakFilter.frequency.value = freq;
            peakFilter.Q.value = harmonicQ;
            peakFilter.gain.value = 15; // 15dB boost
            lastNode.connect(peakFilter);
            lastNode = peakFilter;
        }
    });

    lastNode.connect(offlineCtx.destination);
    
    targetNode.start(0);
    return await offlineCtx.startRendering();
}

/**
 * Uses rhythmic events from the source to trigger echoes of the target.
 */
export async function applyInterferenceEchoes(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { interferenceFeedback = 0.5, interferenceMix = 0.5 } = params;
    const context = new OfflineAudioContext(targetBuffer.numberOfChannels, targetBuffer.length + targetBuffer.sampleRate * 4, targetBuffer.sampleRate);

    const sourceTransients = detectTransients(sourceBuffer, 1.8);
    if (sourceTransients.length <= 1) return targetBuffer; // Not enough transients

    const targetNode = context.createBufferSource();
    targetNode.buffer = targetBuffer;

    // Dry Path
    const dryGain = context.createGain();
    dryGain.gain.value = 1.0 - interferenceMix;
    targetNode.connect(dryGain);
    dryGain.connect(context.destination);

    // Wet Path
    const wetGain = context.createGain();
    wetGain.gain.value = interferenceMix;
    wetGain.connect(context.destination);

    // This gain node will be pulsed by the source transients to let the target sound into the delay line
    const gateGain = context.createGain();
    gateGain.gain.setValueAtTime(0, 0); // Start closed
    targetNode.connect(gateGain);

    // The delay line
    const delay = context.createDelay(5.0); // 5 seconds max delay
    delay.delayTime.value = 0.3; // A base delay time
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    const feedback = context.createGain();
    feedback.gain.value = interferenceFeedback;
    
    // Connect the delay line
    gateGain.connect(delay);
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay); // feedback loop
    filter.connect(wetGain); // output to wet gain

    // Schedule the gate to open at each transient
    sourceTransients.forEach(sampleIndex => {
        const triggerTime = sampleIndex / sourceBuffer.sampleRate;
        gateGain.gain.setValueAtTime(1.0, triggerTime);
        gateGain.gain.setValueAtTime(0.0, triggerTime + 0.01); // Create a short 10ms pulse
    });

    targetNode.start(0);
    return await context.startRendering();
}


/**
 * Imprints the vocal formant structure of the source onto the target.
 */
export async function applyFormantShifting(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { numFormants = 4, formantQ = 20, formantMix = 0.7 } = params;

    // Detect average formants over the whole source file
    const formants = detectFormants(sourceBuffer, numFormants, targetBuffer.sampleRate);
    if (formants.length === 0) return targetBuffer;

    const context = new OfflineAudioContext(targetBuffer.numberOfChannels, targetBuffer.length, targetBuffer.sampleRate);
    const targetNode = context.createBufferSource();
    targetNode.buffer = targetBuffer;

    // Dry path
    const dryGain = context.createGain();
    dryGain.gain.value = 1.0 - formantMix;
    targetNode.connect(dryGain);
    dryGain.connect(context.destination);

    // Wet path - a chain of peaking filters
    const wetGain = context.createGain();
    wetGain.gain.value = formantMix;
    wetGain.connect(context.destination);

    let lastNode: AudioNode = targetNode;
    formants.forEach(freq => {
        if (freq > 0 && freq < context.sampleRate / 2) {
            const peakFilter = context.createBiquadFilter();
            peakFilter.type = 'peaking';
            peakFilter.frequency.value = freq;
            peakFilter.Q.value = formantQ;
            peakFilter.gain.value = 18; // A significant boost to impose the formant
            lastNode.connect(peakFilter);
            lastNode = peakFilter;
        }
    });

    lastNode.connect(wetGain);

    targetNode.start(0);
    return await context.startRendering();
}

/**
 * Applies dynamic ring modulation to the target, controlled by the source's envelope.
 */
export async function applyDynamicRingModulation(sourceBuffer: AudioBuffer, targetBuffer: AudioBuffer, params: TransformationParams): Promise<AudioBuffer> {
    const { ringModBaseFreq = 100, ringModRange = 1000, ringModMix = 0.5 } = params;

    const sourceEnvelope = await getAmplitudeEnvelope(sourceBuffer, 0.99); // Fairly responsive envelope

    const context = new OfflineAudioContext(targetBuffer.numberOfChannels, targetBuffer.length, targetBuffer.sampleRate);
    
    const sourceEnvData = sourceEnvelope.getChannelData(0);
    const numChannels = targetBuffer.numberOfChannels;
    
    const resultBuffer = context.createBuffer(numChannels, targetBuffer.length, targetBuffer.sampleRate);

    let phase = 0;
    const sr = context.sampleRate;

    for (let c = 0; c < numChannels; c++) {
        const targetData = targetBuffer.getChannelData(c);
        const resultData = resultBuffer.getChannelData(c);

        for (let i = 0; i < targetBuffer.length; i++) {
            const envValue = sourceEnvData[i] || 0;
            const modFreq = ringModBaseFreq + (envValue * ringModRange);
            
            const modSample = Math.sin(phase);
            phase += 2 * Math.PI * modFreq / sr;
            if (phase > 2 * Math.PI) {
                phase -= 2 * Math.PI;
            }

            const wetSample = targetData[i] * modSample;
            const drySample = targetData[i];
            
            resultData[i] = (wetSample * ringModMix) + (drySample * (1 - ringModMix));
        }
    }
    
    return resultBuffer;
}


/**
 * Blends the results of two different transformations.
 */
export async function applyTransformationMorph(
    sourceBuffer: AudioBuffer,
    targetBuffer: AudioBuffer,
    transformA: TransformationType,
    transformB: TransformationType,
    params: TransformationParams
): Promise<AudioBuffer> {
    
    const run = async (type: TransformationType): Promise<AudioBuffer> => {
        switch (type) {
            case TransformationType.AMPLITUDE:
                return applyAmplitudeMapping(sourceBuffer, targetBuffer);
            case TransformationType.RHYTHMIC:
                return applyRhythmicGating(sourceBuffer, targetBuffer, params);
            case TransformationType.SPECTRAL:
                return applySpectralShaping(sourceBuffer, targetBuffer, params);
            case TransformationType.CONVOLUTION:
                return applyConvolution(sourceBuffer, targetBuffer);
            case TransformationType.TIME_WARP:
                return applyTimeScaleWarping(sourceBuffer, targetBuffer, params);
            case TransformationType.SURFACE_TRANSLATE:
                return applySurfaceTranslationMapping(sourceBuffer, targetBuffer, params);
            case TransformationType.FOURIER_MASKING:
                return applyFourierMasking(sourceBuffer, targetBuffer);
            case TransformationType.HARMONIC_IMPRINT:
                return applyHarmonicImprinting(sourceBuffer, targetBuffer, params);
            case TransformationType.INTERFERENCE_ECHOES:
                return applyInterferenceEchoes(sourceBuffer, targetBuffer, params);
            case TransformationType.FORMANT_SHIFTING:
                return applyFormantShifting(sourceBuffer, targetBuffer, params);
            case TransformationType.DYNAMIC_RING_MOD:
                return applyDynamicRingModulation(sourceBuffer, targetBuffer, params);
            default:
                throw new Error(`Invalid transformation type for morphing: ${type}`);
        }
    };

    const [resultA, resultB] = await Promise.all([
        run(transformA),
        run(transformB)
    ]);
    
    const { morphPosition = 0.5 } = params;
    const gainA = 1.0 - morphPosition;
    const gainB = morphPosition;
    
    const length = Math.max(resultA.length, resultB.length);
    const numChannels = Math.min(resultA.numberOfChannels, resultB.numberOfChannels);
    const sampleRate = resultA.sampleRate;
    
    const context = new OfflineAudioContext(numChannels, length, sampleRate);
    
    const sourceA = context.createBufferSource();
    sourceA.buffer = resultA;
    const gainNodeA = context.createGain();
    gainNodeA.gain.value = gainA;
    sourceA.connect(gainNodeA).connect(context.destination);
    
    const sourceB = context.createBufferSource();
    sourceB.buffer = resultB;
    const gainNodeB = context.createGain();
    gainNodeB.gain.value = gainB;
    sourceB.connect(gainNodeB).connect(context.destination);

    sourceA.start(0);
    sourceB.start(0);

    return await context.startRendering();
}


// --- Helper Functions ---

function detectFormants(buffer: AudioBuffer, numFormants: number, sampleRate: number): number[] {
    // This is a simplified formant detector based on peak-picking in the spectrum.
    // A true formant detector uses more advanced DSP like LPC (Linear Predictive Coding).
    const fftSize = 8192;
    const fft = getFFT(fftSize);

    const data = buffer.getChannelData(0);
    const chunk = data.length > fftSize ? data.slice(0, fftSize) : data;
    
    const real = new Float32Array(fftSize).fill(0);
    real.set(chunk);
    const imag = new Float32Array(fftSize).fill(0);

    fft(real, imag, false);

    const magnitudes: {freq: number, mag: number}[] = [];
    const minFreq = 300;
    const maxFreq = 5000;

    for (let i = 1; i < fftSize / 2; i++) {
        const freq = i * sampleRate / fftSize;
        if (freq >= minFreq && freq <= maxFreq) {
            magnitudes.push({
                freq: freq,
                mag: Math.sqrt(real[i]**2 + imag[i]**2)
            });
        }
    }

    // Find peaks
    const peaks = [];
    for (let i = 1; i < magnitudes.length - 1; i++) {
        if (magnitudes[i].mag > magnitudes[i-1].mag && magnitudes[i].mag > magnitudes[i+1].mag) {
            peaks.push(magnitudes[i]);
        }
    }
    
    // Sort by magnitude and return top frequencies
    return peaks
        .sort((a, b) => b.mag - a.mag)
        .slice(0, numFormants)
        .map(p => p.freq);
}

function detectHarmonics(buffer: AudioBuffer, numHarmonics: number, sampleRate: number): number[] {
    const fftSize = 8192;
    const fft = getFFT(fftSize);

    const data = buffer.getChannelData(0);
    const chunk = data.length > fftSize ? data.slice(0, fftSize) : data;
    
    const real = new Float32Array(fftSize).fill(0);
    real.set(chunk);
    const imag = new Float32Array(fftSize).fill(0);

    fft(real, imag, false);

    const magnitudes: {freq: number, mag: number}[] = [];
    for (let i = 1; i < fftSize / 2; i++) { // Ignore DC offset and Nyquist
        magnitudes.push({
            freq: i * sampleRate / fftSize,
            mag: Math.sqrt(real[i]**2 + imag[i]**2)
        });
    }

    // Find peaks
    const peaks = [];
    for (let i = 1; i < magnitudes.length - 1; i++) {
        if (magnitudes[i].mag > magnitudes[i-1].mag && magnitudes[i].mag > magnitudes[i+1].mag) {
            peaks.push(magnitudes[i]);
        }
    }
    
    // Sort by magnitude and return top frequencies
    return peaks
        .sort((a, b) => b.mag - a.mag)
        .slice(0, numHarmonics)
        .map(p => p.freq);
}

/**
 * Detects rhythmic transients in an audio buffer based on energy changes.
 */
function detectTransients(buffer: AudioBuffer, threshold = 1.8, minSeparationMs = 50): number[] {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const minSeparation = Math.floor(sampleRate * (minSeparationMs / 1000));

    const chunkSize = 512;
    const energies = [];
    for (let i = 0; i < data.length; i += chunkSize) {
        let sumOfSquares = 0;
        const end = Math.min(i + chunkSize, data.length);
        for (let j = i; j < end; j++) {
            sumOfSquares += data[j] * data[j];
        }
        energies.push(Math.sqrt(sumOfSquares / (end - i)));
    }

    const transients: number[] = [0];
    let lastTransient = 0;
    for (let i = 1; i < energies.length; i++) {
        if (energies[i] > energies[i - 1] * threshold) {
            const sampleIndex = i * chunkSize;
            if (sampleIndex - lastTransient > minSeparation) {
                transients.push(sampleIndex);
                lastTransient = sampleIndex;
            }
        }
    }
    
    if (transients[transients.length - 1] < data.length - 1) {
        transients.push(data.length - 1);
    }
    
    return transients;
}


function applyEnvelopeToBuffer(envelopeBuffer: AudioBuffer, targetBuffer: AudioBuffer): AudioBuffer {
    const offlineCtx = new OfflineAudioContext(
        targetBuffer.numberOfChannels,
        targetBuffer.length,
        targetBuffer.sampleRate
    );
    const resultBuffer = offlineCtx.createBuffer(
        targetBuffer.numberOfChannels,
        targetBuffer.length,
        targetBuffer.sampleRate
    );

    for (let channel = 0; channel < targetBuffer.numberOfChannels; channel++) {
        const targetData = targetBuffer.getChannelData(channel);
        const resultData = resultBuffer.getChannelData(channel);
        const envelopeData = envelopeBuffer.getChannelData(channel % envelopeBuffer.numberOfChannels);
        const length = Math.min(targetData.length, envelopeData.length);
        
        for (let i = 0; i < length; i++) {
            resultData[i] = targetData[i] * envelopeData[i];
        }
    }
    
    return resultBuffer;
}

function createEnvelopeFollower(context: BaseAudioContext, attack = 0.003, release = 0.25): AudioNode {
    const rectifierGain = context.createGain();
    const rectifierShaper = context.createWaveShaper();
    rectifierShaper.curve = new Float32Array([1, 1]); // Full-wave rectification (absolute value)
    
    const smoother = context.createGain();
    smoother.gain.value = 1; // This node is just for setting time constants
    // The Web Audio API doesn't have a direct envelope follower, so we use a low-pass filter
    // to smooth the rectified signal. A more advanced implementation might use a different method.
    // For now, we simulate with a simple gain ramp, but a filter is more common.
    // Let's stick with a filter as it's more robust.
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 10; // A low frequency to smooth the signal into an envelope

    rectifierGain.connect(rectifierShaper);
    rectifierShaper.connect(lowpass);
    
    return rectifierGain; // The input to this node is where you connect the signal
}


async function getAmplitudeEnvelope(buffer: AudioBuffer, smoothing: number = 0.995): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const resultBuffer = offlineCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    for(let c = 0; c < buffer.numberOfChannels; c++) {
        const inputData = buffer.getChannelData(c);
        const outputData = resultBuffer.getChannelData(c);
        let lastValue = 0;
        for (let i = 0; i < inputData.length; i++) {
            const absValue = Math.abs(inputData[i]);
            lastValue = smoothing * lastValue + (1.0 - smoothing) * absValue;
            outputData[i] = lastValue;
        }
        // Normalize the envelope
        let maxVal = 0;
        for(let i=0; i<outputData.length; i++) {
            if (outputData[i] > maxVal) {
                maxVal = outputData[i];
            }
        }
        if (maxVal > 0) {
            for(let i=0; i<outputData.length; i++) {
                outputData[i] /= maxVal;
            }
        }
    }
    
    return resultBuffer;
}

function trimSilence(buffer: AudioBuffer, threshold = 0.005): AudioBuffer {
    const data = buffer.getChannelData(0);
    let firstSample = 0;
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > threshold) {
            firstSample = i;
            break;
        }
    }

    if (firstSample === 0) return buffer;

    const newLength = buffer.length - firstSample;
    const newBuffer = new AudioContext().createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

    for(let i = 0; i < buffer.numberOfChannels; i++) {
        newBuffer.copyToChannel(buffer.getChannelData(i).slice(firstSample), i);
    }
    
    return newBuffer;
}


// --- WAV Conversion ---
// This has been moved to services/wavEncoder.ts
export { bufferToWav };


// --- DEVELOPMENT TESTS ---

/**
 * This function can be called during development to verify the correctness of key algorithms.
 * It uses simple console assertions.
 */
export function runAudioProcessorTests() {
    console.group("Running Audio Processor Tests...");
    
    const assert = (condition: boolean, message: string) => {
        if (!condition) {
            console.error(`Assertion Failed: ${message}`);
        } else {
            console.log(`%cAssertion Passed: ${message}`, 'color: #2ecc71');
        }
    };

    // Test: Safe voice gain calculation
    const computeSafeVoiceGain = (n: number) => n > 1 ? 1 / Math.sqrt(n) : 1;
    assert(Math.abs(computeSafeVoiceGain(1) - 1) < 0.001, "Safe gain for 1 voice is 1.");
    assert(Math.abs(computeSafeVoiceGain(2) - 0.707) < 0.01, "Safe gain for 2 voices is ~0.707 (-3dB).");
    assert(Math.abs(computeSafeVoiceGain(4) - 0.5) < 0.001, "Safe gain for 4 voices is 0.5 (-6dB).");

    // Test: getFFT rejects invalid sizes
    let threw = false;
    try {
        getFFT(300);
    } catch {
        threw = true;
    }
    assert(threw, "getFFT throws for non-power-of-two size.");

    threw = false;
    try {
        getFFT(0);
    } catch {
        threw = true;
    }
    assert(threw, "getFFT throws for non-positive size.");
    
    console.log("Tests complete.");
    console.groupEnd();
}

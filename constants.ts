import { TransformationType, TransformationParams } from './types';

// The size of the FFT (Fast Fourier Transform) to be used by the AnalyserNode.
// Must be a power of 2. Higher values give more frequency resolution.
export const FFT_SIZE = 2048;

// Number of frequency bands to divide the spectrum into for Spectral Shaping.
export const SPECTRAL_BANDS = 16;

// The center frequencies for our bandpass filters in Spectral Shaping.
// These are spaced logarithmically to better match human hearing.
export const BAND_FREQUENCIES = [
    60, 150, 300, 500, 750, 1000, 1500, 2000,
    3000, 4000, 5000, 7000, 9000, 11000, 14000, 18000
];

// A small value to prevent division by zero when normalizing energy.
export const EPSILON = 1e-6;

// --- Transformation Parameter Definitions ---

type ParamConfig = {
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
};

export const TRANSFORMATION_PARAMS_CONFIG: Partial<Record<TransformationType, Partial<Record<keyof TransformationParams, ParamConfig>>>> = {
  [TransformationType.RHYTHMIC]: {
    gateThreshold: { label: 'Gate Threshold', min: 0.01, max: 1.0, step: 0.01, defaultValue: 0.2 },
  },
  [TransformationType.SPECTRAL]: {
    spectralMix: { label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 1.0 },
  },
  [TransformationType.TIME_WARP]: {
    transientSensitivity: { label: 'Transient Sensitivity', min: 1.1, max: 4.0, step: 0.1, defaultValue: 1.8 },
  },
  [TransformationType.SURFACE_TRANSLATE]: {
    surfaceJitter: { label: 'Jitter', min: 0, max: 1, step: 0.01, defaultValue: 0 },
  },
  [TransformationType.HARMONIC_IMPRINT]: {
    numHarmonics: { label: 'Number of Harmonics', min: 1, max: 20, step: 1, defaultValue: 12 },
    harmonicQ: { label: 'Resonance (Q)', min: 1, max: 100, step: 1, defaultValue: 30 },
  },
  [TransformationType.INTERFERENCE_ECHOES]: {
    interferenceFeedback: { label: 'Feedback', min: 0, max: 0.95, step: 0.01, defaultValue: 0.5 },
    interferenceMix: { label: 'Echo Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  },
  [TransformationType.FORMANT_SHIFTING]: {
    numFormants: { label: 'Formants', min: 1, max: 8, step: 1, defaultValue: 4 },
    formantQ: { label: 'Resonance (Q)', min: 1, max: 50, step: 1, defaultValue: 20 },
    formantMix: { label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.7 },
  },
  [TransformationType.DYNAMIC_RING_MOD]: {
    ringModBaseFreq: { label: 'Base Frequency', min: 20, max: 2000, step: 1, defaultValue: 100, unit: 'Hz' },
    ringModRange: { label: 'Frequency Range', min: 0, max: 5000, step: 10, defaultValue: 1000, unit: 'Hz' },
    ringModMix: { label: 'Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  },
  [TransformationType.TRANSFORMATION_MORPH]: {
    morphPosition: { label: 'Morph A/B', min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
  },
};

export const getDefaultParams = (): TransformationParams => {
    const defaults: TransformationParams = {};
    for (const key in TRANSFORMATION_PARAMS_CONFIG) {
        const config = TRANSFORMATION_PARAMS_CONFIG[key as TransformationType];
        if (config) {
            for (const paramKey in config) {
                defaults[paramKey as keyof TransformationParams] = config[paramKey as keyof TransformationParams]!.defaultValue;
            }
        }
    }
    return defaults;
};
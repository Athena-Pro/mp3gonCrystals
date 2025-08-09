export interface AudioData {
  name: string;
  buffer: AudioBuffer;
  url?: string;
}

export enum TransformationType {
  AMPLITUDE = 'Amplitude Mapping',
  SPECTRAL = 'Spectral Shaping',
  RHYTHMIC = 'Rhythmic Gating',
  CONVOLUTION = 'Convolution Morphing',
  TIME_WARP = 'Time Scale Warping',
  SURFACE_TRANSLATE = 'Surface Translation',
  FOURIER_MASKING = 'Fourier Masking',
  HARMONIC_IMPRINT = 'Harmonic Imprinting',
  INTERFERENCE_ECHOES = 'Interference Echoes',
  FORMANT_SHIFTING = 'Formant Shifting',
  DYNAMIC_RING_MOD = 'Dynamic Ring Modulation',
  TRANSFORMATION_MORPH = 'Transformation Morphing',
}

export enum SourceType {
    FILE = 'File',
    LIVE = 'Live',
}

export interface TransformationParams {
  // Rhythmic Gating
  gateThreshold?: number;
  // Spectral Shaping
  spectralMix?: number;
  // Time Scale Warping
  transientSensitivity?: number;
  // Surface Translation
  surfaceJitter?: number;
  // Harmonic Imprinting
  numHarmonics?: number;
  harmonicQ?: number;
  // Interference Echoes
  interferenceFeedback?: number;
  interferenceMix?: number;
  // Formant Shifting
  numFormants?: number;
  formantQ?: number;
  formantMix?: number;
  // Dynamic Ring Modulation
  ringModBaseFreq?: number;
  ringModRange?: number;
  ringModMix?: number;
  // Transformation Morphing
  morphPosition?: number;
}
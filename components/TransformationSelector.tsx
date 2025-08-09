import React from 'react';
import { TransformationType } from '../types';
import { IconAmplitude, IconSpectral, IconRhythmic, IconConvolution, IconTimeWarp, IconSurfaceTranslation, IconFourierMask, IconHarmonicImprint, IconInterferenceEchoes, IconFormantShifting, IconRingMod, IconTransformationMorph } from './Icons';

interface TransformationSelectorProps {
  selected: TransformationType;
  onSelect: (type: TransformationType) => void;
  disabledItems?: TransformationType[];
}

const options = [
  { 
    id: TransformationType.AMPLITUDE, 
    title: 'Amplitude Mapping',
    description: 'Applies the volume envelope of the source to the target.',
    icon: IconAmplitude
  },
  { 
    id: TransformationType.SPECTRAL, 
    title: 'Spectral Shaping',
    description: 'Reshapes the frequency content of the target to match the source.',
    icon: IconSpectral
  },
  {
    id: TransformationType.RHYTHMIC,
    title: 'Rhythmic Gating',
    description: 'Triggers the target sound using the rhythmic attacks of the source.',
    icon: IconRhythmic
  },
  {
    id: TransformationType.CONVOLUTION,
    title: 'Convolution Morphing',
    description: 'Imprints the sonic character of the source onto the target.',
    icon: IconConvolution
  },
  {
    id: TransformationType.TIME_WARP,
    title: 'Time Scale Warping',
    description: "Matches the target's rhythm to the source's groove by time-stretching.",
    icon: IconTimeWarp
  },
  {
    id: TransformationType.SURFACE_TRANSLATE,
    title: 'Surface Translation',
    description: "Uses the source's waveform to re-sequence the target's sonic texture.",
    icon: IconSurfaceTranslation
  },
  {
    id: TransformationType.FOURIER_MASKING,
    title: 'Fourier Masking',
    description: "Combines source's frequency power with target's phase.",
    icon: IconFourierMask
  },
  {
    id: TransformationType.HARMONIC_IMPRINT,
    title: 'Harmonic Imprinting',
    description: "Resonates the target using the source's key frequencies.",
    icon: IconHarmonicImprint
  },
  {
    id: TransformationType.INTERFERENCE_ECHOES,
    title: 'Interference Echoes',
    description: "Source's rhythm triggers cascading echoes of the target.",
    icon: IconInterferenceEchoes
  },
  {
    id: TransformationType.FORMANT_SHIFTING,
    title: 'Formant Shifting',
    description: "Imprints the vocal character of the source onto the target.",
    icon: IconFormantShifting
  },
  {
    id: TransformationType.DYNAMIC_RING_MOD,
    title: 'Dynamic Ring Modulation',
    description: "Source's volume controls the frequency of a metallic modulator.",
    icon: IconRingMod
  },
  {
    id: TransformationType.TRANSFORMATION_MORPH,
    title: 'Transformation Morphing',
    description: 'Blends the result of two different transformations together.',
    icon: IconTransformationMorph
  }
];

export default function TransformationSelector({ selected, onSelect, disabledItems = [] }: TransformationSelectorProps): React.ReactNode {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <h3 className="text-xl font-bold text-center mb-4 text-gray-300">Choose Transformation Method</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {options.map((option) => {
          const isDisabled = disabledItems.includes(option.id);
          return (
            <label
              key={option.id}
              htmlFor={option.id}
              className={`relative flex items-center p-4 border rounded-lg transition-all duration-200 ${
                isDisabled
                  ? 'bg-gray-800 border-gray-700 cursor-not-allowed opacity-50'
                  : selected === option.id
                  ? 'bg-cyan-900/50 border-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'bg-gray-700/30 border-gray-600 hover:border-gray-500 cursor-pointer'
              }`}
              title={isDisabled ? 'This transformation is only available in File mode.' : option.description}
            >
              <input
                type="radio"
                id={option.id}
                name="transformation"
                value={option.id}
                checked={!isDisabled && selected === option.id}
                onChange={() => !isDisabled && onSelect(option.id)}
                className="hidden"
                disabled={isDisabled}
              />
              <option.icon className={`w-10 h-10 mr-4 flex-shrink-0 ${selected === option.id && !isDisabled ? 'text-cyan-400' : 'text-gray-400'}`} />
              <div>
                <span className="font-bold text-lg text-gray-100">{option.title}</span>
                <p className="text-sm text-gray-400 hidden lg:block">{option.description}</p>
              </div>
               {selected === option.id && !isDisabled && (
                  <div className="absolute top-2 right-2 w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                  </div>
               )}
            </label>
          )
        })}
      </div>
    </div>
  );
}
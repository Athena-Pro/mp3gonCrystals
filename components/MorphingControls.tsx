import React from 'react';
import { TransformationType } from '../types';

interface MorphingControlsProps {
    morphA: TransformationType;
    setMorphA: (type: TransformationType) => void;
    morphB: TransformationType;
    setMorphB: (type: TransformationType) => void;
    disabledItems?: TransformationType[];
}

// Get all transformation types except the morphing one itself
const morphableTransformations = Object.values(TransformationType).filter(
    t => t !== TransformationType.TRANSFORMATION_MORPH
);

export default function MorphingControls({ morphA, setMorphA, morphB, setMorphB, disabledItems = [] }: MorphingControlsProps): React.ReactNode {
    
    const renderSelect = (value: TransformationType, setter: (type: TransformationType) => void, label: string) => (
        <div className="flex flex-col gap-2">
            <label htmlFor={`morph-select-${label}`} className="text-lg font-bold text-gray-300">{label}</label>
            <select
                id={`morph-select-${label}`}
                value={value}
                onChange={(e) => setter(e.target.value as TransformationType)}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5"
            >
                {morphableTransformations.map(t => {
                    const isDisabled = disabledItems.includes(t);
                    return <option key={t} value={t} disabled={isDisabled}>{t}{isDisabled ? ' (File only)' : ''}</option>;
                })}
            </select>
        </div>
    );

    return (
        <div className="p-6 bg-gray-900/50 border border-gray-700 rounded-lg">
            <h3 className="text-xl font-bold text-center mb-5 text-gray-300">
                Morphing Setup
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderSelect(morphA, setMorphA, 'Transform A')}
                {renderSelect(morphB, setMorphB, 'Transform B')}
            </div>
        </div>
    );
}

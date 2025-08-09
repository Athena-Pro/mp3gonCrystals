import React from 'react';
import type { TransformationParams, TransformationType } from '../types';
import { IconAdjustments } from './Icons';

interface TransformationParametersProps {
  transformation: TransformationType;
  params: TransformationParams;
  onParamsChange: (newParams: Partial<TransformationParams>) => void;
  configs: Record<string, any>;
  title?: string;
}

export default function TransformationParameters({
  transformation,
  params,
  onParamsChange,
  configs,
  title,
}: TransformationParametersProps): React.ReactNode {

  const handleSliderChange = (paramKey: keyof TransformationParams, value: string) => {
    onParamsChange({ [paramKey]: parseFloat(value) });
  };

  return (
    <div className="p-6 bg-gray-900/50 border border-gray-700 rounded-lg mt-6">
      <h3 className="text-xl font-bold text-center mb-5 text-gray-300 flex items-center justify-center gap-3">
        <IconAdjustments className="w-6 h-6 text-purple-400"/>
        {title || 'Parameters'}
      </h3>
      <div className="space-y-4">
        {Object.entries(configs).map(([paramKey, config]) => {
          const key = paramKey as keyof TransformationParams;
          const value = params[key] ?? config.defaultValue;
          return (
            <div key={key} className="grid grid-cols-[auto_1fr_minmax(70px,auto)] items-center gap-4">
              <label htmlFor={key} className="text-sm font-medium text-gray-400 col-span-1">
                {config.label}
              </label>
              <input
                type="range"
                id={key}
                name={key}
                min={config.min}
                max={config.max}
                step={config.step}
                value={value}
                onChange={(e) => handleSliderChange(key, e.target.value)}
                className="col-span-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500"
                style={{
                  '--thumb-color': '#06b6d4',
                  '--track-color': '#4b5563' 
                } as React.CSSProperties}
              />
              <span className="text-sm text-cyan-400 font-mono text-right">
                {Number(value).toFixed(config.step < 1 ? 2 : 0)}{config.unit || ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
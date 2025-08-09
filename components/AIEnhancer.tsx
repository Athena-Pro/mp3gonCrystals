import React, { useState, useCallback } from 'react';
import { generateSoundName } from '../services/geminiService';
import { TransformationType } from '../types';
import Spinner from './Spinner';
import { IconSparkles } from './Icons';

interface AIEnhancerProps {
  sourceName?: string;
  targetName?: string;
  transformation: TransformationType;
  morphA?: TransformationType;
  morphB?: TransformationType;
}

export default function AIEnhancer({ sourceName, targetName, transformation, morphA, morphB }: AIEnhancerProps): React.ReactNode {
  const [isLoading, setIsLoading] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateNames = useCallback(async () => {
    if (!sourceName || !targetName) return;

    setIsLoading(true);
    setError(null);
    setNames([]);

    try {
      const result = await generateSoundName(sourceName, targetName, transformation, morphA, morphB);
      setNames(result);
    } catch (err) {
      console.error('Gemini API error:', err);
      setError('Could not generate names. The AI might be sleeping.');
    } finally {
      setIsLoading(false);
    }
  }, [sourceName, targetName, transformation, morphA, morphB]);

  return (
    <div className="mt-8 pt-6 border-t border-gray-700/50">
      <div className="text-center">
        <h3 className="text-xl font-bold text-purple-400">Creative Assistant</h3>
        <p className="text-gray-400 mt-1">Need a name for your new creation? Let AI help!</p>
        <button
          onClick={handleGenerateNames}
          disabled={isLoading}
          className="group mt-4 inline-flex items-center justify-center px-6 py-2 text-md font-bold text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-lg hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 transition-all duration-300 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Spinner />
              Generating...
            </>
          ) : (
            <>
              <IconSparkles className="w-5 h-5 mr-2 transition-transform duration-300 group-hover:scale-125" />
              Generate Sound Names
            </>
          )}
        </button>
      </div>

      {error && <p className="mt-4 text-red-400 text-center">{error}</p>}

      {names.length > 0 && (
        <div className="mt-6">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center">
            {names.map((name, index) => (
              <li
                key={index}
                className="bg-gray-700/40 border border-gray-600/50 rounded-md p-3 text-gray-200"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
import React, { useEffect } from 'react';
import type { AudioData } from '../types';
import MP3gonVisualizer from './MP3gonVisualizer';
import { IconX } from './Icons';

interface VisualizerModalProps {
  audioData: AudioData;
  onClose: () => void;
}

export default function VisualizerModal({ audioData, onClose }: VisualizerModalProps): React.ReactNode {
  // Add keyboard support for closing the modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md"
      aria-modal="true"
      role="dialog"
    >
      <div className="relative w-[95vw] h-[90vh] bg-gray-900 rounded-lg shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
        <header className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-cyan-400 truncate pr-4" title={audioData.name}>
            MP3gon Visualizer: {audioData.name}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Close visualizer"
          >
            <IconX className="w-6 h-6 text-gray-400" />
          </button>
        </header>
        <main className="flex-grow p-1 md:p-2 relative">
          <MP3gonVisualizer audioData={audioData} />
        </main>
      </div>
    </div>
  );
}
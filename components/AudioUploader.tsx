import React, { useState, useRef, useCallback } from 'react';
import type { AudioData } from '../types';
import MP3gonVisualizer from './MP3gonVisualizer';
import { IconUpload, IconFileMusic, IconX, IconExpand } from './Icons';

interface AudioUploaderProps {
  id: string;
  title: string;
  onUpload: (audioData: AudioData) => void;
  audioData: AudioData | null;
  onOpenVisualizer?: (audioData: AudioData) => void;
}

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

export default function AudioUploader({ id, title, onUpload, audioData, onOpenVisualizer }: AudioUploaderProps): React.ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError('Invalid file type. Please upload an audio file.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      onUpload({
        name: file.name,
        buffer: decodedBuffer,
        url: URL.createObjectURL(file),
      });
    } catch (e) {
      console.error('Error decoding audio data:', e);
      setError('Could not process this audio file. It may be corrupt or in an unsupported format.');
    } finally {
      setIsProcessing(false);
    }
  }, [onUpload]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };
  
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemove = () => {
    onUpload(null!); // Parent component will handle null
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const titleComponent = title ? <h3 className="text-xl font-bold text-center text-cyan-400 mb-4">{title}</h3> : null;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-full flex flex-col">
      {titleComponent}
      {audioData ? (
        <div className="flex-grow flex flex-col justify-between">
          <div className="flex-grow flex flex-col">
            <div className="bg-gray-900/50 rounded-lg border border-gray-700 h-48 mb-4 flex items-center justify-center overflow-hidden relative">
                <MP3gonVisualizer audioData={audioData} />
                {onOpenVisualizer && (
                  <button 
                    onClick={() => onOpenVisualizer(audioData)} 
                    className="absolute top-2 right-2 p-1.5 bg-gray-900/50 text-white rounded-full hover:bg-cyan-500/50 transition-colors backdrop-blur-sm z-30"
                    title="Expand Visualizer"
                    aria-label="Expand Visualizer"
                  >
                    <IconExpand className="w-5 h-5" />
                  </button>
                )}
            </div>
            <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-md">
              <div className="flex items-center min-w-0">
                <IconFileMusic className="w-5 h-5 mr-2 text-cyan-400 flex-shrink-0" />
                <p className="text-sm text-gray-300 truncate" title={audioData.name}>{audioData.name}</p>
              </div>
              <button onClick={handleRemove} className="p-1 rounded-full hover:bg-gray-600 transition-colors">
                <IconX className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-6 cursor-pointer hover:border-cyan-500 hover:bg-gray-700/50 transition-colors duration-300"
        >
          <input ref={fileInputRef} id={id} type="file" className="hidden" accept="audio/*" onChange={handleFileChange} disabled={isProcessing} />
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <p className="mt-3 text-gray-400">Processing Audio...</p>
            </>
          ) : (
            <>
              <IconUpload className="w-10 h-10 text-gray-500 mb-3" />
              <p className="text-center text-gray-400">
                <span className="font-semibold text-cyan-400">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">MP3, WAV, FLAC, etc.</p>
            </>
          )}
        </label>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
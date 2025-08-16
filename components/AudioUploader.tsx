import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { AudioData } from '../types';
import MP3gonVisualizer from './MP3gonVisualizer';
import { IconUpload, IconFileMusic, IconX, IconExpand } from './Icons';

interface AudioUploaderProps {
  id: string;
  title: string;
  onUpload: (audioData: AudioData | null) => void;
  audioData: AudioData | null;
  onOpenVisualizer?: (audioData: AudioData) => void;
}

// Promise-safe decode that works on Safari's callback-style decodeAudioData too
async function decodeWithAudioContext(ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  // Most browsers (Promise API)
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    // Fallback for older Safari: callback API
    return await new Promise((resolve, reject) => {
      // @ts-expect-error: Safari callback signature
      ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
  }
}

export default function AudioUploader({
  id,
  title,
  onUpload,
  audioData,
  onOpenVisualizer,
}: AudioUploaderProps): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ Keep both concerns
  const audioCtxRef = useRef<AudioContext | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError('Invalid file type. Please upload an audio file.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Lazily create the AudioContext on a user gesture (file select/drag-drop)
      if (!audioCtxRef.current) {
        const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AC();
      }

      // Read file and decode
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await decodeWithAudioContext(audioCtxRef.current!, arrayBuffer);

      // (Re)create object URL for the raw file (useful for <audio> previews or downloads)
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = URL.createObjectURL(file);

      onUpload({
        name: file.name,
        buffer: decodedBuffer,
        url: objectUrlRef.current,
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
    if (file) processFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    onUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      // Don’t close the AudioContext on unmount unless you’re sure it’s not shared.
      // If you want to free resources, you can opt-in:
      // audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const titleComponent = title ? (
    <h3 className="text-xl font-bold text-center text-cyan-400 mb-4">{title}</h3>
  ) : null;

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
                <p className="text-sm text-gray-300 truncate" title={audioData.name}>
                  {audioData.name}
                </p>
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
          <input
            ref={fileInputRef}
            id={id}
            type="file"
            className="hidden"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
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

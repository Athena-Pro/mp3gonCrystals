import React, { useState, useCallback } from 'react';
import type { AudioData } from '../types';
import { SourceType } from '../types';
import { IconFileMusic, IconMic } from './Icons';
import AudioUploader from './AudioUploader';
import LiveVisualizer from './LiveVisualizer';


interface SourceSelectorProps {
    selectedType: SourceType;
    onTypeChange: (type: SourceType) => void;
    onFileUpload: (audioData: AudioData) => void;
    onMicStream: (stream: MediaStream | null) => void;
    audioData: AudioData | null;
    micStream: MediaStream | null;
    onOpenVisualizer: (audioData: AudioData) => void;
}

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

export default function SourceSelector({ selectedType, onTypeChange, onFileUpload, onMicStream, audioData, micStream, onOpenVisualizer }: SourceSelectorProps): React.ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [isActivatingMic, setIsActivatingMic] = useState<boolean>(false);

  const handleMicEnable = useCallback(async () => {
    setIsActivatingMic(true);
    setError(null);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        onMicStream(stream);
    } catch(err) {
        console.error("Error accessing microphone:", err);
        if (err instanceof Error && err.name === 'NotAllowedError') {
            setError("Microphone permission denied. Please allow access in your browser settings.");
        } else {
            setError("Could not access microphone.");
        }
        onMicStream(null);
    } finally {
        setIsActivatingMic(false);
    }
  }, [onMicStream]);
  
  const handleTypeSelect = (type: SourceType) => {
    onTypeChange(type);
    // Clear any existing error when user makes a choice
    setError(null);
  };
  
  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-full flex flex-col">
       <h3 className="text-xl font-bold text-center text-cyan-400 mb-4">Source Audio</h3>
        <div className="flex justify-center mb-4 border border-gray-600 rounded-lg p-1 bg-gray-900/50">
            <button 
                onClick={() => handleTypeSelect(SourceType.FILE)}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 flex items-center justify-center gap-2 ${selectedType === SourceType.FILE ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
                <IconFileMusic className="w-5 h-5"/>
                File
            </button>
            <button 
                onClick={() => handleTypeSelect(SourceType.LIVE)}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors w-1/2 flex items-center justify-center gap-2 ${selectedType === SourceType.LIVE ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
            >
                <IconMic className="w-5 h-5"/>
                Live
            </button>
        </div>
        
        <div className="flex-grow">
            {selectedType === SourceType.FILE ? (
                <AudioUploader id="source" title="" onUpload={onFileUpload} audioData={audioData} onOpenVisualizer={onOpenVisualizer} />
            ) : (
                <div className="h-full flex flex-col items-center justify-center">
                    {micStream ? (
                        <div className="text-center w-full">
                            <p className="text-green-400 font-semibold mb-2">Microphone Active</p>
                            <LiveVisualizer audioContext={audioContext} stream={micStream} />
                        </div>
                    ) : (
                        <div className="text-center">
                            <button
                                onClick={handleMicEnable}
                                disabled={isActivatingMic}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
                            >
                                {isActivatingMic ? 'Activating...' : <> <IconMic className="w-5 h-5" /> Enable Microphone </>}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
        {error && <p className="mt-2 text-sm text-red-400 text-center">{error}</p>}
    </div>
  );
}
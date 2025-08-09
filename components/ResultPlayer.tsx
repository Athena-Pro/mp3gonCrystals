import React, { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import type { AudioData } from '../types';
import { bufferToWav } from '../services/wavEncoder';
import { IconPlay, IconPause, IconDownload, IconOriginal, IconModified, IconExpand } from './Icons';
import MP3gonVisualizer from './MP3gonVisualizer';


interface ResultPlayerProps {
  original: AudioData | null;
  modified: AudioData | null;
  onOpenVisualizer: (audioData: AudioData) => void;
}

const AudioPlayer: React.FC<{ audioData: AudioData; label: string; icon: React.ReactNode }> = ({ audioData, label, icon }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioData?.url) {
      const audio = new Audio(audioData.url);
      audioRef.current = audio;
      const onEnded = () => setIsPlaying(false);
      audio.addEventListener('ended', onEnded);
      
      return () => {
        audio.pause();
        audio.removeEventListener('ended', onEnded);
        audioRef.current = null;
      }
    }
  }, [audioData]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center gap-4 bg-gray-700/50 p-4 rounded-lg">
        {icon}
        <div className="flex-grow min-w-0">
            <p className="text-lg font-semibold">{label}</p>
            <p className="text-sm text-gray-400 truncate" title={audioData?.name}>{audioData?.name}</p>
        </div>
        <button
            onClick={togglePlay}
            disabled={!audioData?.url}
            className="p-3 bg-cyan-500/20 text-cyan-400 rounded-full hover:bg-cyan-500/40 transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label={`Play ${label}`}
        >
            {isPlaying ? <IconPause className="w-6 h-6" /> : <IconPlay className="w-6 h-6" />}
        </button>
    </div>
  );
};


export default function ResultPlayer({ original, modified, onOpenVisualizer }: ResultPlayerProps): React.ReactNode {
  const [playableModifiedAudio, setPlayableModifiedAudio] = useState<AudioData | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    if (modified?.buffer) {
      const wavBlob = bufferToWav(modified.buffer);
      url = URL.createObjectURL(wavBlob);
      setDownloadUrl(url);
      
      setPlayableModifiedAudio({
          ...modified,
          url: url,
      });

      return () => {
        if (url) URL.revokeObjectURL(url);
        setPlayableModifiedAudio(null);
        setDownloadUrl(null);
      };
    } else {
        setPlayableModifiedAudio(null);
        setDownloadUrl(null);
    }
  }, [modified]);

  return (
    <div className="space-y-6">
        {modified?.buffer && (
          <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 relative h-96">
             <MP3gonVisualizer audioData={modified} />
              <button 
                onClick={() => onOpenVisualizer(modified)} 
                className="absolute top-2 right-2 p-1.5 bg-gray-900/50 text-white rounded-full hover:bg-cyan-500/50 transition-colors backdrop-blur-sm z-30"
                title="Expand Visualizer"
                aria-label="Expand Visualizer"
              >
                <IconExpand className="w-5 h-5" />
              </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {original && <AudioPlayer audioData={original} label="Original Target" icon={<IconOriginal className="w-10 h-10 text-blue-400"/>} />}
            {playableModifiedAudio && <AudioPlayer audioData={playableModifiedAudio} label="Modified Result" icon={<IconModified className="w-10 h-10 text-purple-400"/>} />}
        </div>
        
        <div className="flex justify-center">
            <a
            href={downloadUrl ?? '#'}
            download={modified?.name ? `${modified.name}.wav` : 'transformed.wav'}
            className={`inline-flex items-center gap-2 px-6 py-2 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 transition-colors ${
                !downloadUrl ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={(e) => !downloadUrl && e.preventDefault()}
            aria-disabled={!downloadUrl}
            >
            <IconDownload className="w-5 h-5" />
            Download Result (.wav)
            </a>
        </div>
    </div>
  );
}
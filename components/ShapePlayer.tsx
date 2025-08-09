import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { sonificationManager } from '../services/sonifyService';
import { bufferToWav } from '../services/wavEncoder';
import { IconPlay, IconPause, IconWave } from './Icons';

export interface GeneratedGeometryData {
    geometry: THREE.BufferGeometry;
    timeSegments: number;
    freqBins: number;
}

interface ShapePlayerProps {
    generatedData: GeneratedGeometryData | null;
}

export default function ShapePlayer({ generatedData }: ShapePlayerProps): React.ReactNode {
    const [bitrate, setBitrate] = useState(128);
    const [duration, setDuration] = useState(5);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);

    const resetAudio = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    // Clean up audio object when component unmounts
    useEffect(() => {
        return () => {
            resetAudio();
        };
    }, [resetAudio]);

    // Reset audio when parameters change
    useEffect(() => {
        resetAudio();
    }, [bitrate, duration, generatedData, resetAudio]);


    const handlePlay = useCallback(async () => {
        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }
        
        if (!generatedData) {
            setError("Geometry data is not available.");
            return;
        }

        // If we already have audio, just play it
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
            setIsPlaying(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        
        try {
            const audioBuffer = await sonificationManager.sonify(
                generatedData,
                { bitrate, durationSecs: duration, stereoMode: 'swirl' }
            );

            if (!audioBuffer) {
                throw new Error("Sonification process returned no audio.");
            }

            const wavBlob = bufferToWav(audioBuffer);
            const url = URL.createObjectURL(wavBlob);
            audioUrlRef.current = url;

            const audio = new Audio(url);
            audio.play();
            audio.onended = () => setIsPlaying(false);
            audioRef.current = audio;
            setIsPlaying(true);

        } catch (e) {
            console.error("Sonification failed:", e);
            setError(e instanceof Error ? e.message : "Could not generate audio from the shape.");
        } finally {
            setIsLoading(false);
        }

    }, [generatedData, isPlaying, bitrate, duration, resetAudio]);

    return (
        <div className="mt-6 p-4 bg-gray-900/50 border border-gray-700 rounded-lg">
            <h3 className="text-xl font-bold text-center mb-2 text-purple-400 flex items-center justify-center gap-3">
                <IconWave className="w-6 h-6" />
                Shape Player
            </h3>
            <p className="text-sm text-center text-gray-400 mb-4">
                Listen to the sound of the geometry itself, interpreted like an MP3.
            </p>
            
            <div className="flex items-center gap-6">
                <button
                    onClick={handlePlay}
                    disabled={isLoading || !generatedData}
                    className="p-4 bg-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/40 transition-colors disabled:opacity-50 flex-shrink-0"
                    aria-label="Play Shape Audio"
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    ) : isPlaying ? (
                        <IconPause className="w-6 h-6" />
                    ) : (
                        <IconPlay className="w-6 h-6" />
                    )}
                </button>

                <div className="flex-grow space-y-4">
                    {/* Bitrate slider */}
                    <div className="grid grid-cols-[auto_1fr_minmax(70px,auto)] items-center gap-3">
                        <label htmlFor="bitrate" className="text-sm font-medium text-gray-400">Bitrate</label>
                        <input
                            type="range" id="bitrate" min="32" max="320" step="8"
                            value={bitrate} onChange={e => setBitrate(Number(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-purple-500"
                            disabled={isLoading || isPlaying}
                        />
                        <span className="text-sm text-purple-400 font-mono text-right">{bitrate} kbps</span>
                    </div>
                    {/* Duration slider */}
                    <div className="grid grid-cols-[auto_1fr_minmax(70px,auto)] items-center gap-3">
                        <label htmlFor="duration" className="text-sm font-medium text-gray-400">Duration</label>
                        <input
                            type="range" id="duration" min="1" max="180" step="1"
                            value={duration} onChange={e => setDuration(Number(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-purple-500"
                            disabled={isLoading || isPlaying}
                        />
                        <span className="text-sm text-purple-400 font-mono text-right">{duration} s</span>
                    </div>
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-400 text-center">{error}</p>}
        </div>
    );
}
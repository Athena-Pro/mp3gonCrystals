
import React, { useRef, useEffect } from 'react';

interface LiveVisualizerProps {
  audioContext: AudioContext;
  stream: MediaStream;
}

export default function LiveVisualizer({ audioContext, stream }: LiveVisualizerProps): React.ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !canvasRef.current || !audioContext) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    
    try {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
    } catch (e) {
        // This can happen if the audio context was created with a different stream already
        console.error("Error setting up analyser:", e);
        return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyser || !ctx || !canvas) return;

      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#1f2937'; // bg-gray-800
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#06b6d4'; // cyan-500

      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      source?.disconnect();
    };
  }, [stream, audioContext]);

  return <canvas ref={canvasRef} width="400" height="100" className="w-full h-24 bg-gray-800 rounded-md border border-gray-600"></canvas>;
}
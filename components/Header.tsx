
import React from 'react';
import { IconWave } from './Icons';

export default function Header(): React.ReactNode {
  return (
    <header className="text-center py-8 bg-gray-900/50">
      <div className="inline-flex items-center">
        <IconWave className="w-12 h-12 text-cyan-400 animate-pulse" />
        <h1 className="ml-4 text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
          Sonic Geometer
        </h1>
      </div>
      <p className="mt-2 text-lg text-gray-400">An Experiment in Geometric Sound Transformation</p>
    </header>
  );
}

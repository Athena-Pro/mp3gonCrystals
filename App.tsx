import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TransformationType, SourceType } from './types';
import type { AudioData, TransformationParams } from './types';
import { getDefaultParams, TRANSFORMATION_PARAMS_CONFIG } from './constants';
import Header from './components/Header';
import AudioUploader from './components/AudioUploader';
import TransformationSelector from './components/TransformationSelector';
import TransformationParameters from './components/TransformationParameters';
import ResultPlayer from './components/ResultPlayer';
import AIEnhancer from './components/AIEnhancer';
import Spinner from './components/Spinner';
import { IconMusic, IconTransform, IconStop } from './components/Icons';
import { applyAmplitudeMapping, applySpectralShaping, applyRhythmicGating, applyConvolution, applyTimeScaleWarping, applySurfaceTranslationMapping, applyFourierMasking, applyHarmonicImprinting, applyInterferenceEchoes, applyFormantShifting, applyTransformationMorph, applyDynamicRingModulation } from './services/audioProcessor';
import SourceSelector from './components/SourceSelector';
import LiveAudioProcessor from './services/liveAudioProcessor';
import MorphingControls from './components/MorphingControls';
import VisualizerModal from './components/VisualizerModal';

const liveOnlyDisabledTransformations = [
    TransformationType.SPECTRAL, 
    TransformationType.CONVOLUTION,
    TransformationType.TIME_WARP,
    TransformationType.SURFACE_TRANSLATE,
    TransformationType.FOURIER_MASKING,
    TransformationType.HARMONIC_IMPRINT,
    TransformationType.INTERFERENCE_ECHOES,
    TransformationType.FORMANT_SHIFTING,
    TransformationType.DYNAMIC_RING_MOD,
    TransformationType.TRANSFORMATION_MORPH,
];

export default function App(): React.ReactNode {
  const [sourceType, setSourceType] = useState<SourceType>(SourceType.FILE);
  const [sourceAudio, setSourceAudio] = useState<AudioData | null>(null);
  const [targetAudio, setTargetAudio] = useState<AudioData | null>(null);
  const [transformation, setTransformation] = useState<TransformationType>(TransformationType.AMPLITUDE);
  const [transformationParams, setTransformationParams] = useState<TransformationParams>(getDefaultParams());
  const [processedAudio, setProcessedAudio] = useState<AudioData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Morphing state
  const [morphA, setMorphA] = useState<TransformationType>(TransformationType.AMPLITUDE);
  const [morphB, setMorphB] = useState<TransformationType>(TransformationType.SPECTRAL);

  // Live processing state
  const [isLive, setIsLive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const liveProcessorRef = useRef<LiveAudioProcessor | null>(null);
  
  // Visualizer modal state
  const [visualizerModalData, setVisualizerModalData] = useState<AudioData | null>(null);

  const handleOpenVisualizer = (audioData: AudioData) => {
    if (audioData) {
        setVisualizerModalData(audioData);
    }
  };

  const handleCloseVisualizer = () => {
      setVisualizerModalData(null);
  };

  const handleSourceUpload = (audioData: AudioData) => {
    setSourceAudio(audioData);
    setProcessedAudio(null);
    setError(null);
  };

  const handleTargetUpload = (audioData: AudioData) => {
    setTargetAudio(audioData);
    setProcessedAudio(null);
    setError(null);
    if(isLive) { // if we are live, stop processing to apply new target
        toggleLiveProcessing();
    }
  };

  const handleSourceTypeChange = (type: SourceType) => {
    setSourceType(type);
    if(isLive) {
      toggleLiveProcessing();
    }
    // Reset inputs when switching
    setSourceAudio(null);
    setMicStream(null);
    setError(null);
    if (liveOnlyDisabledTransformations.includes(transformation)) {
        setTransformation(TransformationType.AMPLITUDE);
    }
  };

  const handleParamsChange = (params: Partial<TransformationParams>) => {
    setTransformationParams(prev => ({ ...prev, ...params }));
  };

  useEffect(() => {
    if (isLive && liveProcessorRef.current) {
        liveProcessorRef.current.updateParameters(transformationParams);
    }
  }, [transformationParams, isLive]);

  const handleFileTransform = useCallback(async () => {
    if (!sourceAudio || !targetAudio) {
      setError('Please upload both a source and a target audio file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProcessedAudio(null);

    try {
      let result: AudioBuffer | null = null;
      // Use a web worker in the future for these to avoid blocking main thread
      switch (transformation) {
        case TransformationType.AMPLITUDE:
          result = await applyAmplitudeMapping(sourceAudio.buffer, targetAudio.buffer);
          break;
        case TransformationType.SPECTRAL:
          result = await applySpectralShaping(sourceAudio.buffer, targetAudio.buffer, transformationParams);
          break;
        case TransformationType.RHYTHMIC:
          result = await applyRhythmicGating(sourceAudio.buffer, targetAudio.buffer, transformationParams);
          break;
        case TransformationType.CONVOLUTION:
          result = await applyConvolution(sourceAudio.buffer, targetAudio.buffer);
          break;
        case TransformationType.TIME_WARP:
          result = await applyTimeScaleWarping(sourceAudio.buffer, targetAudio.buffer, transformationParams);
          break;
        case TransformationType.SURFACE_TRANSLATE:
          result = await applySurfaceTranslationMapping(sourceAudio.buffer, targetAudio.buffer, transformationParams);
          break;
        case TransformationType.FOURIER_MASKING:
          result = await applyFourierMasking(sourceAudio.buffer, targetAudio.buffer);
          break;
        case TransformationType.HARMONIC_IMPRINT:
            result = await applyHarmonicImprinting(sourceAudio.buffer, targetAudio.buffer, transformationParams);
            break;
        case TransformationType.INTERFERENCE_ECHOES:
            result = await applyInterferenceEchoes(sourceAudio.buffer, targetAudio.buffer, transformationParams);
            break;
        case TransformationType.FORMANT_SHIFTING:
            result = await applyFormantShifting(sourceAudio.buffer, targetAudio.buffer, transformationParams);
            break;
        case TransformationType.DYNAMIC_RING_MOD:
            result = await applyDynamicRingModulation(sourceAudio.buffer, targetAudio.buffer, transformationParams);
            break;
        case TransformationType.TRANSFORMATION_MORPH:
            result = await applyTransformationMorph(sourceAudio.buffer, targetAudio.buffer, morphA, morphB, transformationParams);
            break;
        default:
          throw new Error(`Unknown transformation type: ${transformation}`);
      }

      if (result) {
        setProcessedAudio({ name: `transformed_${targetAudio.name}`, buffer: result });
      } else {
        throw new Error('Transformation failed to produce audio.');
      }
    } catch (err) {
      console.error('Transformation error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during transformation.');
    } finally {
      setIsLoading(false);
    }
  }, [sourceAudio, targetAudio, transformation, transformationParams, morphA, morphB]);

  const toggleLiveProcessing = useCallback(async () => {
    if (isLive) {
        liveProcessorRef.current?.stop();
        liveProcessorRef.current = null;
        setIsLive(false);
        setIsLoading(false);
    } else {
        if (!micStream || !targetAudio) {
            setError('Please enable microphone and upload a target audio file.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            liveProcessorRef.current = new LiveAudioProcessor();
            await liveProcessorRef.current.start({
                micStream,
                targetBuffer: targetAudio.buffer,
                transformation,
                params: transformationParams,
            });
            setIsLive(true);
        } catch (err) {
            console.error("Failed to start live processing:", err);
            setError(err instanceof Error ? err.message : 'Could not start live audio processor.');
            liveProcessorRef.current?.stop();
            liveProcessorRef.current = null;
        } finally {
            setIsLoading(false);
        }
    }
  }, [isLive, micStream, targetAudio, transformation, transformationParams]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      liveProcessorRef.current?.stop();
      micStream?.getTracks().forEach(track => track.stop());
    }
  }, [micStream]);

  const isCtaDisabled = (sourceType === SourceType.FILE && (!sourceAudio || !targetAudio)) ||
                        (sourceType === SourceType.LIVE && (!micStream || !targetAudio)) ||
                        isLoading;

  const showParameters = TRANSFORMATION_PARAMS_CONFIG[transformation];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <Header />
      <main className="container mx-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto bg-gray-800/50 rounded-2xl shadow-2xl shadow-cyan-500/10 backdrop-blur-sm border border-gray-700">
          <div className="p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <SourceSelector 
                selectedType={sourceType} 
                onTypeChange={handleSourceTypeChange}
                onFileUpload={handleSourceUpload}
                onMicStream={setMicStream}
                audioData={sourceAudio}
                micStream={micStream}
                onOpenVisualizer={handleOpenVisualizer}
              />
              <AudioUploader id="target" title="Target Audio" onUpload={handleTargetUpload} audioData={targetAudio} onOpenVisualizer={handleOpenVisualizer} />
            </div>

            <div className="my-8 border-t border-gray-700"></div>

            <TransformationSelector 
              selected={transformation} 
              onSelect={setTransformation}
              disabledItems={sourceType === SourceType.LIVE ? liveOnlyDisabledTransformations : []}
            />

            {transformation === TransformationType.TRANSFORMATION_MORPH ? (
                <div className="mt-6 space-y-6">
                    <MorphingControls 
                        morphA={morphA}
                        setMorphA={setMorphA}
                        morphB={morphB}
                        setMorphB={setMorphB}
                        disabledItems={sourceType === SourceType.LIVE ? liveOnlyDisabledTransformations : []}
                    />
                     {TRANSFORMATION_PARAMS_CONFIG[TransformationType.TRANSFORMATION_MORPH] && (
                        <TransformationParameters
                            title="Morph Blend (A ⟷ B)"
                            transformation={TransformationType.TRANSFORMATION_MORPH}
                            params={transformationParams}
                            onParamsChange={handleParamsChange}
                            configs={TRANSFORMATION_PARAMS_CONFIG[TransformationType.TRANSFORMATION_MORPH]!}
                        />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            {TRANSFORMATION_PARAMS_CONFIG[morphA] && (
                                <TransformationParameters
                                    title={`A: ${morphA} Params`}
                                    transformation={morphA}
                                    params={transformationParams}
                                    onParamsChange={handleParamsChange}
                                    configs={TRANSFORMATION_PARAMS_CONFIG[morphA]!}
                                />
                            )}
                        </div>
                        <div>
                             {TRANSFORMATION_PARAMS_CONFIG[morphB] && (
                                <TransformationParameters
                                    title={`B: ${morphB} Params`}
                                    transformation={morphB}
                                    params={transformationParams}
                                    onParamsChange={handleParamsChange}
                                    configs={TRANSFORMATION_PARAMS_CONFIG[morphB]!}
                                />
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                showParameters && (
                    <TransformationParameters
                        transformation={transformation}
                        params={transformationParams}
                        onParamsChange={handleParamsChange}
                        configs={TRANSFORMATION_PARAMS_CONFIG[transformation]!}
                    />
                )
            )}


            <div className="mt-8 flex flex-col items-center">
              <button
                onClick={sourceType === SourceType.FILE ? handleFileTransform : toggleLiveProcessing}
                disabled={isCtaDisabled}
                className={`group relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white rounded-lg shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLive 
                    ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 focus:ring-red-500'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 focus:ring-cyan-500'
                }`}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    Processing...
                  </>
                ) : sourceType === SourceType.LIVE ? (
                  isLive ? (
                    <>
                      <IconStop className="w-6 h-6 mr-2" />
                      Stop Live Processing
                    </>
                  ) : (
                    <>
                      <IconTransform className="w-6 h-6 mr-2 transition-transform duration-300 group-hover:rotate-12" />
                      Start Live Processing
                    </>
                  )
                ) : (
                  <>
                    <IconTransform className="w-6 h-6 mr-2 transition-transform duration-300 group-hover:rotate-12" />
                    Apply Transformation
                  </>
                )}
              </button>
              {error && <p className="mt-4 text-red-400 text-center">{error}</p>}
            </div>
          </div>

          {sourceType === SourceType.FILE && (processedAudio || isLoading) && (
            <div className="border-t border-gray-700 p-6 md:p-8">
              <h2 className="text-2xl font-bold text-center text-cyan-400 mb-6 flex items-center justify-center gap-3">
                <IconMusic className="w-7 h-7"/>
                Transformation Result
              </h2>
              {isLoading && !isLive && (
                 <div className="flex justify-center items-center h-32">
                   <Spinner />
                   <span className="ml-3 text-lg">Generating new soundscape...</span>
                 </div>
              )}
              {processedAudio && !isLoading && (
                <div className='space-y-8'>
                  <ResultPlayer original={targetAudio} modified={processedAudio} onOpenVisualizer={handleOpenVisualizer} />
                  <AIEnhancer 
                    sourceName={sourceAudio?.name} 
                    targetName={targetAudio?.name} 
                    transformation={transformation}
                    morphA={transformation === TransformationType.TRANSFORMATION_MORPH ? morphA : undefined}
                    morphB={transformation === TransformationType.TRANSFORMATION_MORPH ? morphB : undefined}
                   />
                </div>
              )}
            </div>
          )}
        </div>
        <footer className="text-center mt-12 text-gray-500 text-sm">
          <p>Powered by React, Tailwind CSS, and the Gemini API.</p>
          <p>Sonic Geometer - An experiment in sound manipulation.</p>
        </footer>
      </main>
      {visualizerModalData && (
        <VisualizerModal audioData={visualizerModalData} onClose={handleCloseVisualizer} />
      )}
    </div>
  );
}
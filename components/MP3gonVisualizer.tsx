import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { getFFT } from '../services/audioProcessor';
import { exportToObj } from '../services/exportService';
import { sonificationManager, SonificationState } from '../services/sonifyService';
import type { AudioData } from '../types';
import { IconDownload, IconPlay, IconPause, IconWave, IconPalette } from './Icons';

// --- Type Definitions ---
interface MP3gonVisualizerProps {
  audioData: AudioData;
}
type ShapeType = 'tube' | 'sphere' | 'torus' | 'flat' | 'spectrogram';
type VizMode = 'single' | 'blend';
type VizData = { timeSegments: number; freqBins: number };
type EmbeddingParams = {
    spikeScale: number;
    polarPinch: number;
    torusRadius: number;
    torsion: number;
};

// --- Pure Helper Functions ---

/**
 * Calculates the 3D position of a single vertex based on normalized coordinates and parameters.
 * This function is pure and can be tested independently.
 * @param tNorm Normalized time (0 to 1)
 * @param fNorm Normalized frequency (0 to 1)
 * @param logMag Logarithmic magnitude of the frequency bin
 * @param mode The base shape to calculate for
 * @param params Geometric parameters (spike, pinch, etc.)
 * @returns [x, y, z] coordinates of the vertex
 */
function embedVertex(
    tNorm: number,
    fNorm: number,
    logMag: number,
    mode: ShapeType,
    params: EmbeddingParams
): [number, number, number] {
    const spike = logMag * params.spikeScale;
    let x = 0, y = 0, z = 0;

    switch (mode) {
        case 'tube': {
            const totalLength = 15;
            const baseRadius = 1.5;
            const angle = fNorm * 2 * Math.PI;
            const torsionAngle = tNorm * params.torsion;
            const radius = baseRadius + spike;
            x = radius * Math.cos(angle + torsionAngle);
            y = radius * Math.sin(angle + torsionAngle);
            z = tNorm * totalLength - (totalLength / 2);
            break;
        }
        case 'sphere': {
            const baseRadius = 2.0;
            const phi = tNorm * 2 * Math.PI;
            const theta = fNorm * Math.PI;
            const rho = baseRadius + spike;
            const torsionAngle = Math.cos(theta) * params.torsion;
            const twistedPhi = phi + torsionAngle;
            x = rho * Math.sin(theta) * Math.cos(twistedPhi);
            y = rho * Math.sin(theta) * Math.sin(twistedPhi);
            z = rho * Math.cos(theta) * params.polarPinch;
            break;
        }
        case 'torus': {
            const minorBaseRadius = 1.0;
            const phi = tNorm * 2 * Math.PI;
            const theta = fNorm * 2 * Math.PI;
            const torsionAngle = tNorm * params.torsion;
            const r = minorBaseRadius + spike;
            const twistedTheta = theta + torsionAngle;
            x = (params.torusRadius + r * Math.cos(twistedTheta)) * Math.cos(phi);
            y = (params.torusRadius + r * Math.cos(twistedTheta)) * Math.sin(phi);
            z = r * Math.sin(twistedTheta);
            break;
        }
        case 'flat': {
            const width = 15; // time axis
            const depth = 10; // frequency axis
            x = tNorm * width - (width / 2);
            const y_val = spike * 0.8;
            const z_val = fNorm * depth - (depth / 2);
            const torsionAngle = tNorm * params.torsion;
            y = y_val * Math.cos(torsionAngle) - z_val * Math.sin(torsionAngle);
            z = y_val * Math.sin(torsionAngle) + z_val * Math.cos(torsionAngle);
            break;
        }
        case 'spectrogram': {
            const width = 15;
            const height = 10;
            // Here, fNorm is a direct mapping of log frequency
            x = tNorm * width - (width / 2);
            let y_pos = fNorm * height - (height / 2);
            let z_pos = spike;
            
            const torsionAngle = tNorm * params.torsion;
            y = y_pos * Math.cos(torsionAngle) - z_pos * Math.sin(torsionAngle);
            z = y_pos * Math.sin(torsionAngle) + z_pos * Math.cos(torsionAngle);
            break;
        }
    }
    return [x, y, z];
}

/**
 * Generates the full MP3gon geometry asynchronously and incrementally.
 * @param buffer The source AudioBuffer
 * @param options Contains visualization parameters, abort signal, and progress callback.
 * @returns A promise that resolves with the generated geometry and metadata.
 */
async function generateGeometryData(
    buffer: AudioBuffer,
    options: {
        vizMode: VizMode;
        shapeA: ShapeType;
        shapeB: ShapeType;
        blendFactor: number;
        embeddingParams: EmbeddingParams;
        abortSignal: AbortSignal;
        onProgress: (progress: number) => void;
    }
): Promise<{ geometry: THREE.BufferGeometry; vizData: VizData }> {
    const { vizMode, shapeA, shapeB, blendFactor, embeddingParams, abortSignal, onProgress } = options;

    const fftSize = 512;
    const hopSize = fftSize * 2;
    const data = buffer.getChannelData(0);
    const timeSegments = Math.floor(data.length / hopSize);
    const freqBins = fftSize / 4;
    const vizData: VizData = { timeSegments, freqBins };
    const fft = getFFT(fftSize);

    const fftWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        fftWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }
    
    const maxFreqHz = (freqBins - 1) * (buffer.sampleRate / fftSize);

    const generateVerticesForShape = (shapeType: ShapeType) => {
        const vertices = new Float32Array(timeSegments * freqBins * 3);
        for (let t = 0; t < timeSegments; t++) {
            const chunk = new Float32Array(fftSize);
            const audioSlice = data.slice(t * hopSize, t * hopSize + fftSize);
            chunk.set(audioSlice);
            for(let i=0; i<chunk.length; i++) chunk[i] *= fftWindow[i];

            const real = new Float32Array(chunk);
            const imag = new Float32Array(fftSize).fill(0);
            fft(real, imag, false);

            for (let f = 0; f < freqBins; f++) {
                const mag = Math.sqrt(real[f]**2 + imag[f]**2);
                const logMag = Math.log10(1 + mag * 50);
                
                const freqHz = f * (buffer.sampleRate / fftSize);
                const fNorm = shapeType === 'spectrogram' 
                    ? Math.log2(freqHz + 1) / Math.log2(maxFreqHz + 1) // Logarithmic for spectrogram
                    : f / (freqBins -1); // Linear for others

                const tNorm = t / (timeSegments -1);

                const v = embedVertex(tNorm, fNorm, logMag, shapeType, embeddingParams);
                vertices.set(v, (t * freqBins + f) * 3);
            }
        }
        return vertices;
    };
    
    // --- Incremental Processing Loop ---
    return new Promise((resolve, reject) => {
        let verticesA: Float32Array | null = null;
        let verticesB: Float32Array | null = null;

        const processStep = (step: 'A' | 'B' | 'Blend' | 'Finish') => {
             if (abortSignal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }
            switch(step) {
                case 'A':
                    verticesA = generateVerticesForShape(shapeA);
                    onProgress(vizMode === 'single' ? 0.8 : 0.4);
                    setTimeout(() => processStep('B'), 0); // Yield to main thread
                    break;
                case 'B':
                    if (vizMode === 'blend') {
                        verticesB = generateVerticesForShape(shapeB);
                    }
                    onProgress(vizMode === 'single' ? 0.9 : 0.8);
                    setTimeout(() => processStep('Blend'), 0);
                    break;
                case 'Blend':
                    let finalVertices: Float32Array;
                    if (vizMode === 'single' && verticesA) {
                        finalVertices = verticesA;
                    } else if (vizMode === 'blend' && verticesA && verticesB) {
                        finalVertices = new Float32Array(verticesA.length);
                        for (let i = 0; i < verticesA.length; i++) {
                            finalVertices[i] = verticesA[i] * (1 - blendFactor) + verticesB[i] * blendFactor;
                        }
                    } else {
                        reject(new Error("Vertex generation failed."));
                        return;
                    }

                    // --- Index Generation ---
                    const indices = [];
                    const isTorusOrSphere = (vizMode === 'single' && (shapeA === 'torus' || shapeA === 'sphere')) || 
                                            (vizMode === 'blend' && (shapeA === 'torus' || shapeB === 'torus' || shapeA === 'sphere' || shapeB === 'sphere'));
                    if (isTorusOrSphere) {
                        for (let t = 0; t < timeSegments; t++) for (let f = 0; f < freqBins; f++) {
                            const t_next = (t + 1) % timeSegments; const f_next = (f + 1) % freqBins;
                            const i1 = t * freqBins + f; const i2 = t_next * freqBins + f;
                            const i3 = t * freqBins + f_next; const i4 = t_next * freqBins + f_next;
                            indices.push(i1, i2, i3); indices.push(i2, i4, i3);
                        }
                    } else { // Tube, Flat, Spectrogram, and blends
                        for (let t = 0; t < timeSegments - 1; t++) for (let f = 0; f < freqBins - 1; f++) {
                            const i1 = t * freqBins + f; const i2 = t * freqBins + (f + 1);
                            const i3 = (t + 1) * freqBins + f; const i4 = (t + 1) * freqBins + (f + 1);
                            indices.push(i1, i3, i2); indices.push(i2, i3, i4);
                        }
                    }
                    
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(finalVertices, 3));
                    geometry.setIndex(indices);
                    geometry.computeVertexNormals();

                    onProgress(1.0);
                    resolve({ geometry, vizData });
                    break;
            }
        };

        onProgress(0.05);
        setTimeout(() => processStep('A'), 0); // Start the process
    });
}


const tempColor = new THREE.Color();
const tempHSL = { h: 0, s: 0, l: 0 };

export default function MP3gonVisualizer({ audioData }: MP3gonVisualizerProps): React.ReactNode {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
      renderer: null as THREE.WebGLRenderer | null,
      camera: null as THREE.PerspectiveCamera | null,
      scene: null as THREE.Scene | null,
      mesh: null as THREE.Mesh | null,
      geometry: null as THREE.BufferGeometry | null,
      vizData: null as VizData | null,
      heat: null as Float32Array | null,
      hitCount: null as Float32Array | null,
      animationFrameId: null as number | null,
      isDragging: false,
      previousMousePosition: { x: 0, y: 0 },
      abortController: new AbortController(),
  });

  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Visualizer controls state
  const [vizMode, setVizMode] = useState<VizMode>('single');
  const [shapeA, setShapeA] = useState<ShapeType>('tube');
  const [shapeB, setShapeB] = useState<ShapeType>('sphere');
  const [blendFactor, setBlendFactor] = useState(0.5);
  const [spikeScale, setSpikeScale] = useState(2.5);
  const [polarPinch, setPolarPinch] = useState(1.0);
  const [torusRadius, setTorusRadius] = useState(3.0);
  const [torsion, setTorsion] = useState(0.0);
  
  // Color controls state
  const [baseColor, setBaseColor] = useState('#0891b2'); // cyan-600
  const [playheadColor, setPlayheadColor] = useState('#f472b6'); // pink-400
  const [cooldownStartColor, setCooldownStartColor] = useState('#f97316'); // orange-500
  const [cooldownEndColor, setCooldownEndColor] = useState('#eab308'); // yellow-500
  const [hitColorShift, setHitColorShift] = useState(0.05);

  const [sonificationState, setSonificationState] = useState<SonificationState>(sonificationManager.getState());
  const [bitrate, setBitrate] = useState(128);
  const [duration, setDuration] = useState(5);
  const [useOriginalDuration, setUseOriginalDuration] = useState(false);
  const { name, buffer } = audioData;

  const originalDuration = buffer ? buffer.duration : 0;
  const effectiveDuration = useOriginalDuration ? originalDuration : duration;

  const isCurrentAudioActive = sonificationState.activeAudioName === name;

  // Subscribe to sonification state changes
  useEffect(() => {
    const handleStateChange = (event: Event) => {
      setSonificationState((event as CustomEvent).detail);
    };
    sonificationManager.addEventListener('change', handleStateChange);
    return () => sonificationManager.removeEventListener('change', handleStateChange);
  }, []);

  const vizParams = JSON.stringify({ vizMode, shapeA, shapeB, blendFactor, spikeScale, polarPinch, torusRadius, torsion });
  useEffect(() => {
    sonificationManager.resetForAudio(name);
  }, [name, bitrate, duration, useOriginalDuration, vizParams]);


  const handleExport = useCallback(() => {
    if (!stateRef.current.geometry || !name) return;
    const sanitizedName = name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_').toLowerCase();
    exportToObj(stateRef.current.geometry, `mp3gon-${sanitizedName || 'export'}.obj`);
  }, [name]);

  const handlePlaySonified = useCallback(async () => {
    const { geometry, vizData } = stateRef.current;
    if (!geometry || !vizData) return;
    sonificationManager.togglePlayPause(name, async () => {
        const { geometry, vizData } = stateRef.current;
        if (!geometry || !vizData) return null;
        return sonificationManager.sonify(
             { geometry, timeSegments: vizData.timeSegments, freqBins: vizData.freqBins },
             { bitrate, durationSecs: effectiveDuration, stereoMode: 'swirl' }
        );
    });
  }, [name, bitrate, effectiveDuration, vizParams]);


  // Main effect for setup, generation, and cleanup
  useEffect(() => {
    if (!buffer || !mountRef.current) return;

    const s = stateRef.current;
    s.abortController = new AbortController();
    let mount = mountRef.current;

    const setupScene = () => {
        s.scene = new THREE.Scene();
        s.camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
        
        try {
            s.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        } catch (e) {
            setError("Could not initialize WebGL. Please use a supported browser.");
            setIsLoading(false);
            console.error(e);
            return false;
        }
        
        s.renderer.setSize(mount.clientWidth, mount.clientHeight);
        s.renderer.setPixelRatio(window.devicePixelRatio);
        mount.innerHTML = '';
        mount.appendChild(s.renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        s.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0x00ffff, 1.2);
        directionalLight.position.set(5, 5, 5);
        s.scene.add(directionalLight);
        const pointLight = new THREE.PointLight(0xff00ff, 1);
        pointLight.position.set(-5, -5, -5);
        s.scene.add(pointLight);
        return true;
    };

    const runAsyncGeneration = async () => {
        setIsLoading(true);
        setError(null);
        setLoadingProgress(0);

        try {
            const { geometry, vizData } = await generateGeometryData(buffer, {
                vizMode, shapeA, shapeB, blendFactor,
                embeddingParams: { spikeScale, polarPinch, torusRadius, torsion },
                abortSignal: s.abortController.signal,
                onProgress: setLoadingProgress,
            });

            if (s.abortController.signal.aborted) return;

            s.geometry = geometry;
            s.vizData = vizData;
            s.heat = new Float32Array(vizData.timeSegments).fill(0);
            const vertexCount = geometry.attributes.position.count;
            s.hitCount = new Float32Array(vertexCount).fill(0);

            const initialColor = new THREE.Color(baseColor);
            const colors = new Float32Array(vertexCount * 3);
            const restingColors = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount; i++) {
                colors.set([initialColor.r, initialColor.g, initialColor.b], i * 3);
                restingColors.set([initialColor.r, initialColor.g, initialColor.b], i * 3);
            }
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setAttribute('restingColor', new THREE.Float32BufferAttribute(restingColors, 3));

            const material = new THREE.MeshStandardMaterial({ metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide, vertexColors: true });
            const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.2 });
            s.mesh = new THREE.Mesh(geometry, material);
            s.mesh.add(new THREE.Mesh(geometry, wireframeMaterial));
            s.scene?.add(s.mesh);

            if (s.camera) {
                s.camera.position.set(0, 0, 12);
                s.camera.lookAt(s.mesh.position);
            }
            
            setIsLoading(false);
        } catch (e) {
            if ((e as Error).name !== 'AbortError') {
                console.error("Error creating MP3gon:", e);
                setError("Could not generate 3D visualization.");
                setIsLoading(false);
            }
        }
    };
    
    if (!setupScene()) return; // Abort if scene setup fails
    runAsyncGeneration();

    // --- Event Handlers ---
    const handleResize = () => {
        if (!mountRef.current || !s.renderer || !s.camera) return;
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        s.renderer.setSize(width, height);
        s.camera.aspect = width / height;
        s.camera.updateProjectionMatrix();
    };
    const onMouseDown = (e: MouseEvent) => { e.preventDefault(); s.isDragging = true; s.previousMousePosition = { x: e.clientX, y: e.clientY }; };
    const onMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (!s.isDragging || !s.mesh) return;
        const deltaX = e.clientX - s.previousMousePosition.x;
        const deltaY = e.clientY - s.previousMousePosition.y;
        s.mesh.rotation.y += deltaX * 0.005;
        s.mesh.rotation.x += deltaY * 0.005;
        s.previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { s.isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!s.camera) return;
      s.camera.position.z += e.deltaY * 0.01;
      s.camera.position.z = Math.max(3, Math.min(30, s.camera.position.z));
    };
    const onContextLost = (e: Event) => { e.preventDefault(); setError("WebGL context lost. Please reload."); if(s.animationFrameId) cancelAnimationFrame(s.animationFrameId); };
    const onContextRestored = () => { setError(null); // Simple reload notification is often best
        window.location.reload();
    };

    mount.addEventListener('mousedown', onMouseDown);
    mount.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mount.addEventListener('wheel', onWheel);
    s.renderer?.domElement.addEventListener('webglcontextlost', onContextLost);
    s.renderer?.domElement.addEventListener('webglcontextrestored', onContextRestored);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);
    
    // --- Animation Loop ---
    const animate = () => {
        try {
            const managerState = sonificationManager.getState();
            const isThisAudioPlaying = managerState.activeAudioName === name && managerState.isPlaying;

            if (s.heat && s.geometry?.attributes.color && s.vizData) {
                const colorAttribute = s.geometry.attributes.color as THREE.BufferAttribute;
                const restingColorAttribute = s.geometry.attributes.restingColor as THREE.BufferAttribute;
                const { timeSegments, freqBins } = s.vizData;
                let colorsNeedUpdate = false;
                
                if (isThisAudioPlaying && managerState.duration > 0) {
                    const progress = managerState.currentTime / managerState.duration;
                    const currentSegment = Math.floor(progress * timeSegments);
                    if (currentSegment >= 0 && currentSegment < s.heat.length && s.heat[currentSegment] < 0.5) {
                        s.heat[currentSegment] = 1.0;
                        if (s.hitCount) {
                            tempColor.set(baseColor).getHSL(tempHSL);
                            for(let f = 0; f < freqBins; f++) {
                                const vertexIndex = currentSegment * freqBins + f;
                                s.hitCount[vertexIndex]++;
                                const newHue = (tempHSL.h + s.hitCount[vertexIndex] * hitColorShift) % 1.0;
                                restingColorAttribute.setXYZ(vertexIndex, tempColor.setHSL(newHue, tempHSL.s, tempHSL.l).r, tempColor.g, tempColor.b);
                            }
                            restingColorAttribute.needsUpdate = true;
                        }
                    }
                }

                const playheadColorObj = new THREE.Color(playheadColor);
                const cooldownStartColorObj = new THREE.Color(cooldownStartColor);
                const cooldownEndColorObj = new THREE.Color(cooldownEndColor);

                for (let t = 0; t < timeSegments; t++) {
                    if (s.heat[t] > 0.001) {
                        colorsNeedUpdate = true;
                        const glowColor = s.heat[t] > 0.8 ? tempColor.lerpColors(cooldownStartColorObj, playheadColorObj, (s.heat[t] - 0.8) / 0.2) : tempColor.lerpColors(cooldownEndColorObj, cooldownStartColorObj, s.heat[t] / 0.8);
                        for (let f = 0; f < freqBins; f++) {
                            const i = t * freqBins + f;
                            const restingColor = new THREE.Color().fromBufferAttribute(restingColorAttribute, i);
                            colorAttribute.setXYZ(i, restingColor.lerp(glowColor, s.heat[t]).r, restingColor.g, restingColor.b);
                        }
                        s.heat[t] *= 0.95;
                    }
                }
                if (colorsNeedUpdate) colorAttribute.needsUpdate = true;
            }

            if (s.mesh && !s.isDragging) { s.mesh.rotation.y += 0.003; }
            s.renderer?.render(s.scene!, s.camera!);
        } catch(e) {
            console.error("Error in animation loop:", e);
            if(s.animationFrameId) cancelAnimationFrame(s.animationFrameId);
            setError("A rendering error occurred.");
        }
        s.animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
        s.abortController.abort();
        if (s.animationFrameId) cancelAnimationFrame(s.animationFrameId);
        resizeObserver.disconnect();
        sonificationManager.resetForAudio(name);

        mount.removeEventListener('mousedown', onMouseDown);
        mount.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        mount.removeEventListener('wheel', onWheel);
        s.renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
        s.renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored);
        
        s.scene?.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry?.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material?.dispose();
                }
            }
        });
        s.renderer?.dispose();
        
        if (mountRef.current) mountRef.current.innerHTML = '';
        Object.keys(s).forEach(key => (s as any)[key] = null);
    };
  }, [buffer, vizParams]);
  
  // This effect updates the base resting colors without rebuilding geometry
  useEffect(() => {
    const s = stateRef.current;
    if (!s.geometry || !s.hitCount) return;
    const restingColorAttribute = s.geometry.attributes.restingColor as THREE.BufferAttribute;
    const vertexCount = restingColorAttribute.count;
    
    tempColor.set(baseColor).getHSL(tempHSL);
    
    for (let i = 0; i < vertexCount; i++) {
        const newHue = (tempHSL.h + s.hitCount[i] * hitColorShift) % 1.0;
        restingColorAttribute.setXYZ(i, tempColor.setHSL(newHue, tempHSL.s, tempHSL.l).r, tempColor.g, tempColor.b);
    }
    restingColorAttribute.needsUpdate = true;

  }, [baseColor, hitColorShift]);


  const showPolarPinch = vizMode === 'single' ? shapeA === 'sphere' : (shapeA === 'sphere' || shapeB === 'sphere');
  const showTorusRadius = vizMode === 'single' ? shapeA === 'torus' : (shapeA === 'torus' || shapeB === 'torus');
  const shapes: ShapeType[] = ['tube', 'sphere', 'torus', 'flat', 'spectrogram'];
  
  const isPlayButtonDisabled = (sonificationState.isSonifying && !isCurrentAudioActive) || isLoading || !!error;
  const areControlsDisabled = (sonificationState.isSonifying || sonificationState.isPlaying) && isCurrentAudioActive;
  const PlayButtonIcon = isCurrentAudioActive && sonificationState.isPlaying ? IconPause : IconPlay;

  const colorInputClass = "p-0 h-6 w-8 border-none rounded cursor-pointer bg-gray-700 disabled:opacity-50";

  return (
    <div className="relative w-full h-full" aria-label="MP3gon Visualizer">
        {isLoading && (
            <div className="absolute inset-0 flex flex-col justify-center items-center bg-gray-900/80 z-10 pointer-events-none">
                <div style={{'--p': `${loadingProgress * 100}%`} as React.CSSProperties} className="relative rounded-full h-10 w-10">
                    <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-cyan-400" style={{ clipPath: `polygon(50% 0, 100% 0, 100% 100%, 50% 100%, 50% 50%, 50% 50%)`, transform: `rotate(calc(3.6deg * ${loadingProgress * 100}))`}}></div>
                </div>
                <p className="mt-3 text-gray-300">Generating Geometry... {Math.round(loadingProgress * 100)}%</p>
            </div>
        )}
        {error && (
            <div className="absolute inset-0 flex justify-center items-center bg-gray-900/80 z-10">
                <p className="text-red-400">{error}</p>
            </div>
        )}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        <div className="absolute bottom-2 left-2 right-2 p-2 bg-gray-800/60 rounded-lg backdrop-blur-sm border border-gray-700/50 z-20 space-y-2 text-sm">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-300">Mode:</span>
                        <div className="p-1 bg-gray-900/50 rounded-md flex">
                            <button onClick={() => setVizMode('single')} className={`px-3 py-1 text-xs rounded transition-colors ${vizMode === 'single' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'}`}>Single</button>
                            <button onClick={() => setVizMode('blend')} className={`px-3 py-1 text-xs rounded transition-colors ${vizMode === 'blend' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'}`}>Blend</button>
                        </div>
                    </div>
                    <button onClick={handleExport} disabled={isLoading || !!error} className="flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors bg-green-600/50 text-green-300 hover:bg-green-600/80 disabled:opacity-50 disabled:cursor-not-allowed" title="Export 3D model as .obj">
                        <IconDownload className="w-3 h-3" />
                        Export .OBJ
                    </button>
                </div>
                <fieldset className="border border-gray-700 rounded-md p-2">
                    <legend className="text-xs font-bold text-gray-400 px-1 flex items-center gap-1"><IconPalette className="w-3 h-3"/> Color & Style</legend>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex items-center gap-1.5">
                            <label htmlFor="baseColor" className="font-medium text-gray-400">Base</label>
                            <input id="baseColor" type="color" value={baseColor} onChange={e => setBaseColor(e.target.value)} className={colorInputClass} />
                        </div>
                         <div className="flex items-center gap-1.5">
                            <label htmlFor="playheadColor" className="font-medium text-gray-400">Playhead</label>
                            <input id="playheadColor" type="color" value={playheadColor} onChange={e => setPlayheadColor(e.target.value)} className={colorInputClass} />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <label htmlFor="cooldownStartColor" className="font-medium text-gray-400">Cooldown</label>
                            <input id="cooldownStartColor" type="color" value={cooldownStartColor} onChange={e => setCooldownStartColor(e.target.value)} className={colorInputClass} />
                             <input id="cooldownEndColor" type="color" value={cooldownEndColor} onChange={e => setCooldownEndColor(e.target.value)} className={colorInputClass} />
                        </div>
                         <div className="flex-grow flex items-center gap-2 min-w-[150px]">
                            <label htmlFor="hitColorShift" className="font-medium text-gray-400 whitespace-nowrap">Hit Hue Shift</label>
                            <input id="hitColorShift" type="range" min="0" max="0.2" step="0.005" value={hitColorShift} onChange={e => setHitColorShift(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" />
                        </div>
                    </div>
                </fieldset>
            </div>

            {vizMode === 'single' ? (
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Shape:</span>
                    <div className="p-1 bg-gray-900/50 rounded-md flex">
                        {shapes.map(shape => ( <button key={shape} onClick={() => setShapeA(shape)} className={`px-3 py-1 text-xs rounded transition-colors capitalize ${shapeA === shape ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:bg-gray-700'}`}>{shape}</button>))}
                    </div>
                </div>
            ) : (
                <div className="bg-gray-900/50 p-2 rounded-md space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="flex flex-col gap-1"><label htmlFor="shapeA" className="font-bold text-gray-300">Shape A</label><select id="shapeA" value={shapeA} onChange={e => setShapeA(e.target.value as ShapeType)} className="bg-gray-700 border border-gray-600 text-white text-xs rounded-md focus:ring-cyan-500 focus:border-cyan-500 block w-full p-1 capitalize">{shapes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                       <div className="flex flex-col gap-1"><label htmlFor="shapeB" className="font-bold text-gray-300">Shape B</label><select id="shapeB" value={shapeB} onChange={e => setShapeB(e.target.value as ShapeType)} className="bg-gray-700 border border-gray-600 text-white text-xs rounded-md focus:ring-cyan-500 focus:border-cyan-500 block w-full p-1 capitalize">{shapes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    </div>
                     <div className="flex items-center gap-2"><label htmlFor="blendFactor" className="font-medium text-gray-400 whitespace-nowrap">A</label><input id="blendFactor" type="range" min="0" max="1" step="0.01" value={blendFactor} onChange={e => setBlendFactor(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" /><label htmlFor="blendFactor" className="font-medium text-gray-400 whitespace-nowrap">B</label></div>
                </div>
            )}
             <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex-grow flex items-center gap-2 min-w-[120px]">
                    <label htmlFor="spikeScale" className="font-medium text-gray-400 whitespace-nowrap">Spike</label>
                    <input id="spikeScale" type="range" min="0" max="10" step="0.1" value={spikeScale} onChange={e => setSpikeScale(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" />
                </div>
                <div className="flex-grow flex items-center gap-2 min-w-[120px]">
                    <label htmlFor="torsion" className="font-medium text-gray-400 whitespace-nowrap">Torsion</label>
                    <input id="torsion" type="range" min="0" max="5" step="0.1" value={torsion} onChange={e => setTorsion(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" />
                </div>
                {showPolarPinch && (<div className="flex-grow flex items-center gap-2 min-w-[120px]">
                    <label htmlFor="polarPinch" className="font-medium text-gray-400 whitespace-nowrap">Pinch</label>
                    <input id="polarPinch" type="range" min="0.1" max="2" step="0.05" value={polarPinch} onChange={e => setPolarPinch(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" />
                </div>)}
                {showTorusRadius && (<div className="flex-grow flex items-center gap-2 min-w-[120px]">
                    <label htmlFor="torusRadius" className="font-medium text-gray-400 whitespace-nowrap">Radius</label>
                    <input id="torusRadius" type="range" min="1" max="5" step="0.1" value={torusRadius} onChange={e => setTorusRadius(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-cyan-500" />
                </div>)}
            </div>
            <div className="border-t border-gray-700/50 my-2"></div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <IconWave className="w-5 h-5 text-purple-400" />
                    <span className="font-bold text-gray-300 whitespace-nowrap">Shape Audio</span>
                </div>
                <button onClick={handlePlaySonified} disabled={isPlayButtonDisabled} className="p-2 bg-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/40 transition-colors disabled:opacity-50 flex-shrink-0">
                    {sonificationState.isSonifying && isCurrentAudioActive ? (<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>) : (<PlayButtonIcon className="w-5 h-5" />)}
                </button>
                <div className="flex-grow flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-2">
                        <label htmlFor="bitrate" className="text-gray-400">Bitrate</label>
                        <input id="bitrate" type="range" min="32" max="320" step="8" value={bitrate} onChange={e => setBitrate(Number(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-purple-500 disabled:opacity-50" disabled={areControlsDisabled}/>
                        <span className="text-purple-400 font-mono w-14 text-right">{bitrate} kbps</span>
                    </div>
                     <div className="flex items-center gap-2">
                        <label htmlFor="duration" className="text-gray-400">Duration</label>
                        <input id="duration" type="range" min="1" max={Math.max(180, Math.ceil(originalDuration))} step="1" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-thumb:bg-purple-500 disabled:opacity-50" disabled={areControlsDisabled || useOriginalDuration}/>
                        <span className="text-purple-400 font-mono w-14 text-right">{effectiveDuration.toFixed(1)} s</span>
                    </div>
                     <div className="flex items-center justify-end gap-2 pr-16 -mt-1">
                        <label htmlFor="useOriginalDurationCheckbox" className="text-gray-400 text-xs cursor-pointer select-none">Use original length</label>
                        <input
                            id="useOriginalDurationCheckbox"
                            type="checkbox"
                            checked={useOriginalDuration}
                            onChange={() => setUseOriginalDuration(v => !v)}
                            disabled={areControlsDisabled}
                            className="w-4 h-4 text-purple-500 bg-gray-700 border-gray-600 rounded focus:ring-purple-600 focus:ring-offset-gray-900 cursor-pointer disabled:opacity-50"
                        />
                    </div>
                </div>
            </div>
            {isCurrentAudioActive && sonificationState.error && <p className="text-xs text-red-400 text-center mt-1">{sonificationState.error}</p>}
        </div>
    </div>
  );
}

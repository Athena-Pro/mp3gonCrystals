
import { TransformationType, TransformationParams } from '../types';

interface LiveProcessorOptions {
    micStream: MediaStream;
    targetBuffer: AudioBuffer;
    transformation: TransformationType;
    params: TransformationParams;
}

const WORKLET_NAME = 'transform-processor';
const WORKLET_URL = '/transform-processor.js'; // Ensure this matches the public path

export default class LiveAudioProcessor {
    private context: AudioContext | null = null;
    private micSource: MediaStreamAudioSourceNode | null = null;
    private targetSource: AudioBufferSourceNode | null = null;
    private workletNode: AudioWorkletNode | null = null;

    async start({ micStream, targetBuffer, transformation, params }: LiveProcessorOptions): Promise<void> {
        if (this.context) {
            console.warn("Processor already started. Call stop() first.");
            return;
        }

        try {
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // Wait for the context to be running
            if (this.context.state === 'suspended') {
                await this.context.resume();
            }

            await this.context.audioWorklet.addModule(WORKLET_URL);

            this.micSource = this.context.createMediaStreamSource(micStream);
            
            this.targetSource = this.context.createBufferSource();
            this.targetSource.buffer = targetBuffer;
            this.targetSource.loop = true;

            this.workletNode = new AudioWorkletNode(this.context, WORKLET_NAME, {
                processorOptions: { 
                    transformation,
                    params
                },
                numberOfInputs: 2,
                numberOfOutputs: 1,
                outputChannelCount: [targetBuffer.numberOfChannels],
            });

            // Connect mic to input 0, target to input 1
            this.micSource.connect(this.workletNode, 0, 0);
            this.targetSource.connect(this.workletNode, 0, 1);

            this.workletNode.connect(this.context.destination);

            this.targetSource.start();

        } catch (error) {
            console.error('Error starting live audio processor:', error);
            // Cleanup on failure
            this.stop();
            throw new Error('Failed to initialize audio worklet. It might not be available in your browser or the path is incorrect.');
        }
    }
    
    updateParameters(params: TransformationParams): void {
        if (this.workletNode) {
            this.workletNode.port.postMessage({
                type: 'UPDATE_PARAMS',
                payload: params,
            });
        }
    }

    stop(): void {
        if (!this.context) return;

        this.micSource?.disconnect();
        this.targetSource?.stop();
        this.targetSource?.disconnect();
        this.workletNode?.disconnect();

        // Close the context to release resources
        if (this.context.state !== 'closed') {
            this.context.close();
        }

        this.context = null;
        this.micSource = null;
        this.targetSource = null;
        this.workletNode = null;
    }
}


// A simple one-pole low-pass filter for envelope smoothing
class EnvelopeFollower {
    constructor(smoothing = 0.998) {
        this.smoothing = smoothing;
        this.lastValue = 0.0;
    }

    process(sample) {
        const value = Math.abs(sample);
        this.lastValue = this.smoothing * this.lastValue + (1.0 - this.smoothing) * value;
        return this.lastValue;
    }
}

class TransformProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.transformation = options.processorOptions.transformation;
        this.params = options.processorOptions.params;
        
        this._initialize();

        this.port.onmessage = (event) => {
            if (event.data.type === 'UPDATE_PARAMS') {
                this.params = { ...this.params, ...event.data.payload };
                this._updateParams();
            }
        };
    }

    _initialize() {
        this.envelopeFollower = new EnvelopeFollower(0.998); // Slowish smoothing for gating
        this._updateParams();
    }
    
    _updateParams() {
        // Set internal variables from params for efficiency in process loop
        this.gateThreshold = this.params.gateThreshold || 0.2;
    }

    process(inputs, outputs, parameters) {
        const sourceInput = inputs[0];
        const targetInput = inputs[1];
        const output = outputs[0];

        // We need both inputs to do anything
        if (sourceInput.length === 0 || targetInput.length === 0 || sourceInput[0].length === 0 || targetInput[0].length === 0) {
            return true;
        }

        const sourceChannel = sourceInput[0]; // Assuming mono mic input
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            const targetChannel = targetInput[channel];

            for (let i = 0; i < outputChannel.length; i++) {
                const sourceSample = sourceChannel[i] || 0;
                const targetSample = targetChannel[i] || 0;
                let processedSample = targetSample;

                switch(this.transformation) {
                    case 'Amplitude Mapping': {
                        const envelope = this.envelopeFollower.process(sourceSample);
                        processedSample = targetSample * envelope * 5.0; // Boost gain
                        break;
                    }
                    
                    case 'Rhythmic Gating': {
                        const envelope = this.envelopeFollower.process(sourceSample);
                        const gate = envelope > this.gateThreshold ? 1.0 : 0.0;
                        processedSample = targetSample * gate;
                        break;
                    }
                    
                    // For disabled transformations, just pass through target audio
                    case 'Spectral Shaping':
                    case 'Convolution Morphing':
                    default:
                        processedSample = targetSample;
                        break;
                }
                outputChannel[i] = processedSample;
            }
        }

        return true; // Keep processor alive
    }
}

registerProcessor('transform-processor', TransformProcessor);

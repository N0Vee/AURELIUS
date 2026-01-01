// AudioWorkletProcessor for capturing and resampling microphone audio
// Resamples from native rate (usually 48kHz) to 16kHz for ASR
// Sends exactly 512 samples per chunk (required by Silero VAD at 16kHz)

class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
        // Assume native rate is 48kHz, target is 16kHz (ratio of 3)
        this.resampleRatio = 3;
        // Silero VAD requires EXACTLY 512 samples at 16kHz
        this.targetBufferSize = 512;
    }

    // Simple downsampling by picking every Nth sample
    downsample(inputData) {
        const outputLength = Math.floor(inputData.length / this.resampleRatio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            output[i] = inputData[Math.floor(i * this.resampleRatio)];
        }

        return output;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input && input.length > 0 && input[0].length > 0) {
            const inputData = input[0]; // Mono channel

            // Resample to 16kHz
            const resampled = this.downsample(inputData);

            // Add to buffer
            for (let i = 0; i < resampled.length; i++) {
                this.buffer.push(resampled[i]);
            }

            // Send EXACTLY 512 samples when we have enough
            while (this.buffer.length >= this.targetBufferSize) {
                const chunk = new Float32Array(this.targetBufferSize);
                for (let i = 0; i < this.targetBufferSize; i++) {
                    chunk[i] = this.buffer.shift();
                }
                this.port.postMessage(chunk);
            }
        }

        return true; // Keep processor alive
    }
}

registerProcessor('audio-processor', AudioProcessor);

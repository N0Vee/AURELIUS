// AudioWorkletProcessor for capturing microphone audio
// Sends raw audio at native sample rate (usually 48kHz) for Moonshine ASR

class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
        this.targetBufferSize = 4096;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];

        if (input && input.length > 0 && input[0].length > 0) {
            const inputData = input[0];

            // Add to buffer
            for (let i = 0; i < inputData.length; i++) {
                this.buffer.push(inputData[i]);
            }

            // Send chunks
            while (this.buffer.length >= this.targetBufferSize) {
                const chunk = new Float32Array(this.targetBufferSize);
                for (let i = 0; i < this.targetBufferSize; i++) {
                    chunk[i] = this.buffer.shift();
                }
                this.port.postMessage(chunk);
            }
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);

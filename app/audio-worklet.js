class AudioHapticsWorkletProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const ch0 = input[0];
            const ch1 = input[1];
            if (ch0 && ch0.length > 0) {
                const frameCount = ch0.length;
                const numChannels = ch1 && ch1.length > 0 ? 2 : 1;
                const totalFloats = frameCount * numChannels;
                const interleaved = new Float32Array(totalFloats);
                if (numChannels >= 2 && ch1) {
                    for (let i = 0; i < frameCount; i++) {
                        interleaved[i * 2] = ch0[i];
                        interleaved[i * 2 + 1] = ch1[i];
                    }
                } else {
                    interleaved.set(ch0);
                }
                this.port.postMessage({
                    audioData: interleaved,
                    frameCount,
                    numChannels
                }, [interleaved.buffer]);
            }
        }
        return true;
    }
}
registerProcessor('audio-haptics-worklet-processor', AudioHapticsWorkletProcessor);
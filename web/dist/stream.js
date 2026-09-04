export class AudioHapticsManager {
    setApi(api) {
        this.api = api;
    }
    constructor(options) {
        this.enabled = false;
        this.stream = null;
        this.context = null;
        this.source = null;
        this.processor = null;
        this.mute = null;
        this.bufferPtr = 0;
        this.bufferCapacity = 0;
        this.api = null;
        this.options = options;
    }
    submit(data, frames, channels, rate) {
        const bytes = data.length * Float32Array.BYTES_PER_ELEMENT;
        if (this.bufferCapacity < bytes) {
            if (this.bufferPtr)
                this.options.module._free(this.bufferPtr);
            this.bufferPtr = this.options.module._malloc(bytes);
            this.bufferCapacity = bytes;
        }
        const heap = this.options.module.HEAPU8;
        new Float32Array(heap.buffer, heap.byteOffset + this.bufferPtr, data.length).set(data);
        this.api?.audioSubmitSamples(this.bufferPtr, frames, channels, rate);
    }
    async applySettings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce, gain = 1.0, volume = 100) {
        this.api?.audioInit(volume, gain);
        this.api?.settings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce);
        this.api?.output(device);
    }
    async disable() {
        if (!this.enabled && !this.stream)
            return;
        this.enabled = false;
        this.processor?.disconnect();
        if (this.processor && "port" in this.processor) {
            this.processor.port.close();
        }
        this.source?.disconnect();
        this.mute?.disconnect();
        if (this.context) {
            await this.context.close().catch(() => { });
        }
        this.stream?.getTracks().forEach((track) => track.stop());
        if (this.bufferPtr) {
            this.options.module._free(this.bufferPtr);
        }
        this.stream = null;
        this.context = null;
        this.source = null;
        this.processor = null;
        this.mute = null;
        this.bufferPtr = 0;
        this.bufferCapacity = 0;
        this.options.onChange?.(false);
    }
    async enable() {
        if (this.enabled)
            return;
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
            throw new Error("getDisplayMedia não é suportado neste ambiente.");
        }
        const nextStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
        if (nextStream.getAudioTracks().length === 0) {
            nextStream.getTracks().forEach((track) => track.stop());
            throw new Error("Nenhuma faixa de áudio disponível. Marque 'Compartilhar áudio'.");
        }
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const nextContext = new AudioContextClass();
            if (nextContext.state === "suspended") {
                console.error("Audio context is suspended. Attempting to resume...");
                await nextContext.resume();
            }
            const nextSource = nextContext.createMediaStreamSource(nextStream);
            let nextProcessor;
            if (nextContext.audioWorklet && typeof nextContext.audioWorklet.addModule === "function") {
                await nextContext.audioWorklet.addModule("audio-worklet.js");
                const node = new AudioWorkletNode(nextContext, "audio-haptics-worklet-processor");
                node.port.onmessage = (event) => {
                    const value = event.data;
                    this.submit(value.audioData, value.frameCount, value.numChannels, nextContext.sampleRate);
                };
                nextProcessor = node;
            }
            else {
                const node = nextContext.createScriptProcessor(4096, 2, 2);
                node.onaudioprocess = (event) => {
                    const input = event.inputBuffer;
                    const channels = input.numberOfChannels;
                    const data = new Float32Array(input.length * channels);
                    for (let i = 0; i < input.length; i++) {
                        for (let c = 0; c < channels; c++) {
                            data[i * channels + c] = input.getChannelData(c)[i];
                        }
                    }
                    this.submit(data, input.length, channels, input.sampleRate);
                };
                nextProcessor = node;
            }
            const nextMute = nextContext.createGain();
            nextMute.gain.value = 0;
            nextSource.connect(nextProcessor);
            nextProcessor.connect(nextMute);
            nextMute.connect(nextContext.destination);
            const analyser = nextContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.7;
            nextSource.connect(analyser);
            // 2. Cria o Canvas
            const canvas = document.createElement("canvas");
            canvas.width = 400;
            canvas.height = 200;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            // 3. Loop de animação aprimorado
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let isVisualizerActive = true;
            const drawVisualizer = () => {
                if (!isVisualizerActive)
                    return;
                requestAnimationFrame(drawVisualizer);
                analyser.getByteFrequencyData(dataArray);
                if (ctx) {
                    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const centerY = canvas.height / 2;
                    const totalBars = dataArray.length;
                    const barWidth = (canvas.width / totalBars) * 1.5;
                    let x = 0;
                    const led = AudioHapticsManager.lastLightbarColor || { r: 0, g: 100, b: 255 };
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = `rgba(${led.r}, ${led.g}, ${led.b}, 0.8)`;
                    for (let i = 0; i < totalBars; i++) {
                        const barHeight = dataArray[i] * 0.7 || 2;
                        // Posição da barra de 0.0 (extrema esquerda/graves) a 1.0 (extrema direita/agudos)
                        const percent = i / totalBars;
                        const rBase = led.r + percent * 120; // Esquenta a cor em direção à direita
                        const gBase = led.g - percent * 80; // Diminui o verde em direção à direita
                        const bBase = led.b + (1 - percent) * 120; // Esfria a cor em direção à esquerda
                        // Aplica os limites RGB (0-255) e injeta o brilho de acordo com a altura (barHeight)
                        const r = Math.min(255, Math.max(0, rBase + barHeight / 3));
                        const g = Math.min(255, Math.max(0, gBase + barHeight / 3));
                        const b = Math.min(255, Math.max(0, bBase + barHeight / 3));
                        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                        // Desenha do centro para as bordas
                        ctx.fillRect(x, centerY - barHeight / 2, barWidth - 2, barHeight);
                        x += barWidth;
                    }
                    ctx.shadowBlur = 0;
                }
            };
            drawVisualizer();
            const canvasStream = canvas.captureStream(30);
            const fakeStream = new MediaStream([canvasStream.getVideoTracks()[0], nextStream.getAudioTracks()[0]]);
            // 5. Injeta no vídeo
            const videoElement = document.createElement("video");
            videoElement.srcObject = fakeStream;
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.playsInline = true;
            videoElement.addEventListener("loadedmetadata", () => {
                videoElement
                    .play()
                    .then(async () => {
                    try {
                        await videoElement.requestPictureInPicture();
                    }
                    catch (pipError) {
                        console.error("[WebHID] Erro ao abrir PiP do Visualizer:", pipError);
                    }
                })
                    .catch((e) => console.error("[WebHID] Erro no autoplay do vídeo:", e));
            });
            nextStream.getVideoTracks()[0]?.addEventListener("ended", () => {
                isVisualizerActive = false;
                if (document.pictureInPictureElement === videoElement) {
                    document.exitPictureInPicture().catch(() => { });
                }
                canvasStream.getTracks().forEach((track) => track.stop());
                console.log("Screen sharing ended.");
                if (this.enabled)
                    this.disable().catch(console.error);
            });
            this.stream = nextStream;
            this.context = nextContext;
            this.source = nextSource;
            this.processor = nextProcessor;
            this.mute = nextMute;
            this.enabled = true;
            this.options.onChange?.(true);
        }
        catch (error) {
            console.error("Error enabling audio context:", error);
            nextStream.getTracks().forEach((track) => track.stop());
            throw error;
        }
    }
    async toggle() {
        if (this.enabled) {
            await this.disable();
            return false;
        }
        await this.enable();
        return true;
    }
    isEnabled() {
        return this.enabled;
    }
}
AudioHapticsManager.lastLightbarColor = null;

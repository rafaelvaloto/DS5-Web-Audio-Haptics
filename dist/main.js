var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { createInMemoryDeviceRegistryPolicy, initializeDeviceRegistryPolicy, initializeWebHidPlatformBridge, requestSonyWebHidAccess, } from "./platform/web_hid_platform.js";
const FRAME_SECONDS = 0.010;
const FRAME_MS = 10;
const INPUT_DESCRIPTOR_SIZE = 148;
let bannerPrinted = false;
// Trigger Effect Payloads
const TRIGGER_GALLOPING = new Uint8Array([0x23, 0x82, 0x00, 0xf7, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_MACHINE = new Uint8Array([0x27, 0x80, 0x02, 0x3a, 0x0a, 0x04, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_FEEDBACK = new Uint8Array([0x21, 0xfe, 0x03, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x00, 0x00]);
const TRIGGER_WEAPON = new Uint8Array([0x25, 0x08, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_BOW = new Uint8Array([0x22, 0x02, 0x01, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_AUTOMATIC_GUN = new Uint8Array([0x26, 0x00, 0x03, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x0a]);
const TRIGGER_GAMECUBE = new Uint8Array([0x25, 0x90, 0x02, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const AUDIO_HAPTICS_WORKLET_CODE = `
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
`;
/** Audio haptics adapter for pages that own the UI/connection lifecycle. */
export function createAudioHapticsController(options) {
    var _a, _b, _c, _d, _e, _f;
    let enabled = false;
    let stream = null;
    let context = null;
    let source = null;
    let processor = null;
    let mute = null;
    let bufferPtr = 0;
    let bufferCapacity = 0;
    const settings = {
        bIsSpeaker: ((_a = options.settings) === null || _a === void 0 ? void 0 : _a.bIsSpeaker) === 0 ? 0 : 1,
        audioVolume: Math.min(100, Math.max(0, (_c = (_b = options.settings) === null || _b === void 0 ? void 0 : _b.audioVolume) !== null && _c !== void 0 ? _c : 100)),
        rumbleMode: ((_d = options.settings) === null || _d === void 0 ? void 0 : _d.rumbleMode) === 0xFF ? 0xFF : 0xFC,
        rumbleReduce: Math.min(15, Math.max(0, (_f = (_e = options.settings) === null || _e === void 0 ? void 0 : _e.rumbleReduce) !== null && _f !== void 0 ? _f : 0)),
    };
    const applySettings = (mode = settings.rumbleMode) => {
        var _a, _b, _c, _d;
        for (const id of options.deviceIds) {
            (_b = (_a = options.api).dualsenseSettings) === null || _b === void 0 ? void 0 : _b.call(_a, id, 0, 1, settings.bIsSpeaker, 0xc7, settings.audioVolume, mode, settings.rumbleReduce, 0);
            (_d = (_c = options.api).updateOutput) === null || _d === void 0 ? void 0 : _d.call(_c, id);
        }
    };
    const submit = (data, frames, channels, rate) => {
        if (!enabled || !options.api.audioSubmitSamples)
            return;
        const bytes = data.length * Float32Array.BYTES_PER_ELEMENT;
        if (bufferCapacity < bytes) {
            if (bufferPtr)
                options.module._free(bufferPtr);
            bufferPtr = options.module._malloc(bytes);
            bufferCapacity = bytes;
        }
        const heap = options.module.HEAPU8;
        new Float32Array(heap.buffer, heap.byteOffset + bufferPtr, data.length).set(data);
        options.api.audioSubmitSamples(bufferPtr, frames, channels, rate);
    };
    const disable = () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!enabled && !stream)
            return;
        enabled = false;
        processor === null || processor === void 0 ? void 0 : processor.disconnect();
        if (processor && "port" in processor)
            processor.port.close();
        source === null || source === void 0 ? void 0 : source.disconnect();
        mute === null || mute === void 0 ? void 0 : mute.disconnect();
        if (context)
            yield context.close().catch(() => { });
        stream === null || stream === void 0 ? void 0 : stream.getTracks().forEach((track) => track.stop());
        if (bufferPtr)
            options.module._free(bufferPtr);
        stream = null;
        context = null;
        source = null;
        processor = null;
        mute = null;
        bufferPtr = 0;
        bufferCapacity = 0;
        applySettings(0xFF);
        (_a = options.onChange) === null || _a === void 0 ? void 0 : _a.call(options, false);
    });
    const enable = () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (enabled)
            return;
        if (typeof navigator === "undefined" || !((_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getDisplayMedia)) {
            throw new Error("getDisplayMedia não é suportado neste ambiente.");
        }
        const nextStream = yield navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (nextStream.getAudioTracks().length === 0) {
            nextStream.getTracks().forEach((track) => track.stop());
            throw new Error("Nenhuma faixa de áudio disponível. Marque 'Compartilhar áudio'.");
        }
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const nextContext = new AudioContextClass();
            if (nextContext.state === "suspended")
                yield nextContext.resume();
            const nextSource = nextContext.createMediaStreamSource(nextStream);
            let nextProcessor;
            if (nextContext.audioWorklet && typeof nextContext.audioWorklet.addModule === "function") {
                const url = URL.createObjectURL(new Blob([AUDIO_HAPTICS_WORKLET_CODE], { type: "application/javascript" }));
                try {
                    yield nextContext.audioWorklet.addModule(url);
                }
                finally {
                    URL.revokeObjectURL(url);
                }
                const node = new AudioWorkletNode(nextContext, "audio-haptics-worklet-processor");
                node.port.onmessage = (event) => {
                    const value = event.data;
                    submit(value.audioData, value.frameCount, value.numChannels, nextContext.sampleRate);
                };
                nextProcessor = node;
            }
            else {
                const node = nextContext.createScriptProcessor(4096, 2, 2);
                node.onaudioprocess = (event) => {
                    const input = event.inputBuffer;
                    const channels = input.numberOfChannels;
                    const data = new Float32Array(input.length * channels);
                    for (let i = 0; i < input.length; i++)
                        for (let c = 0; c < channels; c++)
                            data[i * channels + c] = input.getChannelData(c)[i];
                    submit(data, input.length, channels, input.sampleRate);
                };
                nextProcessor = node;
            }
            const nextMute = nextContext.createGain();
            nextMute.gain.value = 0;
            nextSource.connect(nextProcessor);
            nextProcessor.connect(nextMute);
            nextMute.connect(nextContext.destination);
            nextStream.getTracks().forEach((track) => track.addEventListener("ended", () => { if (enabled)
                disable().catch(console.error); }));
            stream = nextStream;
            context = nextContext;
            source = nextSource;
            processor = nextProcessor;
            mute = nextMute;
            enabled = true;
            applySettings();
            (_b = options.onChange) === null || _b === void 0 ? void 0 : _b.call(options, true);
        }
        catch (error) {
            nextStream.getTracks().forEach((track) => track.stop());
            throw error;
        }
    });
    return { enable, disable, toggle: () => __awaiter(this, void 0, void 0, function* () { if (enabled) {
            yield disable();
            return false;
        } yield enable(); return true; }), isEnabled: () => enabled };
}
export class GamepadClientApplication {
    constructor(module, api, platformCleanup, registryCleanup, logFnPtr, deviceIds = new Set()) {
        this.previousInput = new Map();
        this.discoveryTimer = null;
        this.inputTimer = null;
        this.isRunning = false;
        this.isAudioHapticsEnabled = false;
        this.audioHapticsSettings = {
            bIsSpeaker: 1,
            audioVolume: 100,
            rumbleMode: 0xFC,
            rumbleReduce: 0,
        };
        this.audioContext = null;
        this.audioStream = null;
        this.audioProcessorNode = null;
        this.audioSourceNode = null;
        this.audioMuteNode = null;
        this.audioBufferPtr = 0;
        this.audioBufferCapacityBytes = 0;
        this.module = module;
        this.api = api;
        this.deviceIds = deviceIds;
        this.platformCleanup = platformCleanup;
        this.registryCleanup = registryCleanup;
        this.logFnPtr = logFnPtr;
        this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
        this.outputBufferPtr = module._malloc(64);
    }
    /**
     * Creates an application facade around a runtime already initialized by a
     * legacy/custom UI. The UI can still use the main class as the single owner
     * of audio haptics without initializing WASM or WebHID a second time.
     */
    static fromNativeRuntime(module, api, deviceIds) {
        return new GamepadClientApplication(module, api, { dispose: () => __awaiter(this, void 0, void 0, function* () { }) }, { dispose: () => { } }, null, deviceIds);
    }
    static create() {
        return __awaiter(this, arguments, void 0, function* (typeId = 0) {
            if (typeof navigator === "undefined" || !("hid" in navigator)) {
                throw new Error("Este loop usa WebHID e precisa rodar no navegador (com interação do usuário).");
            }
            yield requestSonyWebHidAccess();
            const initGamepadCoreHost = yield loadGamepadCoreHostFactory();
            const module = (yield initGamepadCoreHost());
            const platformCleanup = yield initializeWebHidPlatformBridge(module);
            let nextDeviceId = 1;
            const registryCallbacks = createInMemoryDeviceRegistryPolicy(nextDeviceId);
            const wrappedCallbacks = {
                alloc: (...args) => {
                    const deviceId = registryCallbacks.alloc(...args);
                    nextDeviceId = Math.max(nextDeviceId, deviceId + 1);
                    return deviceId;
                },
                dispatch: registryCallbacks.dispatch,
                disconnect: registryCallbacks.disconnect,
            };
            const appRef = { value: null };
            const registryCleanup = initializeDeviceRegistryPolicy(module, typeId, {
                alloc: wrappedCallbacks.alloc,
                dispatch: (deviceId) => {
                    var _a, _b, _c;
                    (_a = appRef.value) === null || _a === void 0 ? void 0 : _a.deviceIds.add(deviceId);
                    wrappedCallbacks.dispatch(deviceId);
                    console.log(`Device dispatched: ${deviceId}`);
                    // Enable Touchpad
                    if ((_b = appRef.value) === null || _b === void 0 ? void 0 : _b.api.enableTouch) {
                        appRef.value.api.enableTouch(deviceId, 1);
                        console.log(`Device ${deviceId}: Touchpad enabled.`);
                    }
                    if ((_c = appRef.value) === null || _c === void 0 ? void 0 : _c.getIsAudioHapticsEnabled()) {
                        appRef.value.applyAudioHapticsSettings(deviceId);
                    }
                },
                disconnect: (deviceId) => {
                    var _a, _b;
                    (_a = appRef.value) === null || _a === void 0 ? void 0 : _a.deviceIds.delete(deviceId);
                    (_b = appRef.value) === null || _b === void 0 ? void 0 : _b.previousInput.delete(deviceId);
                    wrappedCallbacks.disconnect(deviceId);
                    console.log(`Device disconnected: ${deviceId}`);
                },
            });
            const api = bindNativeApi(module);
            const logFnPtr = registerLogCallback(module, api);
            const app = new GamepadClientApplication(module, api, platformCleanup, registryCleanup, logFnPtr);
            appRef.value = app;
            return app;
        });
    }
    run() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        this.api.discoverDevices(2.0);
        const discoveryHandle = setInterval(() => {
            this.api.discoverDevices(FRAME_SECONDS);
        }, FRAME_MS);
        let frameCount = 0;
        const inputHandle = setInterval(() => {
            var _a, _b;
            const ids = Array.from(this.deviceIds);
            for (const deviceId of ids) {
                this.api.updateInput(deviceId, FRAME_SECONDS);
                if (this.audioHapticsSettings.rumbleMode === 0xFC) {
                    (_b = (_a = this.api).updateOutput) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId);
                }
            }
            // for (const deviceId of ids) {
            //   const state = this.readInputState(deviceId);
            //   this.handleInput(deviceId, state);
            // }
        }, FRAME_MS);
        this.discoveryTimer = discoveryHandle;
        this.inputTimer = inputHandle;
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.isRunning) {
                return;
            }
            this.isRunning = false;
            if (this.discoveryTimer) {
                clearInterval(this.discoveryTimer);
            }
            if (this.inputTimer) {
                clearInterval(this.inputTimer);
            }
            yield this.disableAudioHaptics();
            this.registryCleanup.dispose();
            yield this.platformCleanup.dispose();
            (_b = (_a = this.api).shutdown) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (this.logFnPtr !== null) {
                this.module.removeFunction(this.logFnPtr);
            }
            this.module._free(this.inputBufferPtr);
            this.module._free(this.outputBufferPtr);
        });
    }
    getIsAudioHapticsEnabled() {
        return this.isAudioHapticsEnabled;
    }
    getAudioHapticsSettings() {
        return Object.assign({}, this.audioHapticsSettings);
    }
    setAudioHapticsSettings(settings) {
        var _a, _b;
        this.audioHapticsSettings = {
            bIsSpeaker: settings.bIsSpeaker === 0 ? 0 : 1,
            audioVolume: Math.min(100, Math.max(0, Math.round((_a = settings.audioVolume) !== null && _a !== void 0 ? _a : this.audioHapticsSettings.audioVolume))),
            rumbleMode: settings.rumbleMode === 0xFF ? 0xFF : 0xFC,
            rumbleReduce: Math.min(15, Math.max(0, Math.round((_b = settings.rumbleReduce) !== null && _b !== void 0 ? _b : this.audioHapticsSettings.rumbleReduce))),
        };
        if (this.isAudioHapticsEnabled) {
            for (const deviceId of this.deviceIds) {
                this.applyAudioHapticsSettings(deviceId);
            }
        }
    }
    applyAudioHapticsSettings(deviceId, rumbleMode = this.audioHapticsSettings.rumbleMode) {
        var _a, _b, _c, _d;
        (_b = (_a = this.api).dualsenseSettings) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId, 0, 1, this.audioHapticsSettings.bIsSpeaker, 0xc7, this.audioHapticsSettings.audioVolume, rumbleMode, this.audioHapticsSettings.rumbleReduce, 0);
        (_d = (_c = this.api).updateOutput) === null || _d === void 0 ? void 0 : _d.call(_c, deviceId);
    }
    enableAudioHaptics() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.isAudioHapticsEnabled) {
                return;
            }
            if (typeof navigator === "undefined" || !((_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getDisplayMedia)) {
                throw new Error("getDisplayMedia não é suportado neste ambiente.");
            }
            const stream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: {
                    autoGainControl: true,
                    echoCancellation: false,
                    noiseSuppression: false,
                    channelCount: 1,
                    sampleRate: 48000
                }
            });
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                stream.getTracks().forEach((track) => track.stop());
                throw new Error("Nenhuma faixa de áudio disponível no stream.");
            }
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass({
                sampleRate: 48000,
                latencyHint: "interactive", // Configurado para menor latência
            });
            if (ctx.state === "suspended") {
                yield ctx.resume();
            }
            const source = ctx.createMediaStreamSource(stream);
            if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function") {
                const blob = new Blob([AUDIO_HAPTICS_WORKLET_CODE], { type: "application/javascript" });
                const workletUrl = URL.createObjectURL(blob);
                try {
                    yield ctx.audioWorklet.addModule(workletUrl);
                }
                finally {
                    URL.revokeObjectURL(workletUrl);
                }
                const workletNode = new AudioWorkletNode(ctx, "audio-haptics-worklet-processor");
                workletNode.port.onmessage = (event) => {
                    if (!this.isAudioHapticsEnabled || !this.api.audioSubmitSamples) {
                        return;
                    }
                    const { audioData, frameCount, numChannels } = event.data;
                    const totalFloats = frameCount * numChannels;
                    const totalBytes = totalFloats * Float32Array.BYTES_PER_ELEMENT; // Corrigido para multiplicar por 4 bytes
                    if (this.audioBufferCapacityBytes < totalBytes) {
                        if (this.audioBufferPtr !== 0) {
                            this.module._free(this.audioBufferPtr);
                        }
                        this.audioBufferPtr = this.module._malloc(totalBytes);
                        this.audioBufferCapacityBytes = totalBytes;
                    }
                    const heap = this.module.HEAPU8;
                    const floatView = new Float32Array(heap.buffer, heap.byteOffset + this.audioBufferPtr, totalFloats);
                    floatView.set(audioData);
                    this.api.audioSubmitSamples(this.audioBufferPtr, frameCount, numChannels, ctx.sampleRate);
                };
                // Cria o nó mudo com ganho 0
                const muteNode = ctx.createGain();
                muteNode.gain.value = 0;
                // Conecta a fonte -> worklet -> mudo -> destino final
                source.connect(workletNode);
                workletNode.connect(muteNode);
                muteNode.connect(ctx.destination);
                // Desativa haptics se o usuário encerrar o compartilhamento de tela
                stream.getVideoTracks().concat(audioTracks).forEach((track) => {
                    track.addEventListener("ended", () => {
                        if (this.isAudioHapticsEnabled) {
                            this.disableAudioHaptics().catch(console.error);
                        }
                    });
                });
                this.audioMuteNode = muteNode; // Adicione esta propriedade na sua classe para limpeza posterior
                this.audioStream = stream;
                this.audioContext = ctx;
                this.audioSourceNode = source;
                this.audioProcessorNode = workletNode;
                this.isAudioHapticsEnabled = true;
                for (const deviceId of this.deviceIds) {
                    this.applyAudioHapticsSettings(deviceId);
                }
            }
        });
    }
    disableAudioHaptics() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isAudioHapticsEnabled) {
                return;
            }
            this.isAudioHapticsEnabled = false;
            if (this.audioProcessorNode) {
                this.audioProcessorNode.disconnect();
                if ("onaudioprocess" in this.audioProcessorNode) {
                    this.audioProcessorNode.onaudioprocess = null;
                }
                if ("port" in this.audioProcessorNode) {
                    const port = this.audioProcessorNode.port;
                    port.onmessage = null;
                    port.close();
                }
                this.audioProcessorNode = null;
            }
            if (this.audioSourceNode) {
                this.audioSourceNode.disconnect();
                this.audioSourceNode = null;
            }
            if (this.audioMuteNode) {
                this.audioMuteNode.disconnect();
                this.audioMuteNode = null;
            }
            if (this.audioContext) {
                yield this.audioContext.close().catch(() => { });
                this.audioContext = null;
            }
            if (this.audioStream) {
                this.audioStream.getTracks().forEach((track) => track.stop());
                this.audioStream = null;
            }
            if (this.audioBufferPtr !== 0) {
                this.module._free(this.audioBufferPtr);
                this.audioBufferPtr = 0;
                this.audioBufferCapacityBytes = 0;
            }
            // RumbleMode = 0xff, vibracao normal.
            const ids = Array.from(this.deviceIds);
            for (const deviceId of ids) {
                this.applyAudioHapticsSettings(deviceId, 0xFF);
            }
        });
    }
    toggleAudioHaptics() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isAudioHapticsEnabled) {
                yield this.disableAudioHaptics();
                return false;
            }
            else {
                yield this.enableAudioHaptics();
                return true;
            }
        });
    }
    readInputState(deviceId) {
        this.api.getInputState(deviceId, this.inputBufferPtr);
        const b = this.inputBufferPtr;
        const heap = this.module.HEAPU8;
        const rf = (offset) => {
            if (typeof this.module.getValue === "function") {
                return this.module.getValue(b + offset, "float");
            }
            const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
            return view.getFloat32(0, true);
        };
        const ri32 = (offset) => {
            if (typeof this.module.getValue === "function") {
                return this.module.getValue(b + offset, "i32");
            }
            const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
            return view.getInt32(0, true);
        };
        const rb = (offset) => { var _a; return ((_a = heap[b + offset]) !== null && _a !== void 0 ? _a : 0) !== 0; };
        const ru8 = (offset) => { var _a; return (_a = heap[b + offset]) !== null && _a !== void 0 ? _a : 0; };
        return {
            analogDeadZone: rf(0),
            leftAnalogX: rf(4),
            leftAnalogY: rf(8),
            rightAnalogX: rf(12),
            rightAnalogY: rf(16),
            leftTriggerAnalog: rf(20),
            rightTriggerAnalog: rf(24),
            gyroscopeX: rf(28),
            gyroscopeY: rf(32),
            gyroscopeZ: rf(36),
            accelerometerX: rf(40),
            accelerometerY: rf(44),
            accelerometerZ: rf(48),
            gravityX: rf(52),
            gravityY: rf(56),
            gravityZ: rf(60),
            tiltX: rf(64),
            tiltY: rf(68),
            tiltZ: rf(72),
            touchId: ri32(76),
            touchFingerCount: ri32(80),
            directionRaw: ru8(84),
            bIsTouching: rb(85),
            touchRadiusX: rf(88),
            touchRadiusY: rf(92),
            touchPositionX: rf(96),
            touchPositionY: rf(100),
            touchRelativeX: rf(104),
            touchRelativeY: rf(108),
            bCross: rb(112),
            bSquare: rb(113),
            bTriangle: rb(114),
            bCircle: rb(115),
            bDpadUp: rb(116),
            bDpadDown: rb(117),
            bDpadLeft: rb(118),
            bDpadRight: rb(119),
            bLeftAnalogRight: rb(120),
            bLeftAnalogUp: rb(121),
            bLeftAnalogDown: rb(122),
            bLeftAnalogLeft: rb(123),
            bRightAnalogLeft: rb(124),
            bRightAnalogDown: rb(125),
            bRightAnalogUp: rb(126),
            bRightAnalogRight: rb(127),
            bLeftTriggerThreshold: rb(128),
            bRightTriggerThreshold: rb(129),
            bLeftShoulder: rb(130),
            bRightShoulder: rb(131),
            bLeftStick: rb(132),
            bRightStick: rb(133),
            bPSButton: rb(134),
            bShare: rb(135),
            bStart: rb(136),
            bTouch: rb(137),
            bMute: rb(138),
            bHasPhoneConnected: rb(139),
            bFn1: rb(140),
            bFn2: rb(141),
            bPaddleLeft: rb(142),
            bPaddleRight: rb(143),
            batteryLevel: rf(144),
        };
    }
    handleInput(deviceId, state) {
        this.previousInput.set(deviceId, state);
    }
    setTriggerEffect(deviceId, payload, hand) {
        if (!this.api.customTrigger || !this.api.updateOutput) {
            return;
        }
        this.module.HEAPU8.set(payload, this.outputBufferPtr);
        this.api.customTrigger(deviceId, this.outputBufferPtr, payload.length, hand);
        this.api.updateOutput(deviceId);
    }
    stopTriggers(deviceId) {
        var _a, _b, _c, _d, _e, _f;
        (_b = (_a = this.api).stopTrigger) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId, 0);
        (_d = (_c = this.api).stopTrigger) === null || _d === void 0 ? void 0 : _d.call(_c, deviceId, 1);
        (_f = (_e = this.api).updateOutput) === null || _f === void 0 ? void 0 : _f.call(_e, deviceId);
    }
    setBasicOutput(deviceId, leftRumble, rightRumble, red, green, blue) {
        var _a, _b, _c, _d, _e, _f;
        (_b = (_a = this.api).setVibration) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId, leftRumble, rightRumble);
        (_d = (_c = this.api).lightbar) === null || _d === void 0 ? void 0 : _d.call(_c, deviceId, red, green, blue);
        (_f = (_e = this.api).updateOutput) === null || _f === void 0 ? void 0 : _f.call(_e, deviceId);
    }
}
export function startGamepadClientLoop() {
    return __awaiter(this, arguments, void 0, function* (typeId = 0) {
        const app = yield GamepadClientApplication.create(typeId);
        app.run();
        return app;
    });
}
function bindNativeApi(module) {
    const cwrap = module.cwrap.bind(module);
    const must = (name, returnType, args) => {
        return cwrap(name, returnType, args);
    };
    const maybe = (name, returnType, args) => {
        try {
            return cwrap(name, returnType, args);
        }
        catch (_a) {
            return undefined;
        }
    };
    return {
        setLogCallback: maybe("GCH_SetLogCallback", null, ["number"]),
        discoverDevices: must("GCH_DiscoverDevices", null, ["number"]),
        updateInput: must("GCH_UpdateInput", null, ["number", "number"]),
        getInputState: must("GCH_GetInputState", null, ["number", "number"]),
        enableGyroscopeValues: maybe("GCH_EnableGyroscopeValues", null, ["number", "number"]),
        enableTouch: maybe("GCH_EnableTouch", null, ["number", "number"]),
        resetGyroOrientation: maybe("GCH_ResetGyroOrientation", null, ["number"]),
        batteryLevelDevice: maybe("GCH_BatteryLevelDevice", "number", ["number"]),
        setVibration: maybe("GCH_SetVibration", null, ["number", "number", "number"]),
        lightbar: maybe("GCH_Lightbar", null, ["number", "number", "number", "number"]),
        resetLights: maybe("GCH_ResetLights", null, ["number"]),
        updateOutput: maybe("GCH_UpdateOutput", null, ["number"]),
        customTrigger: maybe("GCH_CustomTrigger", "number", ["number", "number", "number", "number"]),
        stopTrigger: maybe("GCH_StopTrigger", null, ["number", "number"]),
        shutdown: maybe("GCH_Shutdown", null, []),
        audioSubmitSamples: maybe("GCH_AudioSubmitSamples", "number", ["number", "number", "number", "number"]),
        getProcessAudioHaptics: (maybe("GCH_GetProcessAudioHaptics", "number", ["number"]) || maybe("GCH_ProcessAudioHaptics", "number", ["number"])),
        processAudioHaptics: (maybe("GCH_GetProcessAudioHaptics", "number", ["number"]) || maybe("GCH_ProcessAudioHaptics", "number", ["number"])),
        dualsenseSettings: maybe("GCH_DualSenseSettings", null, ["number", "number", "number", "number", "number", "number", "number", "number", "number"]),
    };
}
function registerLogCallback(module, api) {
    if (!api.setLogCallback) {
        return null;
    }
    const logPtr = module.addFunction((level, messagePtr) => {
        const text = readCString(module.HEAPU8, messagePtr);
        console.log(`[Native:${level}] ${text}`);
    }, "vii");
    api.setLogCallback(logPtr);
    return logPtr;
}
function loadGamepadCoreHostFactory() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const esm = yield import("./lib/GamepadCoreHost.js");
        const candidate = (_a = esm.default) !== null && _a !== void 0 ? _a : esm;
        if (typeof candidate !== "function") {
            throw new Error("GamepadCoreHost.js inválido: export esperado é função de inicialização.");
        }
        return candidate;
    });
}
function readCString(heap, ptr) {
    if (!ptr) {
        return "";
    }
    let end = ptr;
    while (heap[end] !== 0) {
        end++;
    }
    return new TextDecoder().decode(heap.subarray(ptr, end));
}

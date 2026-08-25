"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamepadClientApplication = void 0;
exports.startGamepadClientLoop = startGamepadClientLoop;
const web_hid_platform_ts_1 = require("./platform/web_hid_platform.js");
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
class GamepadClientApplication {
    constructor(module, api, platformCleanup, registryCleanup, logFnPtr) {
        this.deviceIds = new Set();
        this.previousInput = new Map();
        this.discoveryTimer = null;
        this.inputTimer = null;
        this.isRunning = false;
        this.isAudioHapticsEnabled = false;
        this.audioContext = null;
        this.audioStream = null;
        this.audioProcessorNode = null;
        this.audioSourceNode = null;
        this.audioBufferPtr = 0;
        this.audioBufferCapacityBytes = 0;
        this.module = module;
        this.api = api;
        this.platformCleanup = platformCleanup;
        this.registryCleanup = registryCleanup;
        this.logFnPtr = logFnPtr;
        this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
        this.outputBufferPtr = module._malloc(64);
    }
    static create() {
        return __awaiter(this, arguments, void 0, function* (typeId = 0) {
            if (typeof navigator === "undefined" || !("hid" in navigator)) {
                throw new Error("Este loop usa WebHID e precisa rodar no navegador (com interação do usuário).");
            }
            yield (0, web_hid_platform_ts_1.requestSonyWebHidAccess)();
            const initGamepadCoreHost = yield loadGamepadCoreHostFactory();
            const module = (yield initGamepadCoreHost());
            const platformCleanup = yield (0, web_hid_platform_ts_1.initializeWebHidPlatformBridge)(module);
            let nextDeviceId = 1;
            const registryCallbacks = (0, web_hid_platform_ts_1.createInMemoryDeviceRegistryPolicy)(nextDeviceId);
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
            const registryCleanup = (0, web_hid_platform_ts_1.initializeDeviceRegistryPolicy)(module, typeId, {
                alloc: wrappedCallbacks.alloc,
                dispatch: (deviceId) => {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    (_a = appRef.value) === null || _a === void 0 ? void 0 : _a.deviceIds.add(deviceId);
                    wrappedCallbacks.dispatch(deviceId);
                    printStartupBanner();
                    console.log(`Device dispatched: ${deviceId}`);
                    // Enable Gyroscope and Touchpad
                    if ((_b = appRef.value) === null || _b === void 0 ? void 0 : _b.api.enableGyroscopeValues) {
                        appRef.value.api.enableGyroscopeValues(deviceId, 1);
                        console.log(`Device ${deviceId}: Gyroscope enabled.`);
                    }
                    if ((_c = appRef.value) === null || _c === void 0 ? void 0 : _c.api.enableTouch) {
                        appRef.value.api.enableTouch(deviceId, 1);
                        console.log(`Device ${deviceId}: Touchpad enabled.`);
                    }
                    if ((_d = appRef.value) === null || _d === void 0 ? void 0 : _d.getIsAudioHapticsEnabled()) {
                        (_f = (_e = appRef.value.api).dualsenseSettings) === null || _f === void 0 ? void 0 : _f.call(_e, deviceId, 0, 0, 1, 0, 100, 0x0C, 0, 0);
                        (_h = (_g = appRef.value.api).updateOutput) === null || _h === void 0 ? void 0 : _h.call(_g, deviceId);
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
            const ids = Array.from(this.deviceIds);
            for (const deviceId of ids) {
                this.api.updateInput(deviceId, FRAME_SECONDS);
            }
            for (const deviceId of ids) {
                const state = this.readInputState(deviceId);
                this.handleInput(deviceId, state);
                frameCount++;
                if (frameCount % 100 === 0) {
                    console.log(`[Dev ${deviceId}] L1=${state.bLeftShoulder ? 1 : 0} L2=${state.leftTriggerAnalog.toFixed(2)} R1=${state.bRightShoulder ? 1 : 0} R2=${state.rightTriggerAnalog.toFixed(2)} | ` +
                        `LStick=(${state.leftAnalogX.toFixed(2)}, ${state.leftAnalogY.toFixed(2)}) RStick=(${state.rightAnalogX.toFixed(2)}, ${state.rightAnalogY.toFixed(2)}) | ` +
                        `Gyro=(${state.gyroscopeX.toFixed(2)}, ${state.gyroscopeY.toFixed(2)}, ${state.gyroscopeZ.toFixed(2)}) | ` +
                        `Touch=(${state.touchPositionX.toFixed(2)}, ${state.touchPositionY.toFixed(2)}, touching=${state.bIsTouching}) | ` +
                        `Bat=${state.batteryLevel.toFixed(0)}%`);
                }
            }
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
    enableAudioHaptics() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            if (this.isAudioHapticsEnabled) {
                return;
            }
            if (typeof navigator === "undefined" || !((_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getDisplayMedia)) {
                throw new Error("getDisplayMedia não é suportado neste ambiente.");
            }
            const stream = yield navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
            });
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                stream.getTracks().forEach((track) => track.stop());
                throw new Error("Nenhuma faixa de áudio encontrada no compartilhamento de tela. Certifique-se de habilitar o áudio do sistema/aba.");
            }
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            if (ctx.state === "suspended") {
                yield ctx.resume();
            }
            const source = ctx.createMediaStreamSource(stream);
            let processorNode;
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
                    const totalBytes = totalFloats * 4;
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
                    const ids = Array.from(this.deviceIds);
                    for (const deviceId of ids) {
                        (_a = (this.api.getProcessAudioHaptics || this.api.processAudioHaptics)) === null || _a === void 0 ? void 0 : _a.call(this.api, deviceId);
                    }
                };
                processorNode = workletNode;
            }
            else {
                const bufferSize = 4096;
                const scriptProcessor = ctx.createScriptProcessor(bufferSize, 2, 2);
                scriptProcessor.onaudioprocess = (e) => {
                    var _a;
                    if (!this.isAudioHapticsEnabled || !this.api.audioSubmitSamples) {
                        return;
                    }
                    const inputBuffer = e.inputBuffer;
                    const numChannels = inputBuffer.numberOfChannels;
                    const frameCount = inputBuffer.length;
                    const sampleRate = inputBuffer.sampleRate;
                    const totalFloats = frameCount * numChannels;
                    const totalBytes = totalFloats * 4;
                    if (this.audioBufferCapacityBytes < totalBytes) {
                        if (this.audioBufferPtr !== 0) {
                            this.module._free(this.audioBufferPtr);
                        }
                        this.audioBufferPtr = this.module._malloc(totalBytes);
                        this.audioBufferCapacityBytes = totalBytes;
                    }
                    const heap = this.module.HEAPU8;
                    const floatView = new Float32Array(heap.buffer, heap.byteOffset + this.audioBufferPtr, totalFloats);
                    const ch0 = inputBuffer.getChannelData(0);
                    if (numChannels >= 2) {
                        const ch1 = inputBuffer.getChannelData(1);
                        for (let i = 0; i < frameCount; i++) {
                            floatView[i * 2] = ch0[i];
                            floatView[i * 2 + 1] = ch1[i];
                        }
                    }
                    else {
                        floatView.set(ch0);
                    }
                    this.api.audioSubmitSamples(this.audioBufferPtr, frameCount, numChannels, sampleRate);
                    const ids = Array.from(this.deviceIds);
                    for (const deviceId of ids) {
                        (_a = (this.api.getProcessAudioHaptics || this.api.processAudioHaptics)) === null || _a === void 0 ? void 0 : _a.call(this.api, deviceId);
                    }
                };
                processorNode = scriptProcessor;
            }
            source.connect(processorNode);
            processorNode.connect(ctx.destination);
            stream.getVideoTracks().concat(audioTracks).forEach((track) => {
                track.addEventListener("ended", () => {
                    if (this.isAudioHapticsEnabled) {
                        this.disableAudioHaptics().catch(console.error);
                    }
                });
            });
            this.audioStream = stream;
            this.audioContext = ctx;
            this.audioSourceNode = source;
            this.audioProcessorNode = processorNode;
            this.isAudioHapticsEnabled = true;
            // RumbleMode = 0x0C, vibracao haptics e audio.
            const ids = Array.from(this.deviceIds);
            for (const deviceId of ids) {
                (_c = (_b = this.api).dualsenseSettings) === null || _c === void 0 ? void 0 : _c.call(_b, deviceId, 0, 0, 1, 0, 100, 0x0C, 0, 0);
                (_e = (_d = this.api).updateOutput) === null || _e === void 0 ? void 0 : _e.call(_d, deviceId);
            }
        });
    }
    disableAudioHaptics() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
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
                (_b = (_a = this.api).dualsenseSettings) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId, 0, 0, 0, 0, 100, 0xFF, 0, 0);
                (_d = (_c = this.api).updateOutput) === null || _d === void 0 ? void 0 : _d.call(_c, deviceId);
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
        var _a, _b;
        if (this.isAudioHapticsEnabled) {
            this.previousInput.set(deviceId, state);
            return;
        }
        const previous = this.previousInput.get(deviceId);
        // [ FACE BUTTONS ]
        // (X) Cross : Heavy Rumble + RED Light
        if (this.isPressed(state.bCross, previous === null || previous === void 0 ? void 0 : previous.bCross)) {
            this.setBasicOutput(deviceId, 64, 0, 255, 0, 0);
            console.log(`Device ${deviceId}: (X) Cross -> Heavy Rumble + RED Light`);
        }
        // (O) Circle : Soft Rumble + YELLOW Light
        if (this.isPressed(state.bCircle, previous === null || previous === void 0 ? void 0 : previous.bCircle)) {
            this.setBasicOutput(deviceId, 0, 64, 255, 255, 0);
            console.log(`Device ${deviceId}: (O) Circle -> Soft Rumble + YELLOW Light`);
        }
        // [ ] Square : Trigger Effect: GAMECUBE (R2)
        if (this.isPressed(state.bSquare, previous === null || previous === void 0 ? void 0 : previous.bSquare)) {
            this.setTriggerEffect(deviceId, TRIGGER_GAMECUBE, 1);
            console.log(`Device ${deviceId}: [ ] Square -> Trigger Effect: GAMECUBE (R2)`);
        }
        // /\ Triangle : Stop All
        if (this.isPressed(state.bTriangle, previous === null || previous === void 0 ? void 0 : previous.bTriangle)) {
            this.stopTriggers(deviceId);
            this.setBasicOutput(deviceId, 0, 0, 0, 0, 0);
            (_b = (_a = this.api).resetLights) === null || _b === void 0 ? void 0 : _b.call(_a, deviceId);
            console.log(`Device ${deviceId}: /\\ Triangle -> Stop All`);
        }
        // [ D-PADS & SHOULDERS ]
        // [L1] : Trigger Effect: Gallop (L2)
        if (this.isPressed(state.bLeftShoulder, previous === null || previous === void 0 ? void 0 : previous.bLeftShoulder)) {
            this.setTriggerEffect(deviceId, TRIGGER_GALLOPING, 0);
            console.log(`Device ${deviceId}: [L1] -> Trigger Effect: Gallop (L2)`);
        }
        // [R1] : Trigger Effect: Machine (R2)
        if (this.isPressed(state.bRightShoulder, previous === null || previous === void 0 ? void 0 : previous.bRightShoulder)) {
            this.setTriggerEffect(deviceId, TRIGGER_MACHINE, 1);
            console.log(`Device ${deviceId}: [R1] -> Trigger Effect: Machine (R2)`);
        }
        // [UP] : Trigger Effect: Feedback (Rigid)
        if (this.isPressed(state.bDpadUp, previous === null || previous === void 0 ? void 0 : previous.bDpadUp)) {
            this.setTriggerEffect(deviceId, TRIGGER_FEEDBACK, 1);
            console.log(`Device ${deviceId}: [UP] -> Trigger Effect: Feedback (Rigid) (R2)`);
        }
        // [DOWN] : Trigger Effect: Bow (Tension)
        if (this.isPressed(state.bDpadDown, previous === null || previous === void 0 ? void 0 : previous.bDpadDown)) {
            this.setTriggerEffect(deviceId, TRIGGER_BOW, 1);
            console.log(`Device ${deviceId}: [DOWN] -> Trigger Effect: Bow (Tension) (R2)`);
        }
        // [LEFT] : Trigger Effect: Weapon (Semi)
        if (this.isPressed(state.bDpadLeft, previous === null || previous === void 0 ? void 0 : previous.bDpadLeft)) {
            this.setTriggerEffect(deviceId, TRIGGER_WEAPON, 1);
            console.log(`Device ${deviceId}: [LEFT] -> Trigger Effect: Weapon (Semi) (R2)`);
        }
        // [RIGHT] : Trigger Effect: Automatic Gun (Buzz)
        if (this.isPressed(state.bDpadRight, previous === null || previous === void 0 ? void 0 : previous.bDpadRight)) {
            this.setTriggerEffect(deviceId, TRIGGER_AUTOMATIC_GUN, 1);
            console.log(`Device ${deviceId}: [RIGHT] -> Trigger Effect: Automatic Gun (Buzz) (R2)`);
        }
        this.previousInput.set(deviceId, state);
    }
    isPressed(current, previous = false) {
        return current && !previous;
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
exports.GamepadClientApplication = GamepadClientApplication;
function startGamepadClientLoop() {
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
        processAudioHaptics: maybe("GCH_ProcessAudioHaptics", "number", ["number"]),
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
        const esm = yield Promise.resolve().then(() => __importStar(require("./lib/GamepadCoreHost.js")));
        const candidate = (_a = esm.default) !== null && _a !== void 0 ? _a : esm;
        if (typeof candidate !== "function") {
            throw new Error("GamepadCoreHost.js inválido: export esperado é função de inicialização.");
        }
        return candidate;
    });
}
function printStartupBanner() {
    if (bannerPrinted) {
        return;
    }
    bannerPrinted = true;
    console.log(`
=======================================================
           DUALSENSE INTEGRATION TEST
=======================================================

 [ FACE BUTTONS ]
   (X) Cross    : Heavy Rumble + RED Light
   (O) Circle   : Soft Rumble  + YELLOW Light
   [ ] Square   : Trigger Effect: GAMECUBE (R2)
   /\\ Triangle : Stop All

-------------------------------------------------------

 [ D-PADS & SHOULDERS ]
   [L1]    : Trigger Effect: Gallop (L2)
   [R1]    : Trigger Effect: Machine (R2)
   [UP]    : Trigger Effect: Feedback (Rigid)
   [DOWN]  : Trigger Effect: Bow (Tension)
   [LEFT]  : Trigger Effect: Weapon (Semi)
   [RIGHT] : Trigger Effect: Automatic Gun (Buzz)

=======================================================
`);
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

import { initializeDeviceRegistryPolicy } from "./policies/device_registry_policy.js";
import { bindingAPI } from "./api.js";
import { FRAME_MS, FRAME_SECONDS, INPUT_DESCRIPTOR_SIZE, SONY_VENDOR_ID } from "./const.js";
import { AudioHapticsManager } from "./stream.js";
import { DualSenseSocketBridge } from "./wsocket.js";
import i18n from "./i18n/index.js";
const deviceChannel = new BroadcastChannel("dualsense_channel");
export class GamepadClientApplication {
    constructor(module, platform, registry, media) {
        this.inputTimer = null;
        this.nextManualHandle = 100;
        this.isNowEnabled = false;
        this.pendingDescriptor = null;
        this.media = null;
        this.devices = new Map();
        this.registry = null;
        this.dsExtensionBridge = new DualSenseSocketBridge();
        this.module = module;
        this.platform = platform;
        this.registry = registry;
        this.media = media;
        this.api = bindingAPI(module);
        this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
        this.media?.setApi(this.api);
        // Callbacks logs C++ (WASM)
        const jsLogCallback = module.addFunction((messagePtr) => {
            const rawMessage = module.UTF8ToString(messagePtr);
            const finalMessage = i18n.t(rawMessage);
            GamepadClientApplication.emitLog(`[WASM] ${finalMessage}`);
        }, "vi");
        if (this.api.logs) {
            this.api.logs(jsLogCallback);
        }
    }
    wsToggle() {
        if (this.dsExtensionBridge.isConnected()) {
            this.dsExtensionBridge.disconnect();
            return;
        }
        this.dsExtensionBridge.connect();
    }
    wsIsConnect() {
        return this.dsExtensionBridge.isConnected();
    }
    static createFromContext(context, typeId = 1) {
        const { module, platform } = context;
        let deviceId = 1;
        const ref = { value: null };
        const registry = initializeDeviceRegistryPolicy(module, typeId, {
            alloc: () => {
                GamepadClientApplication.pending = true;
                GamepadClientApplication.emitLog(`Allocating device ID: ${deviceId}`);
                return deviceId;
            },
            dispatch: (dispatchedId) => {
                GamepadClientApplication.emitLog(`Device dispatched: ${dispatchedId}`);
                const app = ref.value;
                if (app && app.pendingDescriptor) {
                    app.devices.set(dispatchedId, app.pendingDescriptor);
                    app.pendingDescriptor = null;
                    GamepadClientApplication.pending = false;
                    // Exemplo usando a tradução
                    GamepadClientApplication.emitLog(i18n.t("logs.webHidConnected", { id: dispatchedId }));
                }
            },
            disconnect: (disconnectedId) => {
                GamepadClientApplication.emitLog(`Device disconnected: ${disconnectedId}`);
                const app = ref.value;
                if (app) {
                    const descriptor = app.devices.get(disconnectedId);
                    if (descriptor?.inputListener) {
                        descriptor.device.removeEventListener("inputreport", descriptor.inputListener);
                    }
                    app.devices.delete(disconnectedId);
                }
                GamepadClientApplication.emitLog(i18n.t("logs.notConnected", { id: disconnectedId }));
            },
        });
        const media = new AudioHapticsManager({
            module: module,
            onChange: (status) => {
                GamepadClientApplication.emitLog(`[Engine] Audio/Haptics status: ${status ? "Enabled" : "Disabled"}`);
            },
        });
        return (ref.value = new GamepadClientApplication(module, platform, registry, media));
    }
    async requestDeviceAccess() {
        const devices = await navigator.hid.requestDevice({
            filters: [
                { vendorId: SONY_VENDOR_ID, productId: 0x0ce6 },
                { vendorId: SONY_VENDOR_ID, productId: 0x0df2 },
            ],
        });
        const connectedNames = [];
        for (const device of devices) {
            const handle = this.nextManualHandle++;
            const path = device.productName || "Sony DualSense (WebHID)";
            await this.createDeviceFromDescriptor(device, handle, 1, 1, true, path);
            connectedNames.push(path);
        }
        return connectedNames;
    }
    async createDeviceFromDescriptor(device, handle, deviceType, connectionType, isConnected, path) {
        if (!this.api?.create) {
            GamepadClientApplication.emitLog("API create method is not available");
            return;
        }
        if (!this.platform?.registerManually) {
            GamepadClientApplication.emitLog("API registerManually method is not available");
            return;
        }
        if (device.opened) {
            device.close().catch((err) => {
                GamepadClientApplication.emitLog(`Failed to close device: ${err}`);
            });
        }
        device
            .open()
            .then(() => {
            device
                .receiveFeatureReport(0x05)
                .then((data) => {
                const descriptor = {
                    path: device.productName,
                    deviceType: 1,
                    device: device,
                    handleId: handle,
                    lastInputPacket: new Uint8Array(78).fill(0).map((v, i) => (i === 0 ? 0x31 : 0)),
                };
                device.oninputreport = (event) => {
                    const fullPacket = new Uint8Array(event.data.byteLength + 1);
                    fullPacket[0] = event.reportId;
                    fullPacket.set(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength), 1);
                    descriptor.lastInputPacket = fullPacket;
                };
                device.addEventListener("inputreport", device.oninputreport);
                this.pendingDescriptor = descriptor;
                this.platform?.registerManually(descriptor);
                const structSize = 536;
                const descriptorPtr = this.module?._malloc(structSize) || 0;
                try {
                    const heap = this.module?.HEAPU8;
                    heap?.fill(0, descriptorPtr, descriptorPtr + structSize);
                    if (heap) {
                        const view = new DataView(heap.buffer, heap.byteOffset + descriptorPtr, structSize);
                        view.setBigInt64(0, BigInt(handle), true);
                        view.setInt32(8, deviceType, true);
                        view.setInt32(12, connectionType, true);
                        view.setInt32(16, isConnected ? 1 : 0, true);
                        if (path) {
                            const encoder = new TextEncoder();
                            const pathBytes = encoder.encode(path);
                            const maxPathLength = Math.min(pathBytes.length, 511);
                            heap.set(pathBytes.subarray(0, maxPathLength), descriptorPtr + 20);
                        }
                        this.api?.create(descriptorPtr);
                        GamepadClientApplication.emitLog(`[GamepadClient] Dispositivo injetado: ${path}`);
                    }
                }
                finally {
                    this.module?._free(descriptorPtr);
                }
            })
                .catch((err) => {
                GamepadClientApplication.emitLog(`Failed to receive feature report: ${err}`);
            });
        })
            .catch((err) => {
            GamepadClientApplication.emitLog(`Failed to open device: ${err}`);
        });
    }
    run() {
        if (this.inputTimer !== null)
            return;
        let isSend = false;
        const applySending = (message, deviceId) => {
            if (!isSend) {
                isSend = true;
                deviceChannel.postMessage({
                    type: "DEVICE_APPLY_TRIGGER",
                    message,
                    deviceId,
                });
                setTimeout(() => {
                    isSend = false;
                }, 2000);
            }
        };
        GamepadClientApplication.emitLog(i18n.t("logs.loopStarted") || "[GamepadClient] Engine iniciada (Polling)");
        this.inputTimer = window.setInterval(() => {
            for (const [deviceId, descriptor] of this.devices.entries()) {
                const state = this.readInputState(deviceId);
                if (state.bDpadUp && state.bRightStick) {
                    applySending(0, deviceId);
                }
                else if (state.bDpadRight && state.bRightStick) {
                    applySending(1, deviceId);
                }
                else if (state.bDpadDown && state.bRightStick) {
                    applySending(2, deviceId);
                }
                else if (state.bDpadLeft && state.bRightStick) {
                    applySending(3, deviceId);
                }
                this.dsExtensionBridge.send(state);
            }
        }, FRAME_MS);
    }
    stop() {
        if (this.inputTimer !== null) {
            window.clearInterval(this.inputTimer);
            this.inputTimer = null;
            GamepadClientApplication.emitLog(i18n.t("logs.loopStopped") || "[GamepadClient] Engine parada");
        }
    }
    readInputState(deviceId) {
        if (this.pendingDescriptor || GamepadClientApplication.pending) {
            return {};
        }
        this.api?.update(deviceId, FRAME_SECONDS);
        this.api?.state(deviceId, this.inputBufferPtr);
        const b = this.inputBufferPtr;
        const heap = this.module?.HEAPU8;
        if (!heap) {
            return {};
        }
        const rf = (offset) => {
            if (typeof this.module?.getValue === "function") {
                return this.module.getValue(b + offset, "float");
            }
            const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
            return view.getFloat32(0, true);
        };
        const ri32 = (offset) => {
            if (typeof this.module?.getValue === "function") {
                return this.module.getValue(b + offset, "i32");
            }
            const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
            return view.getInt32(0, true);
        };
        const rb = (offset) => (heap[b + offset] ?? 0) !== 0;
        const ru8 = (offset) => heap[b + offset] ?? 0;
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
    async toggleHaptics() {
        try {
            this.isNowEnabled = await this.media?.toggle();
            return this.isNowEnabled;
        }
        catch (err) {
            GamepadClientApplication.emitLog(`[Engine] Erro ao iniciar captura de áudio: ${err}`);
            return false;
        }
    }
    async audioSettings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce, gain = 1.0, volume = 100) {
        this.media?.applySettings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce, gain, volume);
    }
    static onLog(listener) {
        GamepadClientApplication.logListeners.add(listener);
        return () => GamepadClientApplication.logListeners.delete(listener);
    }
    static emitLog(message, level) {
        console.log(message);
        for (const listener of GamepadClientApplication.logListeners) {
            try {
                listener(message, level);
            }
            catch (err) {
                console.log("[GamepadClient] Error in log listener:", err);
            }
        }
    }
}
GamepadClientApplication.pending = true;
// Log static listeners
GamepadClientApplication.logListeners = new Set();

import { initializeDeviceRegistryPolicy } from "./policies/device_registry_policy.js";
import { bindingAPI } from "./api.js";
import { t } from "./i18n";
import { FRAME_MS, FRAME_SECONDS, INPUT_DESCRIPTOR_SIZE } from "./const.js";
import { AudioHapticsManager } from "./stream.js";
export class GamepadClientApplication {
    constructor(module, platform, registry, media, logFnPtr) {
        this.inputTimer = null;
        this.nextManualHandle = 100;
        this.isNowEnabled = false;
        this.pendingDescriptor = null;
        this.media = null;
        this.devices = new Map();
        this.registry = null;
        this.module = module;
        this.platform = platform;
        this.registry = registry;
        this.media = media;
        this.api = bindingAPI(module);
        this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
        this.media?.setApi(this.api);
    }
    // ...
    static createFromContext(context, typeId = 1) {
        const { module, platform } = context;
        let deviceId = 1;
        const ref = { value: null };
        const registry = initializeDeviceRegistryPolicy(module, typeId, {
            alloc: () => {
                GamepadClientApplication.pending = true;
                console.log("Allocating device ID:", deviceId);
                return deviceId;
            },
            dispatch: (deviceId) => {
                console.log("Device dispatched:", deviceId);
                const app = ref.value;
                if (app && app.pendingDescriptor) {
                    app.devices.set(deviceId, app.pendingDescriptor);
                    app.pendingDescriptor = null; // Clear the pending descriptor after dispatch
                    GamepadClientApplication.pending = false;
                    GamepadClientApplication.emitLog(t("logs.deviceDispatched", { id: deviceId }));
                }
            },
            disconnect: (deviceId) => {
                console.log("Device disconnected:", deviceId);
                const app = ref.value;
                if (app) {
                    const descriptor = app.devices.get(deviceId);
                    if (descriptor?.inputListener) {
                        descriptor.device.removeEventListener("inputreport", descriptor.inputListener);
                    }
                    app.devices.delete(deviceId);
                }
                GamepadClientApplication.emitLog(t("logs.deviceDisconnected", { id: deviceId }));
            },
        });
        const media = new AudioHapticsManager({
            module: module,
            onChange: (status) => {
                console.log(`[Engine] Status do Áudio/Haptics: ${status ? "Ativado" : "Desativado"}`);
            },
        });
        return (ref.value = new GamepadClientApplication(module, platform, registry, media, null));
    }
    /**
     * Request access to HID devices (e.g., Sony DualSense) via the WebHID API.
     * Returns an array with the names of the authorized devices.
     */
    async requestDeviceAccess() {
        // Specific filter for the Sony DualSense (Vendor ID: 0x054C, Product ID: 0x0CE6)
        // If you want to accept any controller, just pass { filters: [] }
        const devices = await navigator.hid.requestDevice({
            filters: [{ vendorId: 0x054c, productId: 0x0ce6 }],
        });
        const connectedNames = [];
        for (const device of devices) {
            // Check if the device is already connected
            const handle = this.nextManualHandle++;
            const path = device.productName || "Sony DualSense (WebHID)";
            // Open the device if it's not already opened
            await this.createDeviceFromDescriptor(device, handle, 1, // deviceType: 1 (Genérico/DualSense)
            1, // connectionType: 1 (Bluetooth)
            true, // isConnected
            path);
            connectedNames.push(path);
        }
        return connectedNames;
    }
    async createDeviceFromDescriptor(device, handle, deviceType, connectionType, isConnected, path) {
        if (!this.api?.create) {
            console.error("API create method is not available");
            return;
        }
        if (!this.platform?.registerManually) {
            console.error("API registerManually method is not available");
            return;
        }
        device
            .open()
            .then(() => {
            console.log("Device opened successfully");
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
                this.devices.set(handle, descriptor);
                this.pendingDescriptor = descriptor;
                this.platform?.registerManually(descriptor);
                const structSize = 536;
                const descriptorPtr = this.module?._malloc(structSize) || 0;
                try {
                    const heap = this.module?.HEAPU8;
                    heap?.fill(0, descriptorPtr, descriptorPtr + structSize);
                    if (heap) {
                        const view = new DataView(heap?.buffer, heap?.byteOffset + descriptorPtr, structSize);
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
                console.error("Failed to receive feature report:", err);
                return;
            });
        })
            .catch((err) => {
            console.error("Failed to open device:", err);
            return;
        });
    }
    // ...
    /**
     * Inicia o loop da engine (Polling)
     */
    run() {
        if (this.inputTimer !== null)
            return; // Já está rodando
        GamepadClientApplication.emitLog("[GamepadClient] Engine iniciada (Polling 100Hz)");
        this.inputTimer = window.setInterval(() => {
            for (const [deviceId, descriptor] of this.devices.entries()) {
                const state = this.readInputState(deviceId);
                if (state.bCircle) {
                    console.log("Circle button pressed.");
                    console.log(`State for device ${deviceId}:`, descriptor);
                }
            }
            // if (this.isNowEnabled) {
            // 	for (const [deviceId, descriptor] of this.devices.entries()) {
            // 		this.api?.audioProcess(deviceId);
            // 	}
            // }
        }, FRAME_MS);
    }
    /**
     * Para o loop da engine
     */
    stop() {
        if (this.inputTimer !== null) {
            window.clearInterval(this.inputTimer);
            this.inputTimer = null;
            GamepadClientApplication.emitLog("[GamepadClient] Engine parada.");
        }
    }
    /**
     * Pede ao C++ o estado atual do controle e converte a memória bruta para o objeto TS state_t
     */
    readInputState(deviceId) {
        if (this.pendingDescriptor) {
            console.log("Pending descriptor, returning empty state.");
            return {}; // Retorna um estado vazio se houver um descriptor pendente
        }
        if (GamepadClientApplication.pending) {
            console.log("Pending GamepadClientApplication, returning empty state.");
            return {}; // Retorna um estado vazio se houver um descriptor pendente
        }
        this.api?.update(deviceId, FRAME_SECONDS);
        this.api?.state(deviceId, this.inputBufferPtr);
        const b = this.inputBufferPtr;
        const heap = this.module?.HEAPU8;
        if (!heap) {
            console.log("Heap not available, returning empty state.");
            return {}; // Retorna um estado vazio se o heap não estiver disponível
        }
        const rf = (offset) => {
            if (typeof this.module?.getValue === "function") {
                return this.module.getValue(b + offset, "float");
            }
            // @ts-ignore
            const view = new DataView(heap?.buffer, heap?.byteOffset + b + offset, 4);
            return view.getFloat32(0, true);
        };
        const ri32 = (offset) => {
            if (typeof this.module?.getValue === "function") {
                return this.module.getValue(b + offset, "i32");
            }
            // @ts-ignore
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
            console.error("[Engine] Erro ao iniciar captura de áudio:", err);
            return false;
        }
    }
    async audioSettings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce, gain = 1.0, volume = 100) {
        this.media?.applySettings(device, isMic, isHeadset, isSpeaker, micVolume, audioVolume, rumbleMode, rumbleReduce, triggerReduce, gain, volume);
    }
    /**
     * Registra um ouvinte para receber os logs.
     * Retorna uma função de limpeza (cleanup) caso queira parar de escutar.
     */
    static onLog(listener) {
        GamepadClientApplication.logListeners.add(listener);
        return () => GamepadClientApplication.logListeners.delete(listener);
    }
    /**
     * Publica uma linha de log no console e notifica todos os observadores.
     */
    static emitLog(message, level) {
        console.log(message); // Garante que sempre apareça no console do DevTools
        for (const listener of GamepadClientApplication.logListeners) {
            try {
                listener(message, level);
            }
            catch (err) {
                console.error("[GamepadClient] Error in log listener:", err);
            }
        }
    }
}
GamepadClientApplication.pending = true;
// log static listeners
GamepadClientApplication.logListeners = new Set();

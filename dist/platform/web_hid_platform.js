"use strict";
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
exports.WebHidPlatformBridge = void 0;
exports.requestSonyWebHidAccess = requestSonyWebHidAccess;
exports.initializeWebHidPlatformBridge = initializeWebHidPlatformBridge;
exports.initializeDeviceRegistryPolicy = initializeDeviceRegistryPolicy;
exports.createInMemoryDeviceRegistryPolicy = createInMemoryDeviceRegistryPolicy;
function requestSonyWebHidAccess() {
    return __awaiter(this, void 0, void 0, function* () {
        const nav = navigator;
        if (!nav.hid) {
            throw new Error("WebHID não está disponível neste navegador.");
        }
        const devices = yield nav.hid.requestDevice({ filters: [{ vendorId: SONY_VENDOR_ID }] });
        nav.hid.__cachedDevices = devices;
    });
}
const SONY_VENDOR_ID = 0x054c;
const DEVICE_TYPE_BY_PRODUCT_ID = {
    0x0ce6: 1, // DualSense
    0x0df2: 2, // DualSense Edge
    0x05c4: 3, // DualShock 4
    0x09cc: 3, // DualShock 4 (rev)
};
const DESCRIPTOR_SIZE = 532;
const PATH_SIZE = 512;
const HANDLE_OFFSET = 0;
const DEVICE_TYPE_OFFSET = 8;
const CONNECTION_TYPE_OFFSET = 12;
const IS_CONNECTED_OFFSET = 16;
const PATH_OFFSET = 20;
const CONNECTION_USB = 1;
const DEFAULT_SIGNATURES = {
    read: "iiiii",
    write: "iiiii",
    detect: "iii",
    createHandle: "ii",
    invalidateHandle: "vi",
    configureFeatures: "ii",
    processAudioHaptics: "vii",
};
const DEFAULT_DEVICE_REGISTRY_SIGNATURES = {
    alloc: "ii",
    dispatch: "vii",
    disconnect: "vi",
};
class WebHidPlatformBridge {
    constructor() {
        this.byPath = new Map();
        this.byHandle = new Map();
        this.nextHandle = 1;
        this.detect = (heap, descriptorsBuffer, maxDevices) => {
            if (descriptorsBuffer === 0 || maxDevices <= 0) {
                return 0;
            }
            const devices = this.getSupportedDevicesSync();
            let found = 0;
            for (const device of devices) {
                if (found >= maxDevices) {
                    break;
                }
                const deviceType = DEVICE_TYPE_BY_PRODUCT_ID[device.productId];
                if (deviceType === undefined) {
                    continue;
                }
                const path = this.makePath(device, found);
                const descriptorPtr = descriptorsBuffer + found * DESCRIPTOR_SIZE;
                const descriptorView = new DataView(heap.buffer, heap.byteOffset + descriptorPtr, DESCRIPTOR_SIZE);
                const pathBytes = this.toFixedPath(path);
                this.writeHandleU64(descriptorView, HANDLE_OFFSET, 0);
                descriptorView.setInt32(DEVICE_TYPE_OFFSET, deviceType, true);
                descriptorView.setInt32(CONNECTION_TYPE_OFFSET, CONNECTION_USB, true);
                descriptorView.setInt32(IS_CONNECTED_OFFSET, 1, true);
                heap.set(pathBytes, descriptorPtr + PATH_OFFSET);
                const existing = this.byPath.get(path);
                if (existing) {
                    existing.device = device;
                }
                else {
                    this.byPath.set(path, {
                        path,
                        deviceType,
                        device,
                        handleId: 0,
                        lastInputPacket: new Uint8Array(0),
                    });
                }
                found++;
            }
            return found;
        };
        this.createHandle = (heap, descriptorBuffer) => {
            if (descriptorBuffer === 0) {
                return false;
            }
            const descriptorView = new DataView(heap.buffer, heap.byteOffset + descriptorBuffer, DESCRIPTOR_SIZE);
            const path = this.pathFromHeap(heap, descriptorBuffer + PATH_OFFSET, PATH_SIZE);
            if (!path) {
                return false;
            }
            const entry = this.byPath.get(path);
            if (!entry) {
                return false;
            }
            if (!entry.handleId) {
                entry.handleId = this.nextHandle++;
                this.byHandle.set(entry.handleId, entry);
                this.ensureInputCapture(entry);
            }
            this.writeHandleU64(descriptorView, HANDLE_OFFSET, entry.handleId);
            descriptorView.setInt32(IS_CONNECTED_OFFSET, 1, true);
            return true;
        };
        this.read = (heap, handle, buffer, length, bytesReadPtr) => {
            if (handle <= 0 || buffer === 0 || length <= 0) {
                this.writeInt32(heap, bytesReadPtr, 0);
                return false;
            }
            const entry = this.byHandle.get(handle);
            if (!entry) {
                this.writeInt32(heap, bytesReadPtr, 0);
                return false;
            }
            const packet = entry.lastInputPacket;
            const bytesToCopy = Math.min(length, packet.length);
            heap.set(packet.subarray(0, bytesToCopy), buffer);
            this.writeInt32(heap, bytesReadPtr, bytesToCopy);
            return bytesToCopy > 0;
        };
        this.write = (heap, handle, buffer, length, bytesWrittenPtr) => {
            var _a;
            if (handle <= 0 || buffer === 0 || length <= 0) {
                this.writeInt32(heap, bytesWrittenPtr, 0);
                return false;
            }
            const entry = this.byHandle.get(handle);
            if (!(entry === null || entry === void 0 ? void 0 : entry.device.opened)) {
                this.writeInt32(heap, bytesWrittenPtr, 0);
                return false;
            }
            const output = heap.slice(buffer, buffer + length);
            const reportId = (_a = output[0]) !== null && _a !== void 0 ? _a : 0;
            const payload = output.subarray(1);
            entry.device.sendReport(reportId, payload).catch((error) => {
                console.error("WebHID sendReport falhou:", error);
            });
            this.writeInt32(heap, bytesWrittenPtr, length);
            return true;
        };
        this.invalidateHandle = (handle) => {
            const entry = this.byHandle.get(handle);
            if (!entry) {
                return;
            }
            this.byHandle.delete(handle);
            entry.handleId = 0;
            if (entry.inputListener) {
                entry.device.removeEventListener("inputreport", entry.inputListener);
                entry.inputListener = undefined;
            }
        };
        this.configureFeatures = () => {
            return true;
        };
        this.processAudioHaptics = () => {
        };
    }
    requestSonyDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            const nav = navigator;
            if (!nav.hid) {
                throw new Error("WebHID não está disponível neste navegador.");
            }
            const devices = yield nav.hid.requestDevice({
                filters: [{ vendorId: SONY_VENDOR_ID }],
            });
            nav.hid.__cachedDevices = devices;
            return devices;
        });
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const entry of this.byPath.values()) {
                if (entry.inputListener) {
                    entry.device.removeEventListener("inputreport", entry.inputListener);
                }
                if (entry.device.opened) {
                    yield entry.device.close().catch(() => undefined);
                }
            }
            this.byPath.clear();
            this.byHandle.clear();
        });
    }
    getSupportedDevicesSync() {
        const hid = navigator.hid;
        if (!hid) {
            return [];
        }
        // getDevices é assíncrono na API; aqui usamos cache do navegador para manter callback síncrono.
        // Se a lista estiver vazia, chame requestSonyDevices() antes da inicialização do bridge.
        const shadow = hid.__cachedDevices;
        if (Array.isArray(shadow)) {
            return shadow.filter((d) => d.vendorId === SONY_VENDOR_ID && DEVICE_TYPE_BY_PRODUCT_ID[d.productId] !== undefined);
        }
        return [];
    }
    refreshCachedDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            const nav = navigator;
            if (!nav.hid) {
                return;
            }
            const devices = yield nav.hid.getDevices();
            nav.hid.__cachedDevices = devices;
        });
    }
    ensureInputCapture(entry) {
        const device = entry.device;
        if (!device.opened) {
            device.open().catch((error) => {
                console.error("WebHID open falhou:", error);
            });
        }
        if (entry.inputListener) {
            return;
        }
        entry.inputListener = (event) => {
            const body = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
            const packet = new Uint8Array(body.length + 1);
            packet[0] = event.reportId;
            packet.set(body, 1);
            entry.lastInputPacket = packet;
        };
        device.addEventListener("inputreport", entry.inputListener);
    }
    makePath(device, index) {
        var _a;
        const serial = ((_a = device.serialNumber) === null || _a === void 0 ? void 0 : _a.trim()) || "noserial";
        return `webhid:${device.vendorId.toString(16)}:${device.productId.toString(16)}:${serial}:${index}`;
    }
    toFixedPath(path) {
        const bytes = new TextEncoder().encode(path);
        const fixed = new Uint8Array(PATH_SIZE);
        fixed.set(bytes.subarray(0, PATH_SIZE - 1), 0);
        return fixed;
    }
    pathFromHeap(heap, ptr, maxLength) {
        const slice = heap.subarray(ptr, ptr + maxLength);
        let end = 0;
        while (end < slice.length && slice[end] !== 0) {
            end++;
        }
        return new TextDecoder().decode(slice.subarray(0, end)).trim();
    }
    writeInt32(heap, ptr, value) {
        if (!ptr) {
            return;
        }
        new DataView(heap.buffer, heap.byteOffset + ptr, 4).setInt32(0, value, true);
    }
    writeHandleU64(view, offset, value) {
        view.setUint32(offset, value >>> 0, true);
        view.setUint32(offset + 4, 0, true);
    }
}
exports.WebHidPlatformBridge = WebHidPlatformBridge;
function initializeWebHidPlatformBridge(module_1) {
    return __awaiter(this, arguments, void 0, function* (module, signatures = {}) {
        if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
            throw new Error("Module sem addFunction/removeFunction. Recompile o WASM com EXPORTED_RUNTIME_METHODS=addFunction,removeFunction.");
        }
        const bridge = new WebHidPlatformBridge();
        yield bridge.refreshCachedDevices();
        const resolved = Object.assign(Object.assign({}, DEFAULT_SIGNATURES), signatures);
        const readPtr = module.addFunction((handle, buffer, length, bytesRead) => {
            return bridge.read(module.HEAPU8, handle, buffer, length, bytesRead) ? 1 : 0;
        }, resolved.read);
        const writePtr = module.addFunction((handle, buffer, length, bytesWritten) => {
            return bridge.write(module.HEAPU8, handle, buffer, length, bytesWritten) ? 1 : 0;
        }, resolved.write);
        const detectPtr = module.addFunction((descriptorsBuffer, maxDevices) => {
            return bridge.detect(module.HEAPU8, descriptorsBuffer, maxDevices);
        }, resolved.detect);
        const createHandlePtr = module.addFunction((descriptorBuffer) => {
            return bridge.createHandle(module.HEAPU8, descriptorBuffer) ? 1 : 0;
        }, resolved.createHandle);
        const invalidateHandlePtr = module.addFunction((handle) => {
            bridge.invalidateHandle(handle);
        }, resolved.invalidateHandle);
        const configureFeaturesPtr = module.addFunction(() => {
            return bridge.configureFeatures() ? 1 : 0;
        }, resolved.configureFeatures);
        const processAudioHapticsPtr = module.addFunction(() => {
            bridge.processAudioHaptics();
        }, resolved.processAudioHaptics);
        const initializeBridge = module.cwrap("GCH_InitializePlatformBridge", null, [
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
        ]);
        initializeBridge(readPtr, writePtr, detectPtr, createHandlePtr, invalidateHandlePtr, configureFeaturesPtr, processAudioHapticsPtr);
        return {
            dispose: () => __awaiter(this, void 0, void 0, function* () {
                module.removeFunction(readPtr);
                module.removeFunction(writePtr);
                module.removeFunction(detectPtr);
                module.removeFunction(createHandlePtr);
                module.removeFunction(invalidateHandlePtr);
                module.removeFunction(configureFeaturesPtr);
                module.removeFunction(processAudioHapticsPtr);
                yield bridge.dispose();
            }),
        };
    });
}
function initializeDeviceRegistryPolicy(module, typeId, callbacks, signatures = {}) {
    if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
        throw new Error("Module sem addFunction/removeFunction. Recompile o WASM com EXPORTED_RUNTIME_METHODS=addFunction,removeFunction.");
    }
    const resolved = Object.assign(Object.assign({}, DEFAULT_DEVICE_REGISTRY_SIGNATURES), signatures);
    const allocPtr = module.addFunction((...args) => {
        return callbacks.alloc(...args);
    }, resolved.alloc);
    const dispatchPtr = module.addFunction((...args) => {
        callbacks.dispatch(...args);
    }, resolved.dispatch);
    const disconnectPtr = module.addFunction((...args) => {
        callbacks.disconnect(...args);
    }, resolved.disconnect);
    const initializePolicy = module.cwrap("GCH_InitializeDeviceRegistryPolicy", null, [
        "number",
        "number",
        "number",
        "number",
    ]);
    initializePolicy(typeId, allocPtr, dispatchPtr, disconnectPtr);
    return {
        dispose: () => {
            module.removeFunction(allocPtr);
            module.removeFunction(dispatchPtr);
            module.removeFunction(disconnectPtr);
        },
    };
}
function createInMemoryDeviceRegistryPolicy(startEngineDeviceId = 1) {
    let nextId = startEngineDeviceId;
    const handlesToEngineIds = new Map();
    return {
        alloc: (handleOrDescriptorPtr) => {
            const key = handleOrDescriptorPtr > 0 ? handleOrDescriptorPtr : nextId;
            const existing = handlesToEngineIds.get(key);
            if (existing !== undefined) {
                return existing;
            }
            const created = nextId++;
            handlesToEngineIds.set(key, created);
            return created;
        },
        dispatch: () => {
            // Encaminhamento para a engine fica no callback consumidor.
        },
        disconnect: (handleOrDescriptorPtr) => {
            if (handleOrDescriptorPtr > 0) {
                handlesToEngineIds.delete(handleOrDescriptorPtr);
            }
        },
    };
}

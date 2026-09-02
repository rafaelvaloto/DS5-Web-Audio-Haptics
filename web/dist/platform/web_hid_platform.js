import { SONY_VENDOR_ID, DEVICE_TYPE_BY_PRODUCT_ID } from "../const.js";
// Signatures corrected to match the C++ calls without arguments/with BigInt
const PLATFORM_SIGNATURES = {
    read: "ijiii",
    write: "ijiii",
    detect: "iii",
    createHandle: "ii",
    invalidateHandle: "vj", // void return, i64 arg (BigInt handle)
    configureFeatures: "i", // int return, 0 args
    processAudioHaptics: "v", // void return, 0 args
};
export function isWebHidAvailable() {
    return typeof navigator !== "undefined" && Boolean(navigator.hid);
}
export async function requestSonyWebHidAccess() {
    if (!navigator.hid) {
        throw new Error("WebHID não está disponível neste navegador.");
    }
    return navigator.hid.requestDevice({ filters: [{ vendorId: SONY_VENDOR_ID }] });
}
export async function listAuthorizedSonyDevices() {
    if (!navigator.hid) {
        return [];
    }
    const devices = await navigator.hid.getDevices();
    return devices.filter((d) => d.vendorId === SONY_VENDOR_ID && DEVICE_TYPE_BY_PRODUCT_ID[d.productId] !== undefined);
}
class WebHidPlatformBridge {
    constructor() {
        this.byHandle = new Map();
    }
    async registerManually(device, handle, path, type) {
        if (!device.opened) {
            await device.open();
        }
        const buffer = new Uint8Array(78);
        const entry = { device, handle, path, type, lastInputPacket: buffer, inputListener: null };
        entry.inputListener = (event) => {
            entry.lastInputPacket = new Uint8Array(event.data.buffer);
        };
        device.addEventListener("inputreport", entry.inputListener);
        this.byHandle.set(handle, entry);
    }
    read(heap, handle, buffer, length, bytesReadPtr) {
        if (handle <= 0 || buffer === 0 || length <= 0) {
            this.writeInt32(heap, bytesReadPtr, 0);
            return false;
        }
        const entry = this.byHandle.get(handle);
        if (!entry || !entry.device.opened) {
            this.writeInt32(heap, bytesReadPtr, 0);
            return false;
        }
        let packet = entry.lastInputPacket;
        if (packet.length === 0) {
            packet = new Uint8Array(78);
            packet[0] = 0x31;
        }
        const bytesToCopy = Math.min(length, packet.length);
        heap.set(packet.subarray(0, bytesToCopy), buffer);
        this.writeInt32(heap, bytesReadPtr, bytesToCopy);
        return true;
    }
    write(heap, handle, buffer, length, bytesWrittenPtr) {
        if (handle <= 0 || buffer === 0 || length <= 0) {
            this.writeInt32(heap, bytesWrittenPtr, 0);
            return false;
        }
        const entry = this.byHandle.get(handle);
        if (!entry?.device.opened) {
            this.writeInt32(heap, bytesWrittenPtr, 0);
            return false;
        }
        const output = heap.slice(buffer, buffer + length);
        const reportId = output[0] ?? 0;
        const payload = output.subarray(1);
        entry.device.sendReport(reportId, payload).catch((error) => {
            console.error("WebHID sendReport falhou:", error);
        });
        this.writeInt32(heap, bytesWrittenPtr, length);
        return true;
    }
    detect(heap, descriptorsBuffer, maxDevices) {
        return 0;
    }
    createHandle(heap, descriptorBuffer) {
        return false;
    }
    invalidateHandle(handle) {
        const entry = this.byHandle.get(handle);
        if (!entry)
            return;
        this.byHandle.delete(handle);
        entry.handleId = 0;
        if (entry.inputListener) {
            entry.device.removeEventListener("inputreport", entry.inputListener);
            entry.inputListener = undefined;
        }
    }
    configureFeatures() {
        return true;
    }
    processAudioHaptics() {
        // Implemented in the main audio loop
    }
    async dispose() {
        for (const entry of this.byHandle.values()) {
            if (entry.inputListener) {
                entry.device.removeEventListener("inputreport", entry.inputListener);
            }
            if (entry.device.opened) {
                await entry.device.close().catch(() => undefined);
            }
        }
        this.byHandle.clear();
    }
    writeInt32(heap, ptr, value) {
        if (!ptr)
            return;
        new DataView(heap.buffer, heap.byteOffset + ptr, 4).setInt32(0, value, true);
    }
}
export async function initializeWebHidPlatformBridge(module, signatures = {}) {
    if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
        throw new Error("Module missing addFunction/removeFunction.");
    }
    const bridge = new WebHidPlatformBridge();
    const resolved = { ...PLATFORM_SIGNATURES, ...signatures };
    const readPtr = module.addFunction((bighandle, buffer, length, bytesRead) => {
        return bridge.read(module.HEAPU8, Number(bighandle), buffer, length, bytesRead) ? 1 : 0;
    }, resolved.read);
    const writePtr = module.addFunction((handle, buffer, length, bytesWritten) => {
        return bridge.write(module.HEAPU8, Number(handle), buffer, length, bytesWritten) ? 1 : 0;
    }, resolved.write);
    const detectPtr = module.addFunction((descriptorsBuffer, maxDevices) => {
        return bridge.detect(module.HEAPU8, descriptorsBuffer, maxDevices);
    }, resolved.detect);
    const createHandlePtr = module.addFunction((descriptorBuffer) => {
        return bridge.createHandle(module.HEAPU8, descriptorBuffer) ? 1 : 0;
    }, resolved.createHandle);
    const invalidateHandlePtr = module.addFunction((handle) => {
        bridge.invalidateHandle(Number(handle));
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
        dispose: async () => {
            module.removeFunction(readPtr);
            module.removeFunction(writePtr);
            module.removeFunction(detectPtr);
            module.removeFunction(createHandlePtr);
            module.removeFunction(invalidateHandlePtr);
            module.removeFunction(configureFeaturesPtr);
            module.removeFunction(processAudioHapticsPtr);
            await bridge.dispose();
        },
        registerManually: async (device, handleId, path, deviceType) => {
            await bridge.registerManually(device, handleId, path, deviceType);
        },
    };
}

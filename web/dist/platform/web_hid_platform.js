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
class WebHidPlatformBridge {
    constructor() {
        this.byHandle = new Map();
        this.read = (heap, handle, buffer, length, bytesReadPtr) => {
            if (handle <= 0 || buffer === 0 || length <= 0) {
                this.writeInt32(heap, bytesReadPtr, 0);
                return false;
            }
            const entry = this.byHandle.get(handle);
            if (!entry) {
                console.log("[WebHID] Invalid handle:", handle);
                this.writeInt32(heap, bytesReadPtr, 0);
                return true;
            }
            const packet = entry.lastInputPacket;
            if (packet) {
                const bytesToCopy = Math.min(length, packet.length);
                heap.set(packet.subarray(0, bytesToCopy), buffer);
                if (typeof bytesReadPtr === "number" && bytesReadPtr > 0) {
                    const view = new DataView(heap.buffer, heap.byteOffset);
                    view.setUint32(bytesReadPtr, bytesToCopy, true);
                    this.writeInt32(heap, bytesReadPtr, bytesToCopy);
                }
                return true;
            }
            return true;
        };
        this.detect = (heap, descriptorsBuffer, maxDevices) => {
            return 0;
        };
        this.createHandle = (heap, descriptorBuffer) => {
            return true;
        };
    }
    async registerManually(descriptor) {
        this.byHandle.set(descriptor.handleId, descriptor);
    }
    write(heap, handle, buffer, length, bytesWrittenPtr) {
        const outputPacket = new Uint8Array(heap.buffer, heap.byteOffset + buffer, length);
        const reportId = outputPacket[0];
        const reportData = outputPacket.subarray(1);
        const device = this.byHandle.get(handle)?.device;
        if (!device) {
            console.error("[WebHID] Dispositivo não encontrado para o handle:", handle);
            return false;
        }
        device
            .sendReport(reportId, reportData)
            .catch((err) => console.error("[WebHID] Erro ao enviar pacote para o DualSense:", err));
        if (bytesWrittenPtr !== 0) {
            const view = new DataView(heap.buffer, heap.byteOffset);
            view.setUint32(bytesWrittenPtr, length, true);
        }
        return true;
    }
    invalidateHandle(handle) {
        console.log("[WebHID] Invalidando handle:", handle);
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
        registerManually: async (descriptor) => {
            await bridge.registerManually(descriptor);
        },
    };
}

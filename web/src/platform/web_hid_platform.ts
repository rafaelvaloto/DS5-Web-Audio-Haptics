import { NativeModule } from "../lib/GamepadCoreHost";
import { Descriptor } from "../types.ts";

type PlatformSignature = {
	read: string;
	write: string;
	detect: string;
	createHandle: string;
	invalidateHandle: string;
	configureFeatures: string;
	processAudioHaptics: string;
};

// Signatures corrected to match the C++ calls without arguments/with BigInt
const PLATFORM_SIGNATURES: PlatformSignature = {
	read: "ijiii",
	write: "ijiii",
	detect: "iii",
	createHandle: "ii",
	invalidateHandle: "vj", // void return, i64 arg (BigInt handle)
	configureFeatures: "i", // int return, 0 args
	processAudioHaptics: "v", // void return, 0 args
};

export interface PlatformBridgeRegistration {
	dispose(): Promise<void>;
	registerManually(descriptor: Descriptor): Promise<void>;
}

class WebHidPlatformBridge {
	byHandle: Map<number, Descriptor> = new Map();

	async registerManually(descriptor: Descriptor): Promise<void> {
		this.byHandle.set(descriptor.handleId, descriptor);
	}

	read = (heap: Uint8Array, handle: number, buffer: number, length: number, bytesReadPtr: number): boolean => {
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

	write(heap: Uint8Array, handle: number, buffer: number, length: number, bytesWrittenPtr: number): boolean {
		const outputPacket = new Uint8Array(heap.buffer, heap.byteOffset + buffer, length);
		const reportId = outputPacket[0];
		const reportData: any = outputPacket.subarray(1);

		const device = this.byHandle.get(handle)?.device;
		if (!device) {
			console.error("[WebHID] Dispositivo não encontrado para o handle:", handle);
			return false;
		}

		device
			.sendReport(reportId, reportData)
			.catch((err: any) => console.error("[WebHID] Erro ao enviar pacote para o DualSense:", err));

		if (bytesWrittenPtr !== 0) {
			const view = new DataView(heap.buffer, heap.byteOffset);
			view.setUint32(bytesWrittenPtr, length, true);
		}

		return true;
	}

	detect = (heap: Uint8Array, descriptorsBuffer: number, maxDevices: number): number => {
		return 0;
	};

	createHandle = (heap: Uint8Array, descriptorBuffer: number): boolean => {
		return true;
	};

	invalidateHandle(handle: number): void {
		console.log("[WebHID] Invalidando handle:", handle);
		const entry = this.byHandle.get(handle);
		if (!entry) return;

		this.byHandle.delete(handle);
		entry.handleId = 0;

		if (entry.inputListener) {
			entry.device.removeEventListener("inputreport", entry.inputListener as EventListener);
			entry.inputListener = undefined;
		}
	}

	configureFeatures(): boolean {
		return true;
	}

	processAudioHaptics(): void {
		// Implemented in the main audio loop
	}

	async dispose(): Promise<void> {
		for (const entry of this.byHandle.values()) {
			if (entry.inputListener) {
				entry.device.removeEventListener("inputreport", entry.inputListener as EventListener);
			}
			if (entry.device.opened) {
				await entry.device.close().catch(() => undefined);
			}
		}
		this.byHandle.clear();
	}

	private writeInt32(heap: Uint8Array, ptr: number, value: number): void {
		if (!ptr) return;

		new DataView(heap.buffer, heap.byteOffset + ptr, 4).setInt32(0, value, true);
	}
}

export async function initializeWebHidPlatformBridge(
	module: NativeModule,
	signatures: Partial<PlatformSignature> = {}
): Promise<PlatformBridgeRegistration> {
	if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
		throw new Error("Module missing addFunction/removeFunction.");
	}

	const bridge = new WebHidPlatformBridge();
	const resolved = { ...PLATFORM_SIGNATURES, ...signatures };

	const readPtr = module.addFunction(
		(bighandle: bigint | number, buffer: number, length: number, bytesRead: number) => {
			return bridge.read(module.HEAPU8, Number(bighandle), buffer, length, bytesRead) ? 1 : 0;
		},
		resolved.read
	);

	const writePtr = module.addFunction(
		(handle: bigint | number, buffer: number, length: number, bytesWritten: number) => {
			return bridge.write(module.HEAPU8, Number(handle), buffer, length, bytesWritten) ? 1 : 0;
		},
		resolved.write
	);

	const detectPtr = module.addFunction((descriptorsBuffer: number, maxDevices: number) => {
		return bridge.detect(module.HEAPU8, descriptorsBuffer, maxDevices);
	}, resolved.detect);

	const createHandlePtr = module.addFunction((descriptorBuffer: number) => {
		return bridge.createHandle(module.HEAPU8, descriptorBuffer) ? 1 : 0;
	}, resolved.createHandle);

	const invalidateHandlePtr = module.addFunction((handle: bigint | number) => {
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

	initializeBridge(
		readPtr,
		writePtr,
		detectPtr,
		createHandlePtr,
		invalidateHandlePtr,
		configureFeaturesPtr,
		processAudioHapticsPtr
	);

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
		registerManually: async (descriptor: Descriptor) => {
			await bridge.registerManually(descriptor);
		},
	};
}

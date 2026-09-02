import { SONY_VENDOR_ID, DEVICE_TYPE_BY_PRODUCT_ID } from "../const.ts";
import { Descriptor } from "../types.ts";
import { NativeModule } from "../lib/GamepadCoreHost";

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
	registerManually(device: HIDDevice, handleId: number, path: string, deviceType: number): Promise<void>;
}

export function isWebHidAvailable(): boolean {
	return typeof navigator !== "undefined" && Boolean(navigator.hid);
}

export async function requestSonyWebHidAccess(): Promise<HIDDevice[]> {
	if (!navigator.hid) {
		throw new Error("WebHID não está disponível neste navegador.");
	}
	return navigator.hid.requestDevice({ filters: [{ vendorId: SONY_VENDOR_ID }] });
}

export async function listAuthorizedSonyDevices(): Promise<HIDDevice[]> {
	if (!navigator.hid) {
		return [];
	}
	const devices = await navigator.hid.getDevices();
	return devices.filter((d) => d.vendorId === SONY_VENDOR_ID && DEVICE_TYPE_BY_PRODUCT_ID[d.productId] !== undefined);
}

class WebHidPlatformBridge {
	byHandle: Map<number, any> = new Map();

	async registerManually(device: HIDDevice, handle: number, path: string, type: number): Promise<void> {
		if (!device.opened) {
			await device.open();
		}

		const buffer = new Uint8Array(78);
		const entry = { device, handle, path, type, lastInputPacket: buffer, inputListener: null as any };

		entry.inputListener = (event: HIDInputReportEvent) => {
			entry.lastInputPacket = new Uint8Array(event.data.buffer as ArrayBuffer);
		};

		device.addEventListener("inputreport", entry.inputListener);
		this.byHandle.set(handle, entry);
	}

	read(heap: Uint8Array, handle: number, buffer: number, length: number, bytesReadPtr: number): boolean {
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

	write(heap: Uint8Array, handle: number, buffer: number, length: number, bytesWrittenPtr: number): boolean {
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

		entry.device.sendReport(reportId, payload).catch((error: any) => {
			console.error("WebHID sendReport falhou:", error);
		});

		this.writeInt32(heap, bytesWrittenPtr, length);
		return true;
	}

	detect(heap: Uint8Array, descriptorsBuffer: number, maxDevices: number): number {
		return 0;
	}

	createHandle(heap: Uint8Array, descriptorBuffer: number): boolean {
		return false;
	}

	invalidateHandle(handle: number): void {
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
		registerManually: async (device: HIDDevice, handleId: number, path: string, deviceType: number) => {
			await bridge.registerManually(device, handleId, path, deviceType);
		},
	};
}

import type { WasmContext } from "./load.ts";
import { Descriptor } from "./types.ts";
import { NativeModule } from "./lib/GamepadCoreHost";
import { PlatformBridgeRegistration } from "./platform/web_hid_platform.ts";
import { DeviceRegistryPolicy, initializeDeviceRegistryPolicy } from "./policies/device_registry_policy.ts";
import { api, bindingAPI } from "./api.ts";
import { t } from "./i18n";

export class GamepadClientApplication {
	private nextManualHandle: number = 100;
	private pendingDescriptor: Descriptor | null = null;

	public readonly api: api | undefined;
	public readonly module: NativeModule | undefined;
	public readonly devices = new Map<number, Descriptor>();
	public readonly platform: PlatformBridgeRegistration | null;
	public readonly registry: DeviceRegistryPolicy | null = null;

	// log static listeners
	private static readonly logListeners = new Set<(message: string, level?: number) => void>();

	public constructor(
		module: NativeModule,
		platform: PlatformBridgeRegistration | null,
		registry: DeviceRegistryPolicy | null,
		logFnPtr: number | null
	) {
		this.module = module;
		this.platform = platform;
		this.registry = registry;
		this.api = bindingAPI(module);
	}

	// ...
	static createFromContext(context: WasmContext, typeId: number = 0): GamepadClientApplication {
		const { module, platform } = context;

		let device = 0;
		const ref: { value: GamepadClientApplication | null } = { value: null };

		const registry = initializeDeviceRegistryPolicy(module, typeId, {
			alloc: () => {
				device++;
				return device;
			},
			dispatch: (deviceId) => {
				const app = ref.value;
				if (app && app.pendingDescriptor) {
					app.devices.set(deviceId, app.pendingDescriptor);
				}

				GamepadClientApplication.emitLog(t("logs.deviceDispatched", { id: deviceId }));
			},
			disconnect: (deviceId) => {
				const app = ref.value;
				if (app) {
					const descriptor = app.devices.get(deviceId);
					if (descriptor?.inputListener) {
						descriptor.device.removeEventListener("inputreport", descriptor.inputListener as EventListener);
					}
					app.devices.delete(deviceId);
				}

				GamepadClientApplication.emitLog(t("logs.deviceDisconnected", { id: deviceId }));
			},
		});

		return (ref.value = new GamepadClientApplication(module, platform, registry, null));
	}

	/**
	 * Request access to HID devices (e.g., Sony DualSense) via the WebHID API.
	 * Returns an array with the names of the authorized devices.
	 */
	public async requestDeviceAccess(): Promise<string[]> {
		// Specific filter for the Sony DualSense (Vendor ID: 0x054C, Product ID: 0x0CE6)
		// If you want to accept any controller, just pass { filters: [] }
		const devices = await navigator.hid.requestDevice({
			filters: [{ vendorId: 0x054c, productId: 0x0ce6 }],
		});

		const connectedNames: string[] = [];

		for (const device of devices) {
			// Check if the device is already connected
			const handle = this.nextManualHandle++;
			const path = device.productName || "Sony DualSense (WebHID)";

			// Open the device if it's not already opened
			await this.createDeviceFromDescriptor(
				device,
				handle,
				1, // deviceType: 1 (Genérico/DualSense)
				1, // connectionType: 1 (Bluetooth)
				true, // isConnected
				path
			);

			connectedNames.push(path);
		}

		return connectedNames;
	}

	public async createDeviceFromDescriptor(
		device: HIDDevice,
		handle: number,
		deviceType: number,
		connectionType: number,
		isConnected: boolean,
		path: string
	): Promise<void> {
		if (!this.api?.create) return;

		if (this.platform?.registerManually) {
			await this.platform.registerManually(device, handle, path, deviceType);
		}

		this.pendingDescriptor = {
			path,
			deviceType,
			device,
			handleId: handle,
			lastInputPacket: new Uint8Array(0),
		};

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

				this.api.create(descriptorPtr);
				GamepadClientApplication.emitLog(`[GamepadClient] Dispositivo injetado: ${path}`);
			}
		} finally {
			this.module?._free(descriptorPtr);
			this.pendingDescriptor = null; // Clean up the pending descriptor after creation
		}
	}

	private inputTimer: number | null = null;
	private lastFrameTime: number = 0;

	// ...

	/**
	 * Inicia o loop da engine (Polling)
	 */
	public run(): void {
		if (this.inputTimer !== null) return; // Já está rodando

		this.lastFrameTime = performance.now();
		GamepadClientApplication.emitLog("[GamepadClient] Engine iniciada (Polling 100Hz)");

		// Roda a cada 10ms (100 FPS)
		this.inputTimer = window.setInterval(() => {
			const now = performance.now();
			const deltaMs = now - this.lastFrameTime;
			this.lastFrameTime = now;
			const deltaSeconds = deltaMs / 1000.0;

			// Para cada controle conectado, atualiza Input e Output
			for (const [deviceId, descriptor] of this.devices.entries()) {
				// 1. Pede pro C++ processar os inputs (vai acionar aquele callback 'read' da Platform)
				this.api?.update(deviceId, deltaSeconds);

				// this.api?.state(deviceId, bufferPtr...);
				// 3. Pede pro C++ enviar o Output (vibração, gatilhos, luzes) de volta pro controle
				if (this.api?.output) {
					this.api.output(deviceId);
				}
			}
		}, 10);
	}

	/**
	 * Para o loop da engine
	 */
	public stop(): void {
		if (this.inputTimer !== null) {
			window.clearInterval(this.inputTimer);
			this.inputTimer = null;
			GamepadClientApplication.emitLog("[GamepadClient] Engine parada.");
		}
	}

	/**
	 * Registra um ouvinte para receber os logs.
	 * Retorna uma função de limpeza (cleanup) caso queira parar de escutar.
	 */
	public static onLog(listener: (message: string, level?: number) => void): () => void {
		GamepadClientApplication.logListeners.add(listener);
		return () => GamepadClientApplication.logListeners.delete(listener);
	}

	/**
	 * Publica uma linha de log no console e notifica todos os observadores.
	 */
	public static emitLog(message: string, level?: number): void {
		console.log(message); // Garante que sempre apareça no console do DevTools

		for (const listener of GamepadClientApplication.logListeners) {
			try {
				listener(message, level);
			} catch (err) {
				console.error("[GamepadClient] Error in log listener:", err);
			}
		}
	}
}

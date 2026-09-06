import type { WasmContext } from "./load.ts";
import { Descriptor, state_t } from "./types.ts";
import { NativeModule } from "./lib/GamepadCoreHost";
import { PlatformBridgeRegistration } from "./platform/web_hid_platform.ts";
import { DeviceRegistryPolicy, initializeDeviceRegistryPolicy } from "./policies/device_registry_policy.ts";
import { api, bindingAPI } from "./api.ts";
import { FRAME_MS, FRAME_SECONDS, INPUT_DESCRIPTOR_SIZE, SONY_VENDOR_ID } from "./const.ts";
import { AudioHapticsManager } from "./stream.ts";
import { DualSenseSocketBridge } from "./wsocket.ts";
import i18n from "./i18n/index.ts";

const deviceChannel = new BroadcastChannel("dualsense_channel");

export class GamepadClientApplication {
	private readonly inputBufferPtr: number;
	private inputTimer: number | null = null;
	public nextManualHandle: number = 100;
	private isNowEnabled: boolean | undefined | null = false;
	private pendingDescriptor: Descriptor | null = null;

	public static pending: boolean = true;
	public readonly api: api | undefined;
	public readonly media: AudioHapticsManager | null = null;
	public readonly module: NativeModule | undefined;
	public readonly devices = new Map<number, Descriptor>();
	public readonly platform: PlatformBridgeRegistration | null;
	public readonly registry: DeviceRegistryPolicy | null = null;
	public readonly dsExtensionBridge = new DualSenseSocketBridge();

	// Log static listeners
	private static readonly logListeners = new Set<(message: string, level?: number) => void>();

	public constructor(
		module: NativeModule,
		platform: PlatformBridgeRegistration | null,
		registry: DeviceRegistryPolicy | null,
		media: AudioHapticsManager | null
	) {
		this.module = module;
		this.platform = platform;
		this.registry = registry;
		this.media = media;
		this.api = bindingAPI(module);
		this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
		this.media?.setApi(this.api);

		// Callbacks logs C++ (WASM)
		const jsLogCallback = module.addFunction((messagePtr: number) => {
			const rawMessage = module.UTF8ToString(messagePtr);
			const finalMessage = i18n.t(rawMessage);
			GamepadClientApplication.emitLog(`[WASM] ${finalMessage}`);
		}, "vi");

		if (this.api.logs) {
			this.api.logs(jsLogCallback);
		}
	}

	public wsToggle(): void {
		if (this.dsExtensionBridge.isConnected()) {
			this.dsExtensionBridge.disconnect();
			return;
		}
		this.dsExtensionBridge.connect();
	}

	public wsIsConnect(): boolean {
		return this.dsExtensionBridge.isConnected();
	}

	static createFromContext(context: WasmContext, typeId: number = 1): GamepadClientApplication {
		const { module, platform } = context;

		let deviceId = 1;
		const ref: { value: GamepadClientApplication | null } = { value: null };

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
						descriptor.device.removeEventListener("inputreport", descriptor.inputListener as EventListener);
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

	public async requestDeviceAccess(): Promise<string[]> {
		const devices = await navigator.hid.requestDevice({
			filters: [
				{ vendorId: SONY_VENDOR_ID, productId: 0x0ce6 },
				{ vendorId: SONY_VENDOR_ID, productId: 0x0df2 },
			],
		});

		const connectedNames: string[] = [];

		for (const device of devices) {
			const handle = this.nextManualHandle++;
			const path = device.productName || "Sony DualSense (WebHID)";

			await this.createDeviceFromDescriptor(device, handle, 1, 1, true, path);

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

						device.oninputreport = (event: HIDInputReportEvent) => {
							const fullPacket = new Uint8Array(event.data.byteLength + 1);
							fullPacket[0] = event.reportId;
							fullPacket.set(
								new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength),
								1
							);
							descriptor.lastInputPacket = fullPacket;
						};
						device.addEventListener("inputreport", device.oninputreport);

						this.pendingDescriptor = descriptor as any;
						this.platform?.registerManually(descriptor as any);

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
						} finally {
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

	public run(): void {
		if (this.inputTimer !== null) return;

		let isSend = false;
		const applySending = (message: number, deviceId: number) => {
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
				} else if (state.bDpadRight && state.bRightStick) {
					applySending(1, deviceId);
				} else if (state.bDpadDown && state.bRightStick) {
					applySending(2, deviceId);
				} else if (state.bDpadLeft && state.bRightStick) {
					applySending(3, deviceId);
				}

				this.dsExtensionBridge.send(state);
			}
		}, FRAME_MS);
	}

	public stop(): void {
		if (this.inputTimer !== null) {
			window.clearInterval(this.inputTimer);
			this.inputTimer = null;
			GamepadClientApplication.emitLog(i18n.t("logs.loopStopped") || "[GamepadClient] Engine parada");
		}
	}

	public readInputState(deviceId: number): state_t {
		if (this.pendingDescriptor || GamepadClientApplication.pending) {
			return {} as state_t;
		}

		this.api?.update(deviceId, FRAME_SECONDS);
		this.api?.state(deviceId, this.inputBufferPtr);

		const b = this.inputBufferPtr;
		const heap = this.module?.HEAPU8;

		if (!heap) {
			return {} as state_t;
		}

		const rf = (offset: number) => {
			if (typeof this.module?.getValue === "function") {
				return this.module.getValue(b + offset, "float");
			}
			const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
			return view.getFloat32(0, true);
		};

		const ri32 = (offset: number) => {
			if (typeof this.module?.getValue === "function") {
				return this.module.getValue(b + offset, "i32");
			}
			const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
			return view.getInt32(0, true);
		};

		const rb = (offset: number) => (heap[b + offset] ?? 0) !== 0;
		const ru8 = (offset: number) => heap[b + offset] ?? 0;

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

	public async toggleHaptics() {
		try {
			this.isNowEnabled = await this.media?.toggle();
			return this.isNowEnabled;
		} catch (err) {
			GamepadClientApplication.emitLog(`[Engine] Erro ao iniciar captura de áudio: ${err}`);
			return false;
		}
	}

	public async audioSettings(
		device: number,
		isMic: number,
		isHeadset: number,
		isSpeaker: number,
		micVolume: number,
		audioVolume: number,
		rumbleMode: number,
		rumbleReduce: number,
		triggerReduce: number,
		gain: number = 1.0,
		volume: number = 100
	) {
		this.media?.applySettings(
			device,
			isMic,
			isHeadset,
			isSpeaker,
			micVolume,
			audioVolume,
			rumbleMode,
			rumbleReduce,
			triggerReduce,
			gain,
			volume
		);
	}

	public static onLog(listener: (message: string, level?: number) => void): () => void {
		GamepadClientApplication.logListeners.add(listener);
		return () => GamepadClientApplication.logListeners.delete(listener);
	}

	public static emitLog(message: string, level?: number): void {
		console.log(message);
		for (const listener of GamepadClientApplication.logListeners) {
			try {
				listener(message, level);
			} catch (err) {
				console.log("[GamepadClient] Error in log listener:", err);
			}
		}
	}
}

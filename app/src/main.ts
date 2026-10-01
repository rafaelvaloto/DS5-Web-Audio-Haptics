import type { WasmContext } from "./load.ts";
import { Descriptor, motion_sensors_t, state_t } from "./types.ts";
import { NativeModule } from "./lib/GamepadCoreHost";
import { PlatformBridgeRegistration } from "./platform/web_hid_platform.ts";
import { DeviceRegistryPolicy, initializeDeviceRegistryPolicy } from "./policies/device_registry_policy.ts";
import { api, bindingAPI } from "./api.ts";
import {
	BLUETOOTH_CONNECTION_TYPE,
	DUALSHOCK4_BLUETOOTH_BUFFER_SIZE,
	DUALSHOCK4_DEVICE_TYPE,
	FRAME_MS,
	FRAME_SECONDS,
	getSonyConnectionType,
	getSonyDeviceType,
	INPUT_DESCRIPTOR_SIZE,
	SONY_HID_FILTERS,
	STANDARD_HID_BUFFER_SIZE,
} from "./const.ts";
import { AudioHapticsManager } from "./stream.ts";
import { DualSenseSocketBridge } from "./wsocket.ts";
import { BrowserGamepadBridge } from "./browser-gamepad-bridge.ts";
import { BrowserKeyboardBridge } from "./browser-keyboard-bridge.ts";
import { loadGyroscopeMapping, toggleGyroscopeMapping } from "./keyboard-bindings.ts";
import i18n from "./i18n/index.ts";

const deviceChannel = new BroadcastChannel("dualsense_channel");

export class GamepadClientApplication {
	private readonly inputBufferPtr: number;
	private readonly motionSensorsBufferPtr: number;
	private readonly gyroscopeEnabledDevices = new Set<number>();
	private readonly dpadUpPressedDevices = new Set<number>();
	private readonly dpadDownPressedDevices = new Set<number>();
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
	public readonly browserGamepadBridge = new BrowserGamepadBridge();
	public readonly browserKeyboardBridge = new BrowserKeyboardBridge();

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
		this.motionSensorsBufferPtr = module._malloc(24);
		this.media?.setApi(this.api);

		// Callbacks logs C++ (WASM)
		const jsLogCallback = module.addFunction((level: number, messagePtr: number) => {
			const rawMessage = module.UTF8ToString(messagePtr);
			const finalMessage = i18n.t(rawMessage);
			GamepadClientApplication.emitLog(`[WASM] ${finalMessage}`, level);
		}, "vii");

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

	public async browserGamepadToggle(): Promise<void> {
		if (this.browserGamepadBridge.isConnected()) {
			this.browserGamepadBridge.disconnect();
			return;
		}
		await this.browserGamepadBridge.connect();
	}

	public browserGamepadIsConnected(): boolean {
		return this.browserGamepadBridge.isConnected();
	}

	public async browserKeyboardToggle(): Promise<void> {
		if (this.browserKeyboardBridge.isConnected()) {
			this.browserKeyboardBridge.disconnect();
			return;
		}
		await this.browserKeyboardBridge.connect();
	}

	public browserKeyboardIsConnected(): boolean {
		return this.browserKeyboardBridge.isConnected();
	}

	public supportsDualSenseFeatures(): boolean {
		return [...this.devices.values()].some(
			(descriptor) => descriptor.deviceType !== DUALSHOCK4_DEVICE_TYPE
		);
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
					const descriptor = app.pendingDescriptor;
					descriptor.controllerId = dispatchedId;
					app.devices.set(dispatchedId, descriptor);
					app.pendingDescriptor = null;
					GamepadClientApplication.pending = false;
					window.dispatchEvent(new Event("gch-devices-changed"));

					// Exemplo usando a tradução
					GamepadClientApplication.emitLog(i18n.t("logs.webHidConnected", { id: dispatchedId }));
				}
			},
			disconnect: (disconnectedId) => {
				GamepadClientApplication.emitLog(`Device disconnected: ${disconnectedId}`);
				const app = ref.value;
				if (app) {
					app.gyroscopeEnabledDevices.delete(disconnectedId);
					app.dpadUpPressedDevices.delete(disconnectedId);
					app.dpadDownPressedDevices.delete(disconnectedId);
					const descriptor = app.devices.get(disconnectedId);
					if (descriptor?.inputListener) {
						descriptor.device.removeEventListener("inputreport", descriptor.inputListener as EventListener);
					}
					app.devices.delete(disconnectedId);
					window.dispatchEvent(new Event("gch-devices-changed"));
				}

				GamepadClientApplication.emitLog(i18n.t("logs.notConnected", { id: disconnectedId }));
			},
		});

		const media = new AudioHapticsManager({
			module: module,
			onChange: (status) => {
				GamepadClientApplication.emitLog(`[Engine] Audio/Haptics status: ${status ? "Enabled" : "Disabled"}`);
				if (!status) ref.value?.stop();
				window.dispatchEvent(new CustomEvent("gch-media-changed", { detail: status }));
			},
		});

		return (ref.value = new GamepadClientApplication(module, platform, registry, media));
	}

	private setCalibrationValues(controllerId: number, calibrationBytes?: Uint8Array): void {
		if (!calibrationBytes?.byteLength) return;

		if (!this.api?.calibration || !this.module) {
			GamepadClientApplication.emitLog("GCH_SetCalibrationValues is not available in the WASM module");
			return;
		}

		const calibrationPtr = this.module._malloc(calibrationBytes.byteLength);
		if (!calibrationPtr) {
			GamepadClientApplication.emitLog("Failed to allocate the calibration buffer");
			return;
		}

		try {
			this.module.HEAPU8.set(calibrationBytes, calibrationPtr);
			this.api.calibration(controllerId, calibrationPtr, calibrationBytes.byteLength);
		} finally {
			this.module._free(calibrationPtr);
		}
	}

	private normalizeCalibrationReport(
		data: DataView,
		deviceType: number,
		connectionType: number,
		reportId: number
	): Uint8Array {
		const raw = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		if (deviceType !== DUALSHOCK4_DEVICE_TYPE) return raw.slice();

		const expectedSize = connectionType === BLUETOOTH_CONNECTION_TYPE ? 41 : 37;
		const normalized = new Uint8Array(expectedSize);
		if (raw[0] === reportId) {
			normalized.set(raw.subarray(0, expectedSize));
		} else {
			normalized[0] = reportId;
			normalized.set(raw.subarray(0, expectedSize - 1), 1);
		}
		return normalized;
	}

	public async requestDeviceAccess(): Promise<string[]> {
		const devices = await navigator.hid.requestDevice({
			filters: [...SONY_HID_FILTERS],
		});

		const connectedNames: string[] = [];

		for (const device of devices) {
			const handle = this.nextManualHandle++;
			const path = device.productName || "Sony PlayStation Controller (WebHID)";
			const deviceType = getSonyDeviceType(device.productId);
			const connectionType = getSonyConnectionType(device);

			await this.createDeviceFromDescriptor(
				device,
				handle,
				deviceType,
				connectionType,
				true,
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
				const calibrationReportId = deviceType === DUALSHOCK4_DEVICE_TYPE &&
					connectionType !== BLUETOOTH_CONNECTION_TYPE ? 0x02 : 0x05;
				const calibrationReport = device.receiveFeatureReport(calibrationReportId);
				calibrationReport
					.then((data) => {
						const calibrationBytes = this.normalizeCalibrationReport(
							data,
							deviceType,
							connectionType,
							calibrationReportId
						);
						const inputBufferSize = deviceType === DUALSHOCK4_DEVICE_TYPE &&
							connectionType === BLUETOOTH_CONNECTION_TYPE
							? DUALSHOCK4_BLUETOOTH_BUFFER_SIZE
							: STANDARD_HID_BUFFER_SIZE;
						const descriptor: Descriptor = {
							path: device.productName,
							deviceType,
							device: device,
							handleId: handle,
							calibrationBytes,
							lastInputPacket: new Uint8Array(inputBufferSize)
								.fill(0)
								.map((value, index) => index === 0
									? deviceType === DUALSHOCK4_DEVICE_TYPE
										? connectionType === BLUETOOTH_CONNECTION_TYPE ? 0x11 : 0x01
										: 0x31
									: value),
						};

						const inputListener = (event: HIDInputReportEvent) => {
							const fullPacket = new Uint8Array(inputBufferSize);
							fullPacket[0] = event.reportId;
							fullPacket.set(
								new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
									.subarray(0, inputBufferSize - 1),
								1
							);
							descriptor.lastInputPacket = fullPacket;
						};
						descriptor.inputListener = inputListener;
						device.addEventListener("inputreport", inputListener as EventListener);

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
								if (descriptor.controllerId !== undefined) {
									this.setCalibrationValues(descriptor.controllerId, calibrationBytes);
								}
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

		let nextTriggerSelectionAt = 0;
		const applySending = (message: number, deviceId: number) => {
			const now = performance.now();
			if (now < nextTriggerSelectionAt) return;
			nextTriggerSelectionAt = now + 2000;
			deviceChannel.postMessage({
				type: "DEVICE_APPLY_TRIGGER",
				message,
				deviceId,
			});
		};

		GamepadClientApplication.emitLog(i18n.t("logs.loopStarted") || "[GamepadClient] Engine iniciada (Polling)");

		this.inputTimer = window.setInterval(() => {
			for (const deviceId of this.devices.keys()) {
				const state = this.readInputState(deviceId);
				this.handleGyroscopeButtons(deviceId, state);
				const gyroscopeMapping = loadGyroscopeMapping();
				const gyroscopeEnabled = gyroscopeMapping.enabled && (
					gyroscopeMapping.output === "gamepad"
						? this.browserGamepadBridge.isConnected()
						: this.browserKeyboardBridge.isConnected()
				);
				const motionSensors = this.readMotionSensors(deviceId, gyroscopeEnabled);
				const activeMotionSensors = state.bDpadDown ? undefined : motionSensors;

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
				this.browserGamepadBridge.send(state, activeMotionSensors);
				this.browserKeyboardBridge.send(state, activeMotionSensors);
			}
		}, FRAME_MS);
	}

	public stop(): void {
		if (this.inputTimer !== null) {
			window.clearInterval(this.inputTimer);
			this.inputTimer = null;
			this.browserGamepadBridge.reset();
			this.browserKeyboardBridge.reset();
			for (const deviceId of [...this.gyroscopeEnabledDevices]) {
				this.setGyroscopeEnabled(deviceId, false);
			}
			this.dpadUpPressedDevices.clear();
			this.dpadDownPressedDevices.clear();
			GamepadClientApplication.emitLog(i18n.t("logs.loopStopped") || "[GamepadClient] Engine parada");
		}
	}

	private handleGyroscopeButtons(deviceId: number, state: state_t): void {
		if (state.bDpadUp) {
			if (!this.dpadUpPressedDevices.has(deviceId)) {
				this.dpadUpPressedDevices.add(deviceId);
				const enabled = toggleGyroscopeMapping();
				GamepadClientApplication.emitLog(`[Gyroscope] ${enabled ? "Enabled" : "Disabled"} via D-Pad Up.`);
			}
		} else {
			this.dpadUpPressedDevices.delete(deviceId);
		}

		if (state.bDpadDown) {
			if (!this.dpadDownPressedDevices.has(deviceId)) {
				this.dpadDownPressedDevices.add(deviceId);
				this.api?.resetGyroscope(deviceId);
				GamepadClientApplication.emitLog("[Gyroscope] Flow paused and controller realigned via D-Pad Down.");
			}
		} else {
			this.dpadDownPressedDevices.delete(deviceId);
		}
	}

	private readMotionSensors(deviceId: number, enabled: boolean): motion_sensors_t | undefined {
		this.setGyroscopeEnabled(deviceId, enabled);

		if (!enabled || !this.module || !this.api?.motionSensors) {
			return undefined;
		}
		if (!this.api.motionSensors(deviceId, this.motionSensorsBufferPtr)) {
			return undefined;
		}

		const heap = this.module.HEAPU8;
		const view = new DataView(heap.buffer, heap.byteOffset + this.motionSensorsBufferPtr, 24);
		const readFloat = (offset: number) => view.getFloat32(offset, true);
		return {
			gyroscopeX: readFloat(0),
			gyroscopeY: readFloat(4),
			gyroscopeZ: readFloat(8),
			accelerometerX: readFloat(12),
			accelerometerY: readFloat(16),
			accelerometerZ: readFloat(20),
		};
	}

	private setGyroscopeEnabled(deviceId: number, enabled: boolean): void {
		const wasEnabled = this.gyroscopeEnabledDevices.has(deviceId);
		if (enabled === wasEnabled) {
			return;
		}

		this.api?.enableGyroscope(deviceId, enabled ? 1 : 0);

		if (enabled) {
			this.gyroscopeEnabledDevices.add(deviceId);
		} else {
			this.gyroscopeEnabledDevices.delete(deviceId);
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
			this.isNowEnabled = await this.media?.toggle(this.supportsDualSenseFeatures());
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

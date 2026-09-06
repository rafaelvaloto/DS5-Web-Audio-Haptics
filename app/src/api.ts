import { type NativeModule } from "./lib/GamepadCoreHost";

/**
 * Represents the structure of api functions used for device communication and event handling.
 * Each api function corresponds to a specific event or action related to the device, such as logging,
 * device initialization, and device state updates.
 *
 */
export type api = {
	/** log device api */
	logs: (messagePtr: number) => void;

	/** device api */
	shutdown: () => void;

	/** status device api */
	state: (device: number, outBufferPtr: number) => void;
	create: (descriptorPtr: number) => void;
	update: (device: number, timer: number) => void;
	output: (device: number) => void;
	battery: (device: number) => number;

	/** outputs device api */
	reset: (device: number, hand: number) => void;
	lightbar: (device: number, red: number, green: number, blue: number) => void;
	triggers: (device: number, bufferPtr: number, length: number, hand: number) => number;
	settings: (
		device: number,
		bIsMic: number,
		bIsHeadset: number,
		bIsSpeaker: number,
		micVolume: number,
		audioVolume: number,
		rumbleMode: number,
		rumbleReduce: number,
		triggerReduce: number
	) => void;

	/** audio device api */
	audioInit: (volume: number, gain: number) => void;
	audioProcess: (device: number) => number | boolean;
	audioSubmitSamples: (
		audioDataPtr: number,
		frameCount: number,
		numChannels: number,
		sampleRate: number
	) => number | boolean;
};

export function bindingAPI(module: NativeModule): api {
	const cwrap = module.cwrap.bind(module);

	const maybe = (name: string, returnType: string | null, args: string[]): any => {
		try {
			return cwrap(name, returnType, args);
		} catch {
			return () => console.warn(`[API] Função C++ não encontrada: ${name}`);
		}
	};

	return {
		logs: maybe("GCH_SetLogCallback", null, ["number"]),

		shutdown: maybe("GCH_Shutdown", null, []),

		state: maybe("GCH_GetInputState", null, ["number", "number"]),
		create: maybe("GCH_CreateDevice", null, ["number"]),
		update: maybe("GCH_UpdateInput", null, ["number", "number"]),
		output: maybe("GCH_UpdateOutput", null, ["number"]),
		battery: maybe("GCH_BatteryLevelDevice", "number", ["number"]),

		reset: maybe("GCH_StopTrigger", null, ["number", "number"]),
		lightbar: maybe("GCH_Lightbar", null, ["number", "number", "number", "number"]),
		triggers: maybe("GCH_CustomTrigger", "number", ["number", "number", "number", "number"]),
		settings: maybe("GCH_DualSenseSettings", null, [
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
		]),

		audioInit: maybe("GCH_InitializeAudio", null, ["number", "number"]),
		audioProcess: maybe("GCH_ProcessAudioHaptics", "number", ["number"]),
		audioSubmitSamples: maybe("GCH_AudioSubmitSamples", "number", ["number", "number", "number", "number"]),
	};
}

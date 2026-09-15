(() => {
	type AdapterReport = {
		axes: [number, number, number, number];
		buttons: number[];
	};

	type MutableGamepadButton = {
		pressed: boolean;
		touched: boolean;
		value: number;
	};

	type MutableGamepad = {
		id: string;
		index: number;
		connected: boolean;
		timestamp: number;
		mapping: GamepadMappingType;
		axes: number[];
		buttons: MutableGamepadButton[];
		vibrationActuator: null;
		hapticActuators: readonly GamepadHapticActuator[];
	};

	const adapterWindow = window as Window & { __DS5_BROWSER_GAMEPAD_ADAPTER__?: boolean };
	if (adapterWindow.__DS5_BROWSER_GAMEPAD_ADAPTER__) return;
	adapterWindow.__DS5_BROWSER_GAMEPAD_ADAPTER__ = true;

	const originalGetGamepads = navigator.getGamepads.bind(navigator);
	const buttons: MutableGamepadButton[] = Array.from({ length: 17 }, () => ({
		pressed: false,
		touched: false,
		value: 0,
	}));

	const gamepad: MutableGamepad = {
		id: "Xbox 360 Controller (XInput STANDARD GAMEPAD)",
		index: 0,
		connected: false,
		timestamp: 0,
		mapping: "standard",
		axes: [0, 0, 0, 0],
		buttons,
		vibrationActuator: null,
		hapticActuators: [],
	};

	Object.defineProperty(gamepad, Symbol.toStringTag, { value: "Gamepad" });

	const isReport = (value: unknown): value is AdapterReport => {
		if (!value || typeof value !== "object") return false;
		const candidate = value as Partial<AdapterReport>;
		return Array.isArray(candidate.axes) && candidate.axes.length === 4 &&
			Array.isArray(candidate.buttons) && candidate.buttons.length >= 17;
	};

	const clamp = (value: unknown, minimum: number, maximum: number): number => {
		if (typeof value !== "number" || !Number.isFinite(value)) return 0;
		return Math.max(minimum, Math.min(maximum, value));
	};

	const getOriginalPads = (): Array<Gamepad | null> => Array.from(originalGetGamepads());

	const findVirtualIndex = (pads = getOriginalPads()): number => {
		const sonyIndex = pads.findIndex((pad) =>
			pad !== null && /dualsense|wireless controller|054c/i.test(pad.id)
		);
		if (sonyIndex >= 0) return sonyIndex;

		const emptyIndex = pads.findIndex((pad) => pad === null);
		return emptyIndex >= 0 ? emptyIndex : pads.length;
	};

	const dispatchGamepadEvent = (type: "gamepadconnected" | "gamepaddisconnected"): void => {
		let event: Event;
		try {
			event = new GamepadEvent(type, { gamepad: gamepad as unknown as Gamepad });
		} catch {
			event = new Event(type);
			Object.defineProperty(event, "gamepad", { value: gamepad });
		}
		window.dispatchEvent(event);
	};

	const updateReport = (report: AdapterReport): void => {
		const wasConnected = gamepad.connected;
		if (!wasConnected) gamepad.index = findVirtualIndex();

		gamepad.connected = true;
		gamepad.timestamp = performance.now();
		for (let index = 0; index < 4; index++) {
			gamepad.axes[index] = clamp(report.axes[index], -1, 1);
		}

		for (let index = 0; index < 17; index++) {
			const value = clamp(report.buttons[index], 0, 1);
			buttons[index].value = value;
			buttons[index].pressed = value > (index === 6 || index === 7 ? 0.1 : 0.5);
			buttons[index].touched = value > 0;
		}

		if (!wasConnected) dispatchGamepadEvent("gamepadconnected");
	};

	const disconnect = (): void => {
		if (!gamepad.connected) return;
		gamepad.connected = false;
		gamepad.timestamp = performance.now();
		gamepad.axes.fill(0);
		for (const button of buttons) {
			button.value = 0;
			button.pressed = false;
			button.touched = false;
		}
		dispatchGamepadEvent("gamepaddisconnected");
	};

	window.addEventListener("message", (event: MessageEvent<unknown>) => {
		if (event.source !== window || !event.data || typeof event.data !== "object") return;
		const message = event.data as { source?: string; type?: string; report?: unknown };
		if (message.source !== "DS5_EXTENSION") return;

		if (message.type === "DS5_GAMEPAD_DISCONNECT") {
			disconnect();
			return;
		}

		if (message.type === "DS5_GAMEPAD_STATE" && isReport(message.report)) {
			updateReport(message.report);
		}
	});

	Object.defineProperty(Navigator.prototype, "getGamepads", {
		configurable: true,
		writable: true,
		value(): Array<Gamepad | null> {
			const pads = getOriginalPads();
			if (!gamepad.connected) return pads;

			while (pads.length <= gamepad.index) pads.push(null);
			pads[gamepad.index] = gamepad as unknown as Gamepad;
			return pads;
		},
	});
})();

(() => {
	type KeyboardReport = {
		pressed: string[];
		mouse?: {
			dx: number;
			dy: number;
		};
		mouseButtons?: string[];
		mouseButtonValues?: Partial<Record<string, number>>;
		wheel?: number;
	};

	type KeyInfo = { key: string; keyCode: number };

	const adapterWindow = window as Window & { __DS5_BROWSER_KEYBOARD_ADAPTER__?: boolean };
	if (adapterWindow.__DS5_BROWSER_KEYBOARD_ADAPTER__) return;
	adapterWindow.__DS5_BROWSER_KEYBOARD_ADAPTER__ = true;

	// Maps a KeyboardEvent.code to the real key/keyCode a game or site expects,
	// since most listeners check event.key or the legacy event.keyCode/which.
	const KEY_INFO: Record<string, KeyInfo> = {
		KeyW: { key: "w", keyCode: 87 },
		KeyA: { key: "a", keyCode: 65 },
		KeyS: { key: "s", keyCode: 83 },
		KeyD: { key: "d", keyCode: 68 },
		KeyE: { key: "e", keyCode: 69 },
		KeyQ: { key: "q", keyCode: 81 },
		KeyR: { key: "r", keyCode: 82 },
		KeyF: { key: "f", keyCode: 70 },
		ArrowUp: { key: "ArrowUp", keyCode: 38 },
		ArrowDown: { key: "ArrowDown", keyCode: 40 },
		ArrowLeft: { key: "ArrowLeft", keyCode: 37 },
		ArrowRight: { key: "ArrowRight", keyCode: 39 },
		Numpad8: { key: "8", keyCode: 104 },
		Numpad2: { key: "2", keyCode: 98 },
		Numpad4: { key: "4", keyCode: 100 },
		Numpad6: { key: "6", keyCode: 102 },
		Space: { key: " ", keyCode: 32 },
		ShiftLeft: { key: "Shift", keyCode: 16 },
		ControlLeft: { key: "Control", keyCode: 17 },
		Enter: { key: "Enter", keyCode: 13 },
		Escape: { key: "Escape", keyCode: 27 },
	};

	let currentPressed = new Set<string>();
	let currentMouseButtons = new Set<string>();
	const suppressedVirtualMouseButtons = new Set<string>();
	let virtualMouseX = Math.round(window.innerWidth / 2);
	let virtualMouseY = Math.round(window.innerHeight / 2);
	let suppressVirtualMouseUntil = 0;
	let lastMouseButtonValues: Partial<Record<string, number>> = {};

	const isReport = (value: unknown): value is KeyboardReport => {
		if (!value || typeof value !== "object") return false;
		const candidate = value as Partial<KeyboardReport>;
		return Array.isArray(candidate.pressed);
	};

	const dispatchKey = (type: "keydown" | "keyup", code: string): void => {
		const info = getKeyInfo(code);
		if (!info) return;

		const event = new KeyboardEvent(type, {
			key: info.key,
			code,
			bubbles: true,
			cancelable: true,
			composed: true,
		});

		// key/code accept the constructor's values, but keyCode/which are legacy
		// read-only accessors that must be redefined for older listeners.
		Object.defineProperty(event, "keyCode", { get: () => info.keyCode });
		Object.defineProperty(event, "which", { get: () => info.keyCode });

		const target = document.activeElement || document.body || document;
		target.dispatchEvent(event);
	};

	const getKeyInfo = (code: string): KeyInfo | null => {
		const known = KEY_INFO[code];
		if (known) return known;

		const letter = /^Key([A-Z])$/.exec(code)?.[1];
		if (letter) return { key: letter.toLowerCase(), keyCode: letter.charCodeAt(0) };

		const digit = /^Digit([0-9])$/.exec(code)?.[1];
		if (digit) return { key: digit, keyCode: 48 + Number(digit) };

		const numpadDigit = /^Numpad([0-9])$/.exec(code)?.[1];
		if (numpadDigit) return { key: numpadDigit, keyCode: 96 + Number(numpadDigit) };

		const functionKey = /^F([1-9]|1[0-2])$/.exec(code)?.[1];
		if (functionKey) return { key: `F${functionKey}`, keyCode: 111 + Number(functionKey) };

		return null;
	};

	const updateReport = (report: KeyboardReport): void => {
		const nextPressed = new Set(report.pressed);
		lastMouseButtonValues = report.mouseButtonValues || {};
		const nextMouseButtons = new Set(report.mouseButtons || []);

		for (const code of currentPressed) {
			if (!nextPressed.has(code)) dispatchKey("keyup", code);
		}
		for (const code of nextPressed) {
			if (!currentPressed.has(code)) dispatchKey("keydown", code);
		}

		currentPressed = nextPressed;
		updateMouseButtons(nextMouseButtons);
		if (report.mouse && (report.mouse.dx !== 0 || report.mouse.dy !== 0)) {
			dispatchMouseMove(report.mouse.dx, report.mouse.dy);
		}
		if (report.wheel) {
			dispatchWheel(report.wheel);
		}
	};

	const updateMouseButtons = (reportedMouseButtons: Set<string>): void => {
		for (const code of [...suppressedVirtualMouseButtons]) {
			if (!reportedMouseButtons.has(code)) suppressedVirtualMouseButtons.delete(code);
		}

		const nextMouseButtons = new Set(
			[...reportedMouseButtons].filter((code) => !suppressedVirtualMouseButtons.has(code))
		);
		for (const code of currentMouseButtons) {
			if (!nextMouseButtons.has(code)) dispatchMouseButton("mouseup", code);
		}
		for (const code of nextMouseButtons) {
			if (!currentMouseButtons.has(code)) dispatchMouseButton("mousedown", code);
		}
		currentMouseButtons = nextMouseButtons;
	};

	const dispatchMouseMove = (dx: number, dy: number): void => {
		if (performance.now() < suppressVirtualMouseUntil) return;

		const target = document.pointerLockElement || document.activeElement || document.body || document;
		virtualMouseX = Math.max(0, Math.min(window.innerWidth, virtualMouseX + dx));
		virtualMouseY = Math.max(0, Math.min(window.innerHeight, virtualMouseY + dy));
		const event = new MouseEvent("mousemove", {
			bubbles: true,
			cancelable: true,
			composed: true,
			buttons: getMouseButtonsBitmask(),
			clientX: virtualMouseX,
			clientY: virtualMouseY,
			screenX: virtualMouseX,
			screenY: virtualMouseY,
		});

		Object.defineProperty(event, "movementX", { configurable: true, get: () => dx });
		Object.defineProperty(event, "movementY", { configurable: true, get: () => dy });
		Object.defineProperty(event, "mozMovementX", { configurable: true, get: () => dx });
		Object.defineProperty(event, "mozMovementY", { configurable: true, get: () => dy });
		Object.defineProperty(event, "pressure", {
			configurable: true,
			get: () => getStrongestMousePressure(),
		});
		target.dispatchEvent(event);
	};

	const dispatchMouseButton = (type: "mousedown" | "mouseup", code: string): void => {
		const target = document.pointerLockElement || document.activeElement || document.body || document;
		const button = code === "MouseLeft" ? 0 : code === "MouseMiddle" ? 1 : 2;
		const value = type === "mousedown" ? Math.max(0, Math.min(1, reportMouseValue(code))) : 0;
		const event = new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			button,
			buttons: type === "mousedown"
				? getMouseButtonsBitmask(code)
				: getMouseButtonsBitmask(undefined, code),
			clientX: virtualMouseX,
			clientY: virtualMouseY,
		});
		Object.defineProperty(event, "pressure", { configurable: true, get: () => value });
		target.dispatchEvent(event);
	};

	const reportMouseValue = (code: string): number => lastMouseButtonValues[code] ?? 1;

	const getStrongestMousePressure = (): number => {
		let strongest = 0;
		for (const code of currentMouseButtons) {
			strongest = Math.max(strongest, reportMouseValue(code));
		}
		return strongest;
	};

	const getMouseButtonsBitmask = (includeCode?: string, excludeCode?: string): number => {
		const active = new Set(currentMouseButtons);
		if (includeCode) active.add(includeCode);
		if (excludeCode) active.delete(excludeCode);
		let bitmask = 0;
		for (const code of active) {
			if (code === "MouseLeft") bitmask |= 1;
			if (code === "MouseRight") bitmask |= 2;
			if (code === "MouseMiddle") bitmask |= 4;
		}
		return bitmask;
	};

	const dispatchWheel = (direction: number): void => {
		const target = document.pointerLockElement || document.activeElement || document.body || document;
		const deltaY = direction < 0 ? -120 : 120;
		const event = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: virtualMouseX,
			clientY: virtualMouseY,
			deltaY,
		});
		target.dispatchEvent(event);
	};

	const disconnect = (): void => {
		for (const code of currentPressed) {
			dispatchKey("keyup", code);
		}
		currentPressed = new Set<string>();
		updateMouseButtons(new Set<string>());
		suppressedVirtualMouseButtons.clear();
	};

	window.addEventListener("mousedown", (event) => {
		if (!event.isTrusted) return;
		suppressVirtualMouseUntil = performance.now() + 250;
		const code = event.button === 0
			? "MouseLeft"
			: event.button === 1
				? "MouseMiddle"
				: event.button === 2 ? "MouseRight" : null;
		if (!code || !currentMouseButtons.has(code)) return;

		dispatchMouseButton("mouseup", code);
		currentMouseButtons.delete(code);
		suppressedVirtualMouseButtons.add(code);
	}, true);

	window.addEventListener("mousemove", (event) => {
		if (!event.isTrusted) return;
		virtualMouseX = event.clientX;
		virtualMouseY = event.clientY;
		suppressVirtualMouseUntil = performance.now() + 250;
	}, true);

	for (const eventType of ["mouseup", "wheel"] as const) {
		window.addEventListener(eventType, (event) => {
			if (event.isTrusted) suppressVirtualMouseUntil = performance.now() + 250;
		}, true);
	}

	window.addEventListener("message", (event: MessageEvent<unknown>) => {
		if (event.source !== window || !event.data || typeof event.data !== "object") return;
		const message = event.data as { source?: string; type?: string; report?: unknown };
		if (message.source !== "DS5_EXTENSION") return;

		if (message.type === "DS5_KEYBOARD_DISCONNECT") {
			disconnect();
			return;
		}

		if (message.type === "DS5_KEYBOARD_STATE" && isReport(message.report)) {
			updateReport(message.report);
		}
	});
})();

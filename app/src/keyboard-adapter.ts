(() => {
	type KeyboardReport = {
		pressed: string[];
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
		KeyF: { key: "f", keyCode: 70 },
		ArrowUp: { key: "ArrowUp", keyCode: 38 },
		ArrowDown: { key: "ArrowDown", keyCode: 40 },
		ArrowLeft: { key: "ArrowLeft", keyCode: 37 },
		ArrowRight: { key: "ArrowRight", keyCode: 39 },
		Space: { key: " ", keyCode: 32 },
		ShiftLeft: { key: "Shift", keyCode: 16 },
		ControlLeft: { key: "Control", keyCode: 17 },
		Enter: { key: "Enter", keyCode: 13 },
		Escape: { key: "Escape", keyCode: 27 },
	};

	let currentPressed = new Set<string>();

	const isReport = (value: unknown): value is KeyboardReport => {
		if (!value || typeof value !== "object") return false;
		const candidate = value as Partial<KeyboardReport>;
		return Array.isArray(candidate.pressed);
	};

	const dispatchKey = (type: "keydown" | "keyup", code: string): void => {
		const info = KEY_INFO[code];
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

	const updateReport = (report: KeyboardReport): void => {
		const nextPressed = new Set(report.pressed);

		for (const code of currentPressed) {
			if (!nextPressed.has(code)) dispatchKey("keyup", code);
		}
		for (const code of nextPressed) {
			if (!currentPressed.has(code)) dispatchKey("keydown", code);
		}

		currentPressed = nextPressed;
	};

	const disconnect = (): void => {
		for (const code of currentPressed) {
			dispatchKey("keyup", code);
		}
		currentPressed = new Set<string>();
	};

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

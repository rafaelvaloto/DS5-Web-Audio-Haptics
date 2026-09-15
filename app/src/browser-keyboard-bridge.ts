import type { state_t } from "./types.ts";

export type BrowserKeyboardBridgeStatus = "disconnected" | "connecting" | "connected" | "error";

type KeyboardReport = {
	pressed: string[];
};

const UPDATE_INTERVAL_MS = 10;

// Maps controller inputs to the keyboard keys they should emulate on the page.
const KEY_MAP: Array<{ code: string; isPressed: (state: state_t) => boolean }> = [
	{ code: "KeyW", isPressed: (state) => state.bLeftAnalogUp },
	{ code: "KeyS", isPressed: (state) => state.bLeftAnalogDown },
	{ code: "KeyA", isPressed: (state) => state.bLeftAnalogLeft },
	{ code: "KeyD", isPressed: (state) => state.bLeftAnalogRight },
	{ code: "ArrowUp", isPressed: (state) => state.bDpadUp },
	{ code: "ArrowDown", isPressed: (state) => state.bDpadDown },
	{ code: "ArrowLeft", isPressed: (state) => state.bDpadLeft },
	{ code: "ArrowRight", isPressed: (state) => state.bDpadRight },
	{ code: "Space", isPressed: (state) => state.bCross },
	{ code: "ShiftLeft", isPressed: (state) => state.bCircle },
	{ code: "ControlLeft", isPressed: (state) => state.bSquare },
	{ code: "KeyE", isPressed: (state) => state.bTriangle },
	{ code: "KeyQ", isPressed: (state) => state.bLeftShoulder },
	{ code: "KeyF", isPressed: (state) => state.bRightShoulder },
	{ code: "Enter", isPressed: (state) => state.bStart },
	{ code: "Escape", isPressed: (state) => state.bShare },
];

export class BrowserKeyboardBridge {
	private tabId: number | null = null;
	private lastSentAt = 0;
	private pressedKeys = new Set<string>();
	private statusListener:
		((status: BrowserKeyboardBridgeStatus, detail?: string) => void) | null = null;
	private readonly tabRemovedListener = (removedTabId: number): void => {
		if (removedTabId !== this.tabId) return;
		this.tabId = null;
		this.pressedKeys.clear();
		this.statusListener?.("disconnected");
	};

	setStatusListener(
		listener: ((status: BrowserKeyboardBridgeStatus, detail?: string) => void) | null
	): void {
		this.statusListener = listener;
	}

	async connect(): Promise<void> {
		this.disconnect(false);

		if (typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.tabs) {
			const message = "Browser Keyboard is only available in the installed browser extension.";
			this.statusListener?.("error", message);
			throw new Error(message);
		}

		const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
		if (tab?.id === undefined) {
			const message = "No active game tab was found.";
			this.statusListener?.("error", message);
			throw new Error(message);
		}

		this.statusListener?.("connecting", tab.title);
		let lastError = "The game page did not respond.";
		for (let attempt = 0; attempt < 10; attempt++) {
			try {
				const response: unknown = await chrome.tabs.sendMessage(tab.id, { type: "DS5_KEYBOARD_PING" });
				if (response && typeof response === "object" && "type" in response &&
					(response as { type: string }).type === "DS5_KEYBOARD_READY") {
					this.tabId = tab.id;
					this.lastSentAt = 0;
					this.pressedKeys.clear();
					chrome.tabs.onRemoved.addListener(this.tabRemovedListener);
					this.statusListener?.("connected", tab.title);
					return;
				}
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
			}
			await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
		}

		const message = `${lastError} Open a supported game page and reload it after reloading the extension.`;
		this.statusListener?.("error", message);
		throw new Error(message);
	}

	isConnected(): boolean {
		return this.tabId !== null;
	}

	send(state: state_t): void {
		const now = performance.now();
		if (this.tabId === null || now - this.lastSentAt < UPDATE_INTERVAL_MS) return;

		this.lastSentAt = now;
		this.sendReport(this.createReport(state));
	}

	reset(): void {
		if (this.tabId === null) return;
		this.pressedKeys.clear();
		this.sendReport({ pressed: [] });
	}

	disconnect(notify = true): void {
		const tabId = this.tabId;
		this.tabId = null;
		this.pressedKeys.clear();
		if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
			chrome.tabs.onRemoved.removeListener(this.tabRemovedListener);
		}
		if (tabId !== null) {
			void chrome.tabs.sendMessage(tabId, { type: "DS5_KEYBOARD_DISCONNECT" }).catch(() => {
				// The tab may already have closed or navigated away.
			});
		}
		if (notify) this.statusListener?.("disconnected");
	}

	private createReport(state: state_t): KeyboardReport {
		const pressed: string[] = [];
		for (const entry of KEY_MAP) {
			if (entry.isPressed(state)) pressed.push(entry.code);
		}
		return { pressed };
	}

	private sendReport(report: KeyboardReport): void {
		const tabId = this.tabId;
		if (tabId === null) return;

		const nextPressed = new Set(report.pressed);
		const unchanged =
			nextPressed.size === this.pressedKeys.size &&
			[...nextPressed].every((code) => this.pressedKeys.has(code));
		if (unchanged) return;

		this.pressedKeys = nextPressed;
		void chrome.tabs.sendMessage(tabId, { type: "DS5_KEYBOARD_STATE", report }).catch(() => {
			// A navigation can briefly leave the tab without a receiving content script.
		});
	}
}

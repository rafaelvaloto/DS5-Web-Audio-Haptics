import { KEYBOARD_BINDING_DEFINITIONS, loadKeyboardBindings } from "./keyboard-bindings.ts";
import type { state_t } from "./types.ts";

export type BrowserKeyboardBridgeStatus = "disconnected" | "connecting" | "connected" | "error";

type KeyboardReport = {
	pressed: string[];
	mouse: { dx: number; dy: number };
	mouseButtons: string[];
	mouseButtonValues: Partial<Record<string, number>>;
	wheel: number;
};

const UPDATE_INTERVAL_MS = 10;
const MOUSE_DEADZONE = 0.12;
const MOUSE_SENSITIVITY = 18;
const TRIGGER_PRESS_THRESHOLD = 0.02;
const TRIGGER_RELEASE_THRESHOLD = 0.01;

export class BrowserKeyboardBridge {
	private tabId: number | null = null;
	private lastSentAt = 0;
	private pressedKeys = new Set<string>();
	private triggerPressed = {
		leftTrigger: false,
		rightTrigger: false,
	};
	private statusListener:
		((status: BrowserKeyboardBridgeStatus, detail?: string) => void) | null = null;
	private readonly tabRemovedListener = (removedTabId: number): void => {
		if (removedTabId !== this.tabId) return;
		this.tabId = null;
		this.pressedKeys.clear();
		this.triggerPressed.leftTrigger = false;
		this.triggerPressed.rightTrigger = false;
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
		this.triggerPressed.leftTrigger = false;
		this.triggerPressed.rightTrigger = false;
		this.sendReport({
			pressed: [],
			mouse: { dx: 0, dy: 0 },
			mouseButtons: [],
			mouseButtonValues: {},
			wheel: 0,
		});
	}

	disconnect(notify = true): void {
		const tabId = this.tabId;
		this.tabId = null;
		this.pressedKeys.clear();
		this.triggerPressed.leftTrigger = false;
		this.triggerPressed.rightTrigger = false;
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
		const bindings = loadKeyboardBindings();
		const pressed: string[] = [];
		const mouseButtons: string[] = [];
		const mouseButtonValues: Partial<Record<string, number>> = {};
		let wheel = 0;
		for (const entry of KEYBOARD_BINDING_DEFINITIONS) {
			const code = bindings[entry.action];
			if (!code) continue;
			const isPressed = this.isBindingPressed(entry.action, state, entry.isPressed);
			if (!isPressed) continue;
			if (code === "MouseLeft" || code === "MouseRight" || code === "MouseMiddle") {
				const value = this.getMouseButtonValue(entry.action, state);
				if (value > 0.01) {
					mouseButtons.push(code);
					mouseButtonValues[code] = value;
				}
				continue;
			}
			if (code === "MouseWheelUp") {
				wheel = -1;
				continue;
			}
			if (code === "MouseWheelDown") {
				wheel = 1;
				continue;
			}
			pressed.push(code);
		}
		return {
			pressed,
			mouse: {
				dx: this.normalizeMouseAxis(state.rightAnalogX),
				dy: this.normalizeMouseAxis(state.rightAnalogY),
			},
			mouseButtons,
			mouseButtonValues,
			wheel,
		};
	}

	private normalizeMouseAxis(value: number): number {
		if (Math.abs(value) < MOUSE_DEADZONE) return 0;
		return Math.round(value * MOUSE_SENSITIVITY);
	}

	private isBindingPressed(
		action: string,
		state: state_t,
		fallback: (state: state_t) => boolean
	): boolean {
		if (action === "leftTrigger" || action === "rightTrigger") {
			return this.getTriggerPressedState(action, action === "leftTrigger" ? state.leftTriggerAnalog : state.rightTriggerAnalog);
		}
		return fallback(state);
	}

	private getTriggerPressedState(action: "leftTrigger" | "rightTrigger", value: number): boolean {
		const isPressed = this.triggerPressed[action];
		if (isPressed) {
			this.triggerPressed[action] = value > TRIGGER_RELEASE_THRESHOLD;
		} else {
			this.triggerPressed[action] = value >= TRIGGER_PRESS_THRESHOLD;
		}
		return this.triggerPressed[action];
	}

	private getMouseButtonValue(action: string, state: state_t): number {
		if (action === "leftTrigger") return Math.max(0, Math.min(1, state.leftTriggerAnalog));
		if (action === "rightTrigger") return Math.max(0, Math.min(1, state.rightTriggerAnalog));
		return 1;
	}

	private sendReport(report: KeyboardReport): void {
		const tabId = this.tabId;
		if (tabId === null) return;

		const nextPressed = new Set(report.pressed);
		const unchanged =
			nextPressed.size === this.pressedKeys.size &&
			[...nextPressed].every((code) => this.pressedKeys.has(code)) &&
			report.mouseButtons.length === 0 &&
			report.wheel === 0 &&
			report.mouse.dx === 0 &&
			report.mouse.dy === 0;
		if (unchanged) return;

		this.pressedKeys = nextPressed;
		void chrome.tabs.sendMessage(tabId, { type: "DS5_KEYBOARD_STATE", report }).catch(() => {
			// A navigation can briefly leave the tab without a receiving content script.
		});
	}
}

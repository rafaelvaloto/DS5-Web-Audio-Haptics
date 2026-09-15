import type { state_t } from "./types.ts";

export type BrowserGamepadBridgeStatus = "disconnected" | "connecting" | "connected" | "error";

type BrowserGamepadReport = {
	axes: [number, number, number, number];
	buttons: number[];
};

const UPDATE_INTERVAL_MS = 10;

const clamp = (value: number, minimum: number, maximum: number): number => {
	if (!Number.isFinite(value)) return 0;
	return Math.max(minimum, Math.min(maximum, value));
};

const digital = (pressed: boolean): number => (pressed ? 1 : 0);

export class BrowserGamepadBridge {
	private tabId: number | null = null;
	private lastSentAt = 0;
	private statusListener:
		((status: BrowserGamepadBridgeStatus, detail?: string) => void) | null = null;
	private readonly tabRemovedListener = (removedTabId: number): void => {
		if (removedTabId !== this.tabId) return;
		this.tabId = null;
		this.statusListener?.("disconnected");
	};

	setStatusListener(
		listener: ((status: BrowserGamepadBridgeStatus, detail?: string) => void) | null
	): void {
		this.statusListener = listener;
	}

	async connect(): Promise<void> {
		this.disconnect(false);

		if (typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.tabs) {
			const message = "Browser Gamepad is only available in the installed browser extension.";
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
				const response: unknown = await chrome.tabs.sendMessage(tab.id, { type: "DS5_GAMEPAD_PING" });
				if (response && typeof response === "object" && "type" in response &&
					(response as { type: string }).type === "DS5_GAMEPAD_READY") {
					this.tabId = tab.id;
					this.lastSentAt = 0;
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
		this.sendReport({ axes: [0, 0, 0, 0], buttons: new Array<number>(17).fill(0) });
	}

	disconnect(notify = true): void {
		const tabId = this.tabId;
		this.tabId = null;
		if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
			chrome.tabs.onRemoved.removeListener(this.tabRemovedListener);
		}
		if (tabId !== null) {
			void chrome.tabs.sendMessage(tabId, { type: "DS5_GAMEPAD_DISCONNECT" }).catch(() => {
				// The tab may already have closed or navigated away.
			});
		}
		if (notify) this.statusListener?.("disconnected");
	}

	private createReport(state: state_t): BrowserGamepadReport {
		return {
			axes: [
				clamp(state.leftAnalogX, -1, 1),
				clamp(-state.leftAnalogY, -1, 1),
				clamp(state.rightAnalogX, -1, 1),
				clamp(-state.rightAnalogY, -1, 1),
			],
			buttons: [
				digital(state.bCross),
				digital(state.bCircle),
				digital(state.bSquare),
				digital(state.bTriangle),
				digital(state.bLeftShoulder),
				digital(state.bRightShoulder),
				clamp(state.leftTriggerAnalog, 0, 1),
				clamp(state.rightTriggerAnalog, 0, 1),
				digital(state.bShare),
				digital(state.bStart),
				digital(state.bLeftStick),
				digital(state.bRightStick),
				digital(state.bDpadUp),
				digital(state.bDpadDown),
				digital(state.bDpadLeft),
				digital(state.bDpadRight),
				digital(state.bPSButton),
			],
		};
	}

	private sendReport(report: BrowserGamepadReport): void {
		const tabId = this.tabId;
		if (tabId === null) return;
		void chrome.tabs.sendMessage(tabId, { type: "DS5_GAMEPAD_STATE", report }).catch(() => {
			// A navigation can briefly leave the tab without a receiving content script.
		});
	}
}

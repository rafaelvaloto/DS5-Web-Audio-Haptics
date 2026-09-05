import { state_t } from "./types.ts";

export class DualSenseSocketBridge {
	private socket: WebSocket | null = null;
	private sentCount = 0;
	private url = "ws://localhost:26760";
	private statusListener:
		((status: "disconnected" | "connecting" | "connected" | "error", detail?: string) => void) | null = null;

	setStatusListener(
		listener: ((status: "disconnected" | "connecting" | "connected" | "error", detail?: string) => void) | null
	): void {
		this.statusListener = listener;
	}
	connect(url = this.url): void {
		this.url = url.trim() || "ws://localhost:26760";
		this.disconnect(false);
		if (typeof WebSocket === "undefined") {
			this.statusListener?.("error", "WebSocket is not supported by this browser.");
			return;
		}
		this.statusListener?.("connecting");
		const socket = new WebSocket(this.url);
		this.socket = socket;
		socket.addEventListener("open", () => {
			if (this.socket !== socket) return;
			this.sentCount = 0;
			this.statusListener?.("connected");
			console.info(`[DualSense Socket] Connected to ${this.url}`);
		});
		socket.addEventListener("error", () => {
			if (this.socket === socket) this.statusListener?.("error", `Unable to connect to ${this.url}`);
			console.error(`[DualSense Socket] Connection error: ${this.url}`);
		});
		socket.addEventListener("close", () => {
			if (this.socket !== socket) return;
			this.socket = null;
			this.statusListener?.("disconnected");
			console.info("[DualSense Socket] Disconnected.");
		});
	}
	disconnect(notify = true): void {
		const socket = this.socket;
		this.socket = null;
		if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
		if (notify) this.statusListener?.("disconnected");
	}
	isConnected(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}
	send(state: state_t): void {
		if (!this.isConnected()) return;

		const axisToInt16 = (val: any) => Math.max(-32768, Math.min(32767, Math.round(val * 32767)));
		const triggerToUint8 = (val: any) => Math.max(0, Math.min(255, Math.round(val * 255)));

		if (!this.isConnected()) return;

		const buffer = new ArrayBuffer(12);
		const view = new DataView(buffer);

		// Bitmask (16-bits)
		let buttons = 0;
		if (state.bDpadUp) buttons |= 0x0001;
		if (state.bDpadDown) buttons |= 0x0002;
		if (state.bDpadLeft) buttons |= 0x0004;
		if (state.bDpadRight) buttons |= 0x0008;
		if (state.bStart) buttons |= 0x0010;
		if (state.bShare) buttons |= 0x0020; // BACK
		if (state.bLeftStick) buttons |= 0x0040; // LEFT THUMB
		if (state.bRightStick) buttons |= 0x0080; // RIGHT THUMB
		if (state.bLeftShoulder) buttons |= 0x0100; // LEFT SHOULDER
		if (state.bRightShoulder) buttons |= 0x0200; // RIGHT SHOULDER
		if (state.bPSButton) buttons |= 0x0400; // GUIDE
		if (state.bCross) buttons |= 0x1000; // A
		if (state.bCircle) buttons |= 0x2000; // B
		if (state.bSquare) buttons |= 0x4000; // X
		if (state.bTriangle) buttons |= 0x8000; // Y

		view.setUint16(0, buttons, true);

		view.setUint8(2, triggerToUint8(state.leftTriggerAnalog));
		view.setUint8(3, triggerToUint8(state.rightTriggerAnalog));

		view.setInt16(4, axisToInt16(state.leftAnalogX), true);
		view.setInt16(6, axisToInt16(state.leftAnalogY), true);
		view.setInt16(8, axisToInt16(state.rightAnalogX), true);
		view.setInt16(10, axisToInt16(state.rightAnalogY), true);

		this.socket!.send(buffer);
		this.sentCount++;
	}
	close(): void {
		this.disconnect();
	}
}

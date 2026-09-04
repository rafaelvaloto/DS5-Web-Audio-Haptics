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
		const bool = (value: boolean) => (value ? "1" : "0");
		const number = (value: number) => (Number.isFinite(value) ? value.toFixed(4) : "0");
		const line = [
			`cross=${bool(state.bCross)}`,
			`circle=${bool(state.bCircle)}`,
			`square=${bool(state.bSquare)}`,
			`triangle=${bool(state.bTriangle)}`,
			`up=${bool(state.bDpadUp)}`,
			`down=${bool(state.bDpadDown)}`,
			`left=${bool(state.bDpadLeft)}`,
			`right=${bool(state.bDpadRight)}`,
			`start=${bool(state.bStart)}`,
			`share=${bool(state.bShare)}`,
			`ps=${bool(state.bPSButton)}`,
			`lb=${bool(state.bLeftShoulder)}`,
			`rb=${bool(state.bRightShoulder)}`,
			`ls=${bool(state.bLeftStick)}`,
			`rs=${bool(state.bRightStick)}`,
			`lx=${number(state.leftAnalogX)}`,
			`ly=${number(state.leftAnalogY)}`,
			`rx=${number(state.rightAnalogX)}`,
			`ry=${number(state.rightAnalogY)}`,
			`lt=${number(state.leftTriggerAnalog)}`,
			`rt=${number(state.rightTriggerAnalog)}`,
		].join(" ");
		this.socket!.send(`${line}\n`);
		this.sentCount++;
	}
	close(): void {
		this.disconnect();
	}
}

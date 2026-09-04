export class DualSenseSocketBridge {
    constructor() {
        this.socket = null;
        this.sentCount = 0;
        this.url = "ws://localhost:26760";
        this.statusListener = null;
    }
    setStatusListener(listener) {
        this.statusListener = listener;
    }
    connect(url = this.url) {
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
            if (this.socket !== socket)
                return;
            this.sentCount = 0;
            this.statusListener?.("connected");
            console.info(`[DualSense Socket] Connected to ${this.url}`);
        });
        socket.addEventListener("error", () => {
            if (this.socket === socket)
                this.statusListener?.("error", `Unable to connect to ${this.url}`);
            console.error(`[DualSense Socket] Connection error: ${this.url}`);
        });
        socket.addEventListener("close", () => {
            if (this.socket !== socket)
                return;
            this.socket = null;
            this.statusListener?.("disconnected");
            console.info("[DualSense Socket] Disconnected.");
        });
    }
    disconnect(notify = true) {
        const socket = this.socket;
        this.socket = null;
        if (socket && socket.readyState !== WebSocket.CLOSED)
            socket.close();
        if (notify)
            this.statusListener?.("disconnected");
    }
    isConnected() {
        return this.socket?.readyState === WebSocket.OPEN;
    }
    send(state) {
        if (!this.isConnected())
            return;
        const bool = (value) => (value ? "1" : "0");
        const number = (value) => (Number.isFinite(value) ? value.toFixed(4) : "0");
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
        this.socket.send(`${line}\n`);
        this.sentCount++;
    }
    close() {
        this.disconnect();
    }
}

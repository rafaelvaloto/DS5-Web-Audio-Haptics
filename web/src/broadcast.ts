const pipChannel = new BroadcastChannel("pip_bus");

pipChannel.onmessage = (event) => {
	if (event.data.type === "PIP_CONTROLS_CHANGED") {
		console.log("Comando recebido do PiP:", event.data.payload);
	}
};

export function sendStateToPip(currentState: any) {
	pipChannel.postMessage({ type: "INPUTS_RECEIVE", payload: currentState });
}

const pipChannel = new BroadcastChannel("pip_bus");

pipChannel.onmessage = (event) => {
	if (event.data.type === "INPUTS_RECEIVE") {
		console.log("Estado do controle atualizado:", event.data.payload);
	}
};

export function sendCommandToWindow(commandPayload: any) {
	pipChannel.postMessage({ type: "PIP_CONTROLS_CHANGED", payload: commandPayload });
}

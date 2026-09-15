(() => {
	chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
		if (!message || typeof message !== "object" || !("type" in message)) return;
		const type = (message as { type: string }).type;

		if (type === "DS5_KEYBOARD_PING") {
			sendResponse({ type: "DS5_KEYBOARD_READY" });
			return;
		}

		if (type !== "DS5_KEYBOARD_STATE" && type !== "DS5_KEYBOARD_DISCONNECT") return;
		window.postMessage({ source: "DS5_EXTENSION", ...message }, "*");
	});
})();

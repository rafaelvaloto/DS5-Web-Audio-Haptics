chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
let runtimeWindowId = null;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "open-side-panel") {
		const windowId = sender?.tab?.windowId;
		if (windowId !== undefined) chrome.sidePanel.open({ windowId }).catch((error) => console.error(error));
		return;
	}
	if (message?.type !== "ensure-runtime") return;
	if (runtimeWindowId !== null) {
		chrome.windows.get(runtimeWindowId, () => {
			if (!chrome.runtime.lastError) return;
			runtimeWindowId = null;
		});
	}
	sendResponse?.({ ok: true });
	return true;
});
chrome.windows.onRemoved.addListener((windowId) => {
	if (windowId === runtimeWindowId) runtimeWindowId = null;
});

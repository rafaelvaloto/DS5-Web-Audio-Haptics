const deviceChannel = new BroadcastChannel("dualsense_channel");

(document.getElementById("btn-request-options") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	const devices = await navigator.hid.requestDevice({
		filters: [{ vendorId: 0x054c, productId: 0x0ce6 }],
	});

	localStorage.setItem("dualsense_authorized_devices", JSON.stringify(devices));

	deviceChannel.postMessage({
		type: "DEVICE_AUTHORIZED",
	});
});

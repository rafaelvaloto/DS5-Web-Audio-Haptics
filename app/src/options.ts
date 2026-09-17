import { initTranslations } from "./i18n-init.ts";
import i18n from "./i18n/index.ts";
import { SONY_VENDOR_ID } from "./const.ts";

const deviceChannel = new BroadcastChannel("dualsense_channel");

document.addEventListener("DOMContentLoaded", () => {
	initTranslations();
	updateAuthorizedState();
});

(document.getElementById("btn-request-options") as HTMLButtonElement | null)?.addEventListener("click", async () => {
	const devices = await navigator.hid.requestDevice({
		filters: [
			{ vendorId: SONY_VENDOR_ID, productId: 0x0ce6 },
			{ vendorId: SONY_VENDOR_ID, productId: 0x0df2 },
		],
	});

	localStorage.setItem("dualsense_authorized_devices", JSON.stringify(devices));
	updateAuthorizedState(devices.length > 0 ? "options.authorizedSuccess" : undefined);
	deviceChannel.postMessage({
		type: "DEVICE_AUTHORIZED",
	});
});

function updateAuthorizedState(statusKey?: string): void {
	const status = document.getElementById("status");
	const authorized = document.getElementById("authorized");
	const wasmStatus = document.getElementById("wasm-status");
	const devices = JSON.parse(localStorage.getItem("dualsense_authorized_devices") || "[]") as Array<{ productName?: string }>;

	if (wasmStatus) wasmStatus.dataset.i18n = "options.ready";
	if (status) {
		if (statusKey) {
			status.dataset.i18n = statusKey;
			status.textContent = i18n.t(statusKey);
		} else {
			status.textContent = "";
			status.removeAttribute("data-i18n");
		}
	}
	if (!authorized) return;

	if (devices.length > 0) {
		authorized.removeAttribute("data-i18n");
		authorized.textContent = devices.map((device) => device.productName || "DualSense").join(", ");
	} else {
		authorized.dataset.i18n = "options.none";
		authorized.textContent = i18n.t("options.none");
	}
}

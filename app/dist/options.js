import { SONY_VENDOR_ID } from "./const.js";
const deviceChannel = new BroadcastChannel("dualsense_channel");
document.getElementById("btn-request-options")?.addEventListener("click", async (e) => {
    const devices = await navigator.hid.requestDevice({
        filters: [
            { vendorId: SONY_VENDOR_ID, productId: 0x0ce6 },
            { vendorId: SONY_VENDOR_ID, productId: 0x0df2 },
        ],
    });
    localStorage.setItem("dualsense_authorized_devices", JSON.stringify(devices));
    deviceChannel.postMessage({
        type: "DEVICE_AUTHORIZED",
    });
    window.close();
});

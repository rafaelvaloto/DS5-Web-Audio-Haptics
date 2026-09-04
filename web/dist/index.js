import { GamepadClientApplication } from "./main.js";
import { bootWasmAndPlatform } from "./load.js";
import { logLines, TRIGGERS } from "./const.js";
import { debounce, hexToRgb } from "./helpers.js";
// app engine instance
let app = null;
document.getElementById("btn-load")?.addEventListener("click", async (e) => {
    if (app) {
        // skip if already loaded
        return;
    }
    try {
        const wasmContext = await bootWasmAndPlatform("src/lib");
        app = GamepadClientApplication.createFromContext(wasmContext, 1);
        if (app) {
            e.target.disabled = true;
            document.getElementById("btn-request").disabled = false;
            console.log("WASM loaded successfully.");
        }
    }
    catch (err) {
        console.error("Failed to load the app:", err);
    }
});
document.getElementById("btn-show-logs")?.addEventListener("click", async (e) => {
    const logContainer = document.getElementById("log-dialog");
    if (logContainer) {
        logContainer.style.display = logContainer.style.display !== "block" ? "block" : "none";
    }
});
document.getElementById("btn-close-logs")?.addEventListener("click", async (e) => {
    const logContainer = document.getElementById("log-dialog");
    if (logContainer) {
        logContainer.style.display = "none";
    }
});
document.getElementById("btn-clear-logs")?.addEventListener("click", async (e) => {
    logLines.length = 0;
    document.getElementById("log-box").textContent = "";
});
document.getElementById("btn-request")?.addEventListener("click", async (e) => {
    if (!app) {
        console.warn("Você precisa carregar o WASM primeiro (clique em Load).");
        return;
    }
    try {
        // Open the pop-up of the browser, wait for the choice, save it in the cache and INJECT it into C++
        const authorizedDeviceNames = await app.requestDeviceAccess();
        if (authorizedDeviceNames.length === 0) {
            console.log("No devices were selected.");
            return;
        }
        console.log(`Success! Connected controllers: ${authorizedDeviceNames.join(", ")}`);
        const lblDevice = document.getElementById("lbl-device");
        if (lblDevice) {
            lblDevice.textContent = authorizedDeviceNames.join(", ");
        }
        e.target.disabled = true;
        document.getElementById("btn-start").disabled = false;
    }
    catch (err) {
        // Falls here if the WebHID blocks the pop-up (e.g., lack of user interaction)
        // or if the browser does not support it.
        console.error("Failed to request device access:", err);
    }
});
document.getElementById("btn-start")?.addEventListener("click", (e) => {
    if (!app) {
        console.warn("WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    app.run();
    console.log("🚀 Loop rodando!");
    e.target.disabled = true;
    document.getElementById("btn-stop").disabled = false;
});
document.getElementById("btn-stop")?.addEventListener("click", (e) => {
    if (app) {
        app.stop();
    }
    e.target.disabled = true;
    document.getElementById("btn-start").disabled = false;
});
document.getElementById("btn-stop")?.addEventListener("click", (e) => {
    if (app) {
        app.stop();
    }
    e.target.disabled = true;
    document.getElementById("btn-start").disabled = false;
});
document.getElementById("btn-reset-trigger")?.addEventListener("click", (e) => {
    document.getElementById("sel-trigger-effect").value = "none";
    if (!app) {
        console.warn("WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    app?.devices.forEach((descriptor, deviceId) => {
        app?.api?.reset(deviceId, 0);
        app?.api?.reset(deviceId, 1);
        app?.api?.output(deviceId);
        console.log(`Trigger reset applied to the controller ${deviceId}.`);
    });
});
document.getElementById("btn-apply-trigger")?.addEventListener("click", (e) => {
    let pattern = document.getElementById("sel-trigger-effect").value;
    let hand = Number(document.getElementById("sel-trigger-hand").value);
    if (!app) {
        console.warn("WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    const arr = TRIGGERS[pattern] || new Uint8Array(0);
    const bytesLength = arr.length;
    const bufferPtr = app.module?._malloc(bytesLength);
    if (bufferPtr) {
        try {
            app.module?.HEAPU8.set(arr, bufferPtr);
            app?.devices.forEach((descriptor, deviceId) => {
                app?.api?.triggers(deviceId, bufferPtr, arr.length, hand);
                app?.api?.output(deviceId);
                console.log(`Trigger pattern applied to the controller ${deviceId}.`);
            });
        }
        finally {
            app.module?._free(bufferPtr);
        }
    }
});
let lastColor = document.getElementById("picker-led-color").value;
document.getElementById("picker-led-color")?.addEventListener("input", debounce((event) => {
    if (!app) {
        console.warn("WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    const target = event.target;
    const hexColor = target.value;
    if (hexColor === lastColor) {
        return;
    }
    const rgb = hexToRgb(hexColor);
    app?.devices.forEach((descriptor, deviceId) => {
        app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
        app?.api?.output(deviceId);
        console.log(`Lightbar color applied to device ${deviceId}: ${hexColor}`);
    });
}, 1000));
Array.from(document.getElementsByClassName("color-preset-btn")).forEach((btn) => {
    btn.addEventListener("click", (e) => {
        try {
            app?.devices.forEach((descriptor, deviceId) => {
                if (btn.dataset.color) {
                    const rgb = hexToRgb(btn.dataset.color);
                    app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
                    app?.api?.output(deviceId);
                    console.log(`Lightbar pattern applied to device ${deviceId}.`);
                }
            });
        }
        catch (err) {
            console.error("Failed to apply lightbar pattern:", err);
        }
    });
});
function updateAudioSettings() {
    if (!app) {
        console.warn("WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    const volume = Number(document.getElementById("input-audio-volume")?.value);
    const gain = Number(document.getElementById("input-audio-gain")?.value);
    const bHeadSetOnly = Number(document.getElementById("switch-speaker")?.checked);
    const bIsAudioOnly = Number(document.getElementById("switch-audio-haptics")?.checked);
    for (const [deviceId, descriptor] of app.devices) {
        app?.audioSettings(deviceId, 0, // enable haptics
        1, Number(!bHeadSetOnly), 0, // trigger reduce
        0x7c, // audio volume
        !bIsAudioOnly ? 0xfc : 0xff, // audio gain
        0, // audio device
        0, Number(gain), Number(volume) // reserved
        ).catch((err) => {
            console.error(`Failed to apply audio settings for device ${deviceId}:`, err);
        });
    }
}
document.getElementById("btn-pip")?.addEventListener("click", async (e) => {
    try {
        if (!app) {
            console.warn("WASM não carregado.");
            return;
        }
        if (app.devices.size === 0) {
            console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
            return;
        }
        const result = await app.toggleHaptics();
        if (result) {
            console.log("Haptics enabled.");
            updateAudioSettings();
        }
    }
    catch (error) {
        console.error("Screen permission denied or error:", error);
    }
});
document.getElementById("input-audio-gain")?.addEventListener("input", debounce((event) => {
    const gainValueDisplay = document.getElementById("input-audio-gain-value");
    if (gainValueDisplay) {
        gainValueDisplay.textContent = Number(event.target.value).toFixed(1);
    }
    updateAudioSettings();
}, 400));
document.getElementById("input-audio-volume")?.addEventListener("input", debounce((event) => {
    const volumeValueDisplay = document.getElementById("input-audio-volume-value");
    if (volumeValueDisplay) {
        volumeValueDisplay.textContent = event.target.value;
    }
    updateAudioSettings();
}, 400));
document.getElementById("switch-audio-haptics")?.addEventListener("change", (e) => {
    updateAudioSettings();
});
document.getElementById("switch-speaker")?.addEventListener("change", (e) => {
    updateAudioSettings();
});

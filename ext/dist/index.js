import { initTranslations } from "./i18n-init.js";
import { GamepadClientApplication } from "./main.js";
import { bootWasmAndPlatform } from "./load.js";
import { debounce, hexToRgb } from "./helpers.js";
import { AudioHapticsManager } from "./stream.js";
import { Logger } from "./logs.js";
document.addEventListener("DOMContentLoaded", () => {
    initTranslations();
});
const deviceChannel = new BroadcastChannel("dualsense_channel");
let app = null;
const uiLogger = new Logger("log-box", 100);
const unsubscribeLogs = GamepadClientApplication.onLog((message, level) => {
    uiLogger.log(message);
});
function loadProfilesIntoSelect() {
    let selTriggerProfile = document.getElementById("sel-trigger-effect-profile");
    selTriggerProfile.innerHTML = ""; // Clear existing options
    selTriggerProfile.add(new Option("None", "None"));
    let profiles = JSON.parse(localStorage.getItem("dualsense_profiles") || "null");
    profiles?.forEach((profile) => {
        selTriggerProfile.add(new Option(profile.gameName, profile.gameName));
    });
}
loadProfilesIntoSelect();
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
            deviceChannel.onmessage = async (event) => {
                if (event.data.type === "REMOTE_LOG") {
                    GamepadClientApplication.emitLog(`[Painel de Gatilhos] ${event.data.message}`);
                }
                if (event.data.type === "LOAD_PROFILES") {
                    loadProfilesIntoSelect();
                }
                if (event.data.type === "DEVICE_APPLY_TRIGGER") {
                    const selTriggerEffectProfile = document.getElementById("sel-trigger-effect-profile");
                    let profiles = JSON.parse(localStorage.getItem("dualsense_profiles") || "null");
                    profiles.forEach((profile) => {
                        if (profile.gameName === selTriggerEffectProfile.value) {
                            let num = event.data.message || 0;
                            let trigger = profile.triggers[num] || null;
                            if (!trigger) {
                                app?.api?.reset(event.data.deviceId, 0);
                                app?.api?.reset(event.data.deviceId, 1);
                                app?.api?.output(event.data.deviceId);
                                GamepadClientApplication.emitLog(`Trigger reset applied to the controller ${event.data.deviceId}.`);
                                document.getElementById("trigger-selected-out").innerText = "";
                                document.getElementById("dot-trigger").className = "dot danger";
                                return;
                            }
                            let handText = Number(trigger.hand) === 0
                                ? "Left (L2)"
                                : Number(trigger.hand) === 1
                                    ? "Right (R2)"
                                    : "Both (L2 + R2)";
                            document.getElementById("trigger-selected-out").innerText =
                                trigger.name + " " + handText;
                            const effectString = trigger.type + " " + trigger.hex || "";
                            const effectValues = effectString
                                .trim()
                                .split(/\s+/)
                                .map((hex) => parseInt(hex, 16))
                                .filter((n) => !isNaN(n));
                            const hand = Number(trigger.hand || 0);
                            const arr = new Uint8Array(effectValues);
                            const t_bufferPtr = app?.module?._malloc(arr.length);
                            if (t_bufferPtr) {
                                try {
                                    app?.module?.HEAPU8.set(arr, t_bufferPtr);
                                    app?.api?.triggers(event.data.deviceId, t_bufferPtr, arr.length, hand);
                                    app?.api?.output(event.data.deviceId);
                                    GamepadClientApplication.emitLog(`Trigger pattern applied to the controller ${event.data.deviceId}.`);
                                    document.getElementById("dot-trigger").className =
                                        "dot active";
                                }
                                finally {
                                    app?.module?._free(t_bufferPtr);
                                }
                            }
                        }
                    });
                }
                if (event.data.type === "DEVICE_APPLY_TRIGGER_TEST") {
                    app?.devices.forEach((descriptor, deviceId) => {
                        let trigger = JSON.parse(localStorage.getItem("trigger_test") || "null");
                        if (!trigger) {
                            return;
                        }
                        const effectString = trigger.effect || "";
                        const effectValues = effectString
                            .trim()
                            .split(/\s+/)
                            .map((hex) => parseInt(hex, 16))
                            .filter((n) => !isNaN(n));
                        const hand = Number(trigger.hand || 0);
                        const arr = new Uint8Array(effectValues);
                        const t_bufferPtr = app?.module?._malloc(arr.length);
                        if (t_bufferPtr) {
                            try {
                                app?.module?.HEAPU8.set(arr, t_bufferPtr);
                                app?.api?.triggers(deviceId, t_bufferPtr, arr.length, hand);
                                app?.api?.output(deviceId);
                                GamepadClientApplication.emitLog(`Trigger pattern applied to the controller ${deviceId}.`);
                            }
                            finally {
                                app?.module?._free(t_bufferPtr);
                            }
                        }
                    });
                }
                if (event.data.type === "DEVICE_AUTHORIZED") {
                    app?.devices.clear();
                    try {
                        const devices = await navigator.hid.getDevices();
                        if (devices.length > 0) {
                            devices.forEach((d) => {
                                app?.createDeviceFromDescriptor(d, app.nextManualHandle++, 1, 1, true, d.productName);
                            });
                            const btnRequest = document.getElementById("btn-request");
                            const btnStart = document.getElementById("btn-start");
                            if (btnRequest)
                                btnRequest.disabled = true;
                            if (btnStart)
                                btnStart.disabled = false;
                        }
                    }
                    catch (err) {
                        GamepadClientApplication.emitLog(`[Erro] Failed to get authorized devices: ${err}`);
                    }
                }
            };
        }
    }
    catch (err) {
        GamepadClientApplication.emitLog(`[Erro] Failed to load the app: ${err}`);
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
    uiLogger.clear();
});
document.getElementById("create-trigger")?.addEventListener("click", async (e) => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.tabs) {
        const url = chrome.runtime.getURL("triggers.html");
        await chrome.tabs.create({ url });
        return;
    }
    const url = "triggers.html";
    window.open(url, "_blank");
});
document.getElementById("btn-request")?.addEventListener("click", async (e) => {
    if (!app) {
        GamepadClientApplication.emitLog("[Aviso] Você precisa carregar o WASM primeiro (clique em Load).");
        return;
    }
    if (chrome.runtime?.openOptionsPage) {
        await chrome.runtime.openOptionsPage();
        return;
    }
    try {
        const authorizedDeviceNames = await app.requestDeviceAccess();
        if (authorizedDeviceNames.length === 0) {
            GamepadClientApplication.emitLog("No devices were selected.");
            return;
        }
        GamepadClientApplication.emitLog(`Success! Connected controllers: ${authorizedDeviceNames.join(", ")}`);
        const lblDevice = document.getElementById("lbl-device");
        if (lblDevice) {
            lblDevice.textContent = authorizedDeviceNames.join(", ");
        }
        e.target.disabled = true;
        document.getElementById("btn-start").disabled = false;
    }
    catch (err) {
        GamepadClientApplication.emitLog(`[Erro] Failed to request device access: ${err}`);
    }
});
document.getElementById("btn-start")?.addEventListener("click", (e) => {
    if (!app) {
        GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    app.run();
    GamepadClientApplication.emitLog("🚀 Loop rodando!");
    e.target.disabled = true;
    document.getElementById("btn-stop").disabled = false;
    setTimeout(() => {
        const battery = document.getElementById(`lbl-battery`);
        app?.devices.forEach((descriptor, deviceId) => {
            battery.className = `${app?.api?.battery(deviceId)}`;
            battery.textContent = `${app?.api?.battery(deviceId)}%`;
        });
    }, 10000);
});
document.getElementById("btn-stop")?.addEventListener("click", (e) => {
    if (app) {
        app.stop();
    }
    e.target.disabled = true;
    document.getElementById("btn-start").disabled = false;
});
document.getElementById("btn-reset-trigger")?.addEventListener("click", (e) => {
    document.getElementById("sel-trigger-effect-profile").value = "none";
    if (!app) {
        GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    app?.devices.forEach((descriptor, deviceId) => {
        app?.api?.reset(deviceId, 0);
        app?.api?.reset(deviceId, 1);
        app?.api?.output(deviceId);
        GamepadClientApplication.emitLog(`Trigger reset applied to the controller ${deviceId}.`);
    });
});
let lastColor = document.getElementById("picker-led-color")?.value || "#ffffff";
document.getElementById("picker-led-color")?.addEventListener("input", debounce((event) => {
    if (!app) {
        GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
        return;
    }
    const target = event.target;
    const hexColor = target.value;
    if (hexColor === lastColor) {
        return;
    }
    const rgb = hexToRgb(hexColor);
    app?.devices.forEach((descriptor, deviceId) => {
        AudioHapticsManager.lastLightbarColor = { r: rgb.r, g: rgb.g, b: rgb.b };
        app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
        app?.api?.output(deviceId);
        GamepadClientApplication.emitLog(`Lightbar color applied to device ${deviceId}: ${hexColor}`);
    });
}, 400));
Array.from(document.getElementsByClassName("color-preset-btn")).forEach((btn) => {
    btn.addEventListener("click", (e) => {
        try {
            app?.devices.forEach((descriptor, deviceId) => {
                if (btn.dataset.color) {
                    const rgb = hexToRgb(btn.dataset.color);
                    AudioHapticsManager.lastLightbarColor = { r: rgb.r, g: rgb.g, b: rgb.b };
                    app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
                    app?.api?.output(deviceId);
                    GamepadClientApplication.emitLog(`Lightbar pattern applied to device ${deviceId}.`);
                }
            });
        }
        catch (err) {
            GamepadClientApplication.emitLog(`[Erro] Failed to apply lightbar pattern: ${err}`);
        }
    });
});
function updateAudioSettings() {
    if (!app) {
        GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
        return;
    }
    if (app.devices.size === 0) {
        GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
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
            GamepadClientApplication.emitLog(`[Erro] Failed to apply audio settings for device ${deviceId}: ${err}`);
        });
    }
}
document.getElementById("btn-pip")?.addEventListener("click", async (e) => {
    try {
        if (!app) {
            GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
            return;
        }
        if (app.devices.size === 0) {
            GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
            return;
        }
        const result = await app.toggleHaptics();
        if (result) {
            GamepadClientApplication.emitLog("Haptics enabled.");
            e.target.textContent = "🪟 Stop Picture-in-Picture";
            e.target.className = "btn btn-danger";
            Array.from(document.getElementsByClassName("shared-card-overlay")).forEach((el) => {
                el.style.opacity = "100";
            });
            document.getElementById("dot-audio-haptics").className = "dot active";
            updateAudioSettings();
        }
        else {
            e.target.textContent = "🪟 Start Picture-in-Picture";
            e.target.className = "btn btn-primary";
            document.getElementById("dot-audio-haptics").className = "dot";
            GamepadClientApplication.emitLog("Haptics disabled.");
        }
    }
    catch (error) {
        GamepadClientApplication.emitLog(`[Erro] Screen permission denied or error: ${error}`);
    }
});
document.getElementById("input-audio-gain")?.addEventListener("input", debounce((event) => {
    const gainValueDisplay = document.getElementById("input-audio-gain-value");
    if (gainValueDisplay) {
        gainValueDisplay.textContent = Number(event.target.value).toFixed(1);
    }
    updateAudioSettings();
}, 200));
document.getElementById("input-audio-volume")?.addEventListener("input", debounce((event) => {
    const volumeValueDisplay = document.getElementById("input-audio-volume-value");
    if (volumeValueDisplay) {
        volumeValueDisplay.textContent = event.target.value;
    }
    updateAudioSettings();
}, 100));
document.getElementById("switch-audio-haptics")?.addEventListener("change", (e) => {
    updateAudioSettings();
});
document.getElementById("switch-speaker")?.addEventListener("change", (e) => {
    updateAudioSettings();
});
document.getElementById("btn-ws-connect")?.addEventListener("click", (e) => {
    try {
        if (!app) {
            GamepadClientApplication.emitLog("[Aviso] WASM não carregado.");
            return;
        }
        if (app.devices.size === 0) {
            GamepadClientApplication.emitLog("[Aviso] Nenhum controle conectado. Faça o Request Device primeiro.");
            return;
        }
        e.target.textContent = !app?.wsIsConnect() ? "Connecting..." : "Disconnecting...";
        e.target.disabled = true;
        app.wsToggle();
        setTimeout(() => {
            if (app?.wsIsConnect()) {
                GamepadClientApplication.emitLog("WebSocket is connected.");
                e.target.textContent = "Disconnect";
                e.target.className = "btn btn-danger";
                document.getElementById("lbl-ws-status").textContent = "Connected";
                e.target.disabled = false;
            }
            else {
                GamepadClientApplication.emitLog("WebSocket connection failed.");
                e.target.textContent = "Connect";
                e.target.className = "btn btn-primary";
                document.getElementById("lbl-ws-status").textContent = "Disconnected";
                e.target.disabled = false;
            }
        }, 1500);
    }
    catch (error) {
        GamepadClientApplication.emitLog(`[Erro] Screen permission denied or error: ${error}`);
    }
});

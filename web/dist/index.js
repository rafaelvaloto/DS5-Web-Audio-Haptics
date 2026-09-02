import { GamepadClientApplication } from "./main.js";
import { bootWasmAndPlatform } from "./load.js";
// app engine instance
let app = null;
document.getElementById("btn-load")?.addEventListener("click", async (e) => {
    if (app) {
        // skip if already loaded
        return;
    }
    try {
        const wasmContext = await bootWasmAndPlatform("src/lib");
        app = GamepadClientApplication.createFromContext(wasmContext, 0);
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

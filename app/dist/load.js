import { initializeWebHidPlatformBridge } from "./platform/web_hid_platform.js";
async function loadGamepadCoreHostFactory(libraryPath) {
    const globalScope = globalThis;
    if (typeof globalScope.InitGamepadCoreHost === "function") {
        return globalScope.InitGamepadCoreHost;
    }
    if (typeof document === "undefined") {
        throw new Error("No DOM available to load the runtime script.");
    }
    const scriptUrl = `${libraryPath}/GamepadCoreHost.js`;
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}.`));
        document.head.appendChild(script);
    });
    if (typeof globalScope.InitGamepadCoreHost !== "function") {
        throw new Error("GamepadCoreHost.js load failed.");
    }
    return globalScope.InitGamepadCoreHost;
}
/**
 * Load the Wasm binary and connect the native hardware bridge (Platform Bridge).
 */
export async function bootWasmAndPlatform(libraryPath, onStdout, onStderr) {
    const factory = await loadGamepadCoreHostFactory(libraryPath);
    const module = (await factory({
        locateFile: (path) => `${libraryPath}/${path}`,
        print: onStdout,
        printErr: onStderr,
    }));
    const platform = await initializeWebHidPlatformBridge(module);
    return { module, platform };
}

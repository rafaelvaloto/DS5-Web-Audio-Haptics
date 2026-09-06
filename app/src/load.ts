
import {NativeModule} from "./lib/GamepadCoreHost";
import {
    initializeWebHidPlatformBridge,
    type PlatformBridgeRegistration
} from "./platform/web_hid_platform.ts";

type GamepadCoreHostFactory = (moduleArg?: Record<string, unknown>) => Promise<NativeModule>;

export interface WasmContext {
    module: NativeModule;
    platform: PlatformBridgeRegistration;
}

async function loadGamepadCoreHostFactory(libraryPath: string): Promise<GamepadCoreHostFactory> {
    const globalScope = globalThis as { InitGamepadCoreHost?: unknown };
    if (typeof globalScope.InitGamepadCoreHost === "function") {
        return globalScope.InitGamepadCoreHost as GamepadCoreHostFactory;
    }

    if (typeof document === "undefined") {
        throw new Error("No DOM available to load the runtime script.");
    }

    const scriptUrl = `${libraryPath}/GamepadCoreHost.js`;
    await new Promise<void>((resolve, reject) => {
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
    return globalScope.InitGamepadCoreHost as GamepadCoreHostFactory;
}

/**
 * Load the Wasm binary and connect the native hardware bridge (Platform Bridge).
 */
export async function bootWasmAndPlatform(
    libraryPath: string,
    onStdout?: (text: string) => void,
    onStderr?: (text: string) => void
): Promise<WasmContext> {
    const factory = await loadGamepadCoreHostFactory(libraryPath);

    const module = (await factory({
        locateFile: (path: string) => `${libraryPath}/${path}`,
        print: onStdout,
        printErr: onStderr,
    })) as NativeModule;

    const platform = await initializeWebHidPlatformBridge(module);

    return { module, platform };
}

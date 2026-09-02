import {NativeModule} from "../lib/GamepadCoreHost";

export type AllocEngineDeviceCallback = () => number;
export type DispatchNewGamepadCallback = (deviceId: number) => void;
export type DisconnectDeviceCallback = (deviceId: number) => void;

export interface DeviceRegistryPolicyCallbacks {
    alloc: AllocEngineDeviceCallback;
    dispatch: DispatchNewGamepadCallback;
    disconnect: DisconnectDeviceCallback;
}

export interface DeviceRegistryPolicy {
    dispose(): void;
}

type DeviceRegistrySignature = {
    alloc: string;
    dispatch: string;
    disconnect: string;
};

const REGISTRY_SIGNATURES: DeviceRegistrySignature = {
    alloc: "i",// Int32
    dispatch: "vi",// Void, Int32 (deviceId)
    disconnect: "vi",// Void, Int32 (deviceId)
};

export function initializeDeviceRegistryPolicy(
    module: NativeModule,
    typeId: number,
    callbacks: DeviceRegistryPolicyCallbacks,
    signatures: Partial<DeviceRegistrySignature> = {}
): DeviceRegistryPolicy {

    if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
        throw new Error("Module sem addFunction/removeFunction.");
    }

    const resolved = { ...REGISTRY_SIGNATURES, ...signatures };

    // Create WebAssembly pointers with explicit TypeScript typing for the parameters
    const allocPtr = module.addFunction((): number => {
        return callbacks.alloc();
    }, resolved.alloc);

    const dispatchPtr = module.addFunction((deviceId: number): void => {
        callbacks.dispatch(deviceId);
    }, resolved.dispatch);

    const disconnectPtr = module.addFunction((deviceId: number): void => {
        callbacks.disconnect(deviceId);
    }, resolved.disconnect);

    // Function binding C++ (Note GCH_InitializeDeviceRegistryPolicyWasm)
    const initializePolicy = module.cwrap("GCH_InitializeDeviceRegistryPolicyWasm", null, [
        "number", // int TypeId
        "number", // uintptr_t AllocCallbackPtr
        "number", // uintptr_t DispatchCallbackPtr
        "number", // uintptr_t DisconnectCallbackPtr
    ]);

    initializePolicy(typeId, allocPtr, dispatchPtr, disconnectPtr);

    return {
        dispose: () => {
            module.removeFunction(allocPtr);
            module.removeFunction(dispatchPtr);
            module.removeFunction(disconnectPtr);
        },
    };
}

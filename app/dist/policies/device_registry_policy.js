const REGISTRY_SIGNATURES = {
    alloc: "i", // Int32
    dispatch: "vi", // Void, Int32 (deviceId)
    disconnect: "vi", // Void, Int32 (deviceId)
};
export function initializeDeviceRegistryPolicy(module, typeId, callbacks, signatures = {}) {
    if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
        throw new Error("Module sem addFunction/removeFunction.");
    }
    const resolved = { ...REGISTRY_SIGNATURES, ...signatures };
    // Create WebAssembly pointers with explicit TypeScript typing for the parameters
    const allocPtr = module.addFunction(() => {
        return callbacks.alloc();
    }, resolved.alloc);
    const dispatchPtr = module.addFunction((deviceId) => {
        callbacks.dispatch(deviceId);
    }, resolved.dispatch);
    const disconnectPtr = module.addFunction((deviceId) => {
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

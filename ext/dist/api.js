export function bindingAPI(module) {
    const cwrap = module.cwrap.bind(module);
    const maybe = (name, returnType, args) => {
        try {
            return cwrap(name, returnType, args);
        }
        catch {
            return () => console.warn(`[API] Função C++ não encontrada: ${name}`);
        }
    };
    return {
        logs: maybe("GCH_SetLogCallback", null, ["number"]),
        shutdown: maybe("GCH_Shutdown", null, []),
        state: maybe("GCH_GetInputState", null, ["number", "number"]),
        create: maybe("GCH_CreateDevice", null, ["number"]),
        update: maybe("GCH_UpdateInput", null, ["number", "number"]),
        output: maybe("GCH_UpdateOutput", null, ["number"]),
        battery: maybe("GCH_BatteryLevelDevice", "number", ["number"]),
        reset: maybe("GCH_StopTrigger", null, ["number", "number"]),
        lightbar: maybe("GCH_Lightbar", null, ["number", "number", "number", "number"]),
        triggers: maybe("GCH_CustomTrigger", "number", ["number", "number", "number", "number"]),
        settings: maybe("GCH_DualSenseSettings", null, [
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
        ]),
        audioInit: maybe("GCH_InitializeAudio", null, ["number", "number"]),
        audioProcess: maybe("GCH_ProcessAudioHaptics", "number", ["number"]),
        audioSubmitSamples: maybe("GCH_AudioSubmitSamples", "number", ["number", "number", "number", "number"]),
    };
}

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export * from "./platform/web_hid_platform.js";
export * from "./i18n/index.js";
export function startGamepadClientLoop() {
    return __awaiter(this, arguments, void 0, function* (typeId = 0) {
        const main = yield import("./main.js");
        return main.startGamepadClientLoop(typeId);
    });
}
startGamepadClientLoop(0).catch((err) => {
    console.error("Error starting gamepad client loop:", err);
});

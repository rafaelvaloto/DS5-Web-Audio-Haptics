export * from "./platform/web_hid_platform.ts";
export * from "./i18n/index.ts";

export type { AudioHapticsSettings, GamepadClientApplication } from "./main.ts";

export async function startGamepadClientLoop(typeId = 0) {
  const main = await import("./main.ts");
  return main.startGamepadClientLoop(typeId);
}

startGamepadClientLoop(0).catch((err) => {
  console.error("Error starting gamepad client loop:", err);
});

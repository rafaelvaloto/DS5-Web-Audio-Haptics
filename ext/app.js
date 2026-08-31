import { GamepadClientApplication } from "./dist/main.js";
import { uiTranslations } from "./dist/i18n/ui-translations.js";

const isRuntimeWindow = new URLSearchParams(location.search).has("runtime");
const isWebPage =
  typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id;
const runtimeChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("dualsense_runtime")
    : null;
let runtimeHasController = false;
let runtimeLoopRunning = false;
runtimeChannel?.addEventListener("message", (event) => {
  const message = event.data || {};
  if (!isRuntimeWindow && message.type === "state") {
    runtimeHasController = Boolean(message.hasController);
    runtimeLoopRunning = Boolean(message.loopRunning);
    btnStart &&
      (btnStart.disabled = !message.hasController || message.loopRunning);
    btnStop &&
      (btnStop.disabled = !message.hasController || !message.loopRunning);
    isAudioHapticsEnabled = Boolean(message.audioEnabled);
    audioVolume = Number(message.audioVolume ?? audioVolume);
    audioGain = Number(message.audioGain ?? audioGain);
    syncPipControls();
    return;
  }
  if (!isRuntimeWindow) return;
  if (message.type === "play") btnStart?.click();
  if (message.type === "stop") btnStop?.click();
  if (message.type === "audio") toggleAudioHapticsFromPip();
});

const translations = uiTranslations;

function detectBrowserLocale() {
  const browserLocales =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language || "en"];

  for (const browserLocale of browserLocales) {
    const normalized = browserLocale.toLowerCase();
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

const savedLocale = localStorage.getItem("dualsense_i18n_lang");
let currentLocale =
  savedLocale && translations[savedLocale] ? savedLocale : "en";
if (!translations[currentLocale]) currentLocale = "en";

function t(keyPath, params, locale = currentLocale) {
  const dict = translations[locale] || translations.en;
  const keys = keyPath.split(".");
  let current = dict;
  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = current[k];
    } else {
      current = undefined;
      break;
    }
  }
  if (current === undefined && locale !== "en") {
    let fallback = translations.en;
    for (const k of keys) {
      if (fallback && typeof fallback === "object" && k in fallback) {
        fallback = fallback[k];
      } else {
        fallback = undefined;
        break;
      }
    }
    current = fallback;
  }
  if (typeof current !== "string") return keyPath;
  if (params) {
    return current.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, varName) => {
      return varName in params ? String(params[varName]) : `{{${varName}}}`;
    });
  }
  return current;
}

function applyTranslations(locale = currentLocale) {
  currentLocale = locale;
  document.documentElement.lang = locale;
  localStorage.setItem("dualsense_i18n_lang", locale);
  if (langSelect) langSelect.value = locale;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  lblWasm.textContent = hostModule ? t("status.ready") : t("status.notLoaded");
  lblDevice.textContent =
    deviceIds.size > 0
      ? cachedDevices[0]?.productName || t("status.connected")
      : t("status.none");
  lblTouch.textContent = isTouchActive
    ? t("status.active")
    : t("status.inactive");
  if (lblAudioHaptics)
    lblAudioHaptics.textContent = isAudioHapticsEnabled
      ? t("status.active")
      : t("status.inactive");
  lblTouchStatus.textContent = `${t("touchpad.fingers")}: ${lastFingerCount}`;
  touchHint.textContent = t("touchpad.touchingHint");
}

// ==========================================
// SELEÇÃO DE ELEMENTOS DA UI
// ==========================================
const langSelect = document.getElementById("lang-select");
const logBox = document.getElementById("log-box");
const btnLoad = document.getElementById("btn-load");
const btnRequest = document.getElementById("btn-request");
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnPip = document.getElementById("btn-pip");
const btnAudioHaptics = document.getElementById("btn-audio-haptics");
const inputAudioVolume = document.getElementById("input-audio-volume");
const inputAudioGain = document.getElementById("input-audio-gain");
const inputAudioVolumeValue = document.getElementById(
  "input-audio-volume-value",
);
const inputAudioGainValue = document.getElementById("input-audio-gain-value");
const btnClearLogs = document.getElementById("btn-clear-logs");
const btnShowLogs = document.getElementById("btn-show-logs");
const logModal = document.getElementById("log-modal");
const logModalContent = document.getElementById("log-modal-content");
const btnCloseLogModal = document.getElementById("btn-close-log-modal");
const btnClearModalLog = document.getElementById("btn-clear-modal-log");
const inputServerUrl = document.getElementById("input-server-url");
const btnInputServer = document.getElementById("btn-input-server");
const inputServerStatus = document.getElementById("input-server-status");
const inPagePip = document.getElementById("in-page-pip");

// Status Badges
const dotWasm = document.getElementById("dot-wasm");
const lblWasm = document.getElementById("lbl-wasm");
const dotHid = document.getElementById("dot-hid");
const lblDevice = document.getElementById("lbl-device");
const dotTouch = document.getElementById("dot-touch");
const lblTouch = document.getElementById("lbl-touch");
const dotAudioHaptics = document.getElementById("dot-audio-haptics");
const lblAudioHaptics = document.getElementById("lbl-audio-haptics");
const lblBattery = document.getElementById("lbl-battery");

// Analogs & Triggers
const lblL1 = document.getElementById("lbl-l1");
const lblL2 = document.getElementById("lbl-l2");
const barL2 = document.getElementById("bar-l2");
const lblL2Th = document.getElementById("lbl-l2-th");
const lblR1 = document.getElementById("lbl-r1");
const lblR2 = document.getElementById("lbl-r2");
const barR2 = document.getElementById("bar-r2");
const lblR2Th = document.getElementById("lbl-r2-th");
const lblR2Active = document.getElementById("lbl-r2-active");
const lblDeadzone = document.getElementById("lbl-deadzone");

// 2D Sticks
const lblLstickCoords = document.getElementById("lbl-lstick-coords");
const stickLeftDot = document.getElementById("stick-left-dot");
const lblL3 = document.getElementById("lbl-l3");
const lblLaUp = document.getElementById("lbl-la-up");
const lblLaDown = document.getElementById("lbl-la-down");
const lblLaLeft = document.getElementById("lbl-la-left");
const lblLaRight = document.getElementById("lbl-la-right");

const lblRstickCoords = document.getElementById("lbl-rstick-coords");
const stickRightDot = document.getElementById("stick-right-dot");
const lblR3 = document.getElementById("lbl-r3");
const lblRaUp = document.getElementById("lbl-ra-up");
const lblRaDown = document.getElementById("lbl-ra-down");
const lblRaLeft = document.getElementById("lbl-ra-left");
const lblRaRight = document.getElementById("lbl-ra-right");

// Buttons
const pillCross = document.getElementById("pill-cross");
const vCross = document.getElementById("v-cross");
const pillCircle = document.getElementById("pill-circle");
const vCircle = document.getElementById("v-circle");
const pillSquare = document.getElementById("pill-square");
const vSquare = document.getElementById("v-square");
const pillTriangle = document.getElementById("pill-triangle");
const vTriangle = document.getElementById("v-triangle");

const pillUp = document.getElementById("pill-up");
const vUp = document.getElementById("v-up");
const pillDown = document.getElementById("pill-down");
const vDown = document.getElementById("v-down");
const pillLeft = document.getElementById("pill-left");
const vLeft = document.getElementById("v-left");
const pillRight = document.getElementById("pill-right");
const vRight = document.getElementById("v-right");

const pillPs = document.getElementById("pill-ps");
const vPs = document.getElementById("v-ps");
const pillShare = document.getElementById("pill-share");
const vShare = document.getElementById("v-share");
const pillOptions = document.getElementById("pill-options");
const vOptions = document.getElementById("v-options");
const pillTouchBtn = document.getElementById("pill-touch-btn");
const vTouchBtn = document.getElementById("v-touch-btn");
const pillMute = document.getElementById("pill-mute");
const vMute = document.getElementById("v-mute");
const pillPhone = document.getElementById("pill-phone");
const vPhone = document.getElementById("v-phone");

const pillFn1 = document.getElementById("pill-fn1");
const vFn1 = document.getElementById("v-fn1");
const pillFn2 = document.getElementById("pill-fn2");
const vFn2 = document.getElementById("v-fn2");
const pillPaddL = document.getElementById("pill-padd-l");
const vPaddL = document.getElementById("v-padd-l");
const pillPaddR = document.getElementById("pill-padd-r");
const vPaddR = document.getElementById("v-padd-r");

// Touchpad
const lblIsTouching = document.getElementById("lbl-is-touching");
const lblTouchId = document.getElementById("lbl-touch-id");
const lblTouchDir = document.getElementById("lbl-touch-dir");
const lblTouchPos = document.getElementById("lbl-touch-pos");
const lblTouchRel = document.getElementById("lbl-touch-rel");
const lblTouchRad = document.getElementById("lbl-touch-rad");
const touchDot1 = document.getElementById("touch-dot-1");
const touchDotCoord = document.getElementById("touch-dot-coord");
const touchHint = document.getElementById("touch-hint");
const lblTouchStatus = document.getElementById("lbl-touch-status");
const touchpadArea = document.getElementById("touchpad-area");

// Interactive Controls Elements
const selTriggerEffect = document.getElementById("sel-trigger-effect");
const selTriggerHand = document.getElementById("sel-trigger-hand");
const btnApplyTrigger = document.getElementById("btn-apply-trigger");
const btnResetTrigger = document.getElementById("btn-reset-trigger");
const pickerLedColor = document.getElementById("picker-led-color");
const btnApplyLed = document.getElementById("btn-apply-led");
const switchSpeaker = document.getElementById("switch-speaker");
const switchAudioHaptics = document.getElementById("switch-audio-haptics");
const inputRumbleReduce = document.getElementById("input-rumble-reduce");
const btnTestSoft = document.getElementById("btn-test-soft");
const btnTestHeavy = document.getElementById("btn-test-heavy");
const btnTestBoth = document.getElementById("btn-test-both");
const btnStopVibe = document.getElementById("btn-stop-vibe");
const btnStopAll = document.getElementById("btn-stop-all");

// ==========================================
// ESTADO GLOBAL
// ==========================================
let hostModule = null;
let api = null;
let bannerPrinted = false;
let inputPtr = 0;
let triggerBufferPtr = 0;
let nextHandle = 1;
let nextDeviceId = 1;
let bridgesInitialized = false;
let isTouchActive = false;
let isAudioHapticsEnabled = false;
let lastFingerCount = 0;
let gamepadApp = null;
let audioVolume = 100;
let audioGain = 1.0;
const deviceIds = new Set();
const cachedDevices = [];
const byPath = new Map();
const byHandle = new Map();
const callbackPtrs = [];

const SONY_VENDOR = 0x054c;
const DEVICE_TYPE_BY_PRODUCT_ID = {
  0x0ce6: 1, // DualSense
  0x0df2: 2, // DualSense Edge
  0x05c4: 3, // DualShock 4
  0x09cc: 3, // DualShock 4 (rev)
};
const CONNECTION_USB = 1;
const DESCRIPTOR_SIZE = 532;
const PATH_SIZE = 512;
const OFF_HANDLE = 0;
const OFF_DEVICE_TYPE = 8;
const OFF_CONNECTION = 12;
const OFF_CONNECTED = 16;
const OFF_PATH = 20;
const INPUT_DESCRIPTOR_SIZE = 148;

// Trigger Payloads
const TRIGGER_FEEDBACK = new Uint8Array([
  0x21, 0xfe, 0x03, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x00, 0x00,
]);
const TRIGGER_BOW = new Uint8Array([
  0x22, 0x22, 0x01, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const TRIGGER_WEAPON = new Uint8Array([
  0x25, 0xc0, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const TRIGGER_AUTOMATIC_GUN = new Uint8Array([
  0x26, 0x00, 0x03, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x0a,
]);

const MAX_LOG_LINES = 150;
const logLines = [];
let logRenderPending = false;

function flushLogRender() {
  logRenderPending = false;
  logBox.textContent = logLines.join("\n") + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  logLines.push(`[${time}] ${message}`);
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  if (!logRenderPending) {
    logRenderPending = true;
    requestAnimationFrame(flushLogRender);
  }
}

function readCString(ptr) {
  if (!ptr || !hostModule || !hostModule.HEAPU8) return "";
  let end = ptr;
  while (hostModule.HEAPU8[end] !== 0 && end < hostModule.HEAPU8.length) {
    end++;
  }
  return new TextDecoder().decode(hostModule.HEAPU8.subarray(ptr, end));
}

btnClearLogs?.addEventListener("click", () => {
  logLines.length = 0;
  logBox.textContent = "";
});
btnClearModalLog?.addEventListener("click", () => {
  logLines.length = 0;
  logBox.textContent = "";
});
btnShowLogs?.addEventListener("click", () => {
  if (!logModal || !logModalContent) return;
  logModalContent.appendChild(logBox);
  if (typeof logModal.showModal === "function") logModal.showModal();
  else logModal.setAttribute("open", "");
});
btnCloseLogModal?.addEventListener("click", () => logModal?.close());

// ==========================================
// INICIALIZAÇÃO DA EXTENSÃO E WASM
// ==========================================
btnLoad?.addEventListener("click", async () => {
  try {
    const initFactory = window.InitGamepadCoreHost;
    if (typeof initFactory !== "function") {
      throw new Error("InitGamepadCoreHost not found on window.");
    }

    hostModule = await initFactory({
      locateFile: (path) => `../src/lib/${path}`,
      print: (text) => log(`[WASM:stdout] ${text}`),
      printErr: (text) => log(`[WASM:stderr] ${text}`),
    });

    api = bindNativeApi(hostModule);
    gamepadApp = GamepadClientApplication.fromNativeRuntime(
      hostModule,
      api,
      deviceIds,
    );
    gamepadApp.setInputServerStatusListener((status, detail) => {
      const key =
        status === "connected"
          ? "status.connected"
          : status === "connecting"
            ? "status.connecting"
            : status === "error"
              ? "status.error"
              : "status.disconnected";
      inputServerStatus.textContent =
        status === "error" ? `${t(key)}${detail ? `: ${detail}` : ""}` : t(key);
      inputServerStatus.style.color =
        status === "connected"
          ? "var(--ok)"
          : status === "error"
            ? "var(--danger, #f66)"
            : "";
      btnInputServer.textContent =
        status === "connected"
          ? t("controls.disconnectInputServer")
          : t("controls.connectInputServer");
      btnInputServer.classList.toggle("btn-danger", status === "connected");
      btnInputServer.classList.toggle("btn-primary", status !== "connected");
    });
    gamepadApp.setAudioHapticsStateListener((enabled) => {
      isAudioHapticsEnabled = enabled;
      localStorage.setItem(
        "dualsense_audio_haptics_enabled",
        enabled ? "true" : "false",
      );
      dotAudioHaptics.classList.toggle("active", enabled);
      lblAudioHaptics.textContent = enabled
        ? t("status.active")
        : t("status.inactive");
      syncPipControls();
      updateAudioControls();
    });
    gamepadApp.setInputStateListener((_deviceId, state) => {
      updateUI(state);
    });
    inputPtr = hostModule._malloc(INPUT_DESCRIPTOR_SIZE);
    triggerBufferPtr = hostModule._malloc(64);

    if (api.setLogCallback && typeof hostModule.addFunction === "function") {
      const logFnPtr = hostModule.addFunction((level, messagePtr) => {
        const text = readCString(messagePtr);
        if (
          text.includes("GCH_AudioSubmitSamples") ||
          text.includes("GCH_GetProcessAudioHaptics") ||
          text.includes("GCH_ProcessAudioHaptics")
        ) {
          return;
        }
        log(`[Native:${level}] ${text}`);
        console.log(`[Native:${level}] ${text}`);
      }, "vii");
      api.setLogCallback(logFnPtr);
    }

    dotWasm.classList.add("active");
    lblWasm.textContent = t("status.ready");
    btnLoad.disabled = true;
    btnRequest.disabled = false;
    await refreshAuthorizedDevices();
    syncPipControls();

    if (
      isRuntimeWindow &&
      cachedDevices.length > 0 &&
      localStorage.getItem("dualsense_loop_running") === "true"
    ) {
      setTimeout(() => btnStart?.click(), 0);
    }

    log(t("logs.wasmLoaded"));
  } catch (err) {
    log(t("logs.wasmFailed", { error: String(err) }));
  }
});

// O WASM é carregado automaticamente no painel; o pareamento continua sendo
// feito exclusivamente na página de opções, por exigência de segurança do WebHID.
window.addEventListener("load", () => {
  if (isRuntimeWindow) {
    if (btnLoad && !hostModule) btnLoad.click();
  } else {
    if (typeof chrome !== "undefined")
      chrome.runtime?.sendMessage?.({ type: "ensure-runtime" });
  }
});

const DEFAULT_INPUT_SERVER_URL = "ws://localhost:26760";
const savedInputServerUrl = localStorage.getItem("dualsense_input_server_url");
if (savedInputServerUrl && savedInputServerUrl !== "ws://localhost:26760") {
  inputServerUrl.value = savedInputServerUrl;
} else {
  inputServerUrl.value = DEFAULT_INPUT_SERVER_URL;
  localStorage.setItem("dualsense_input_server_url", DEFAULT_INPUT_SERVER_URL);
}
btnInputServer?.addEventListener("click", () => {
  if (!gamepadApp) {
    log(t("logs.inputServerNeedsWasm"));
    return;
  }
  if (gamepadApp.isInputServerConnected()) {
    gamepadApp.disconnectInputServer();
    return;
  }
  const url = inputServerUrl.value.trim();
  localStorage.setItem("dualsense_input_server_url", url);
  gamepadApp.connectInputServer(url);
});

btnRequest?.addEventListener("click", async () => {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
  } else if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    window.open(chrome.runtime.getURL("options.html"), "_blank");
  } else if ("hid" in navigator) {
    try {
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: SONY_VENDOR }],
      });
      if (devices.length > 0) {
        await refreshAuthorizedDevices();
        log(
          t("logs.webHidConnected", {
            name: devices[0].productName || "DualSense",
          }),
        );
      }
    } catch (err) {
      log(t("logs.webHidFailed", { error: String(err) }));
    }
  }
});

btnStart.addEventListener("click", async () => {
  if (!isRuntimeWindow && !gamepadApp) {
    runtimeChannel?.postMessage({ type: "play" });
    return;
  }
  try {
    await refreshAuthorizedDevices();
    await initializeBridges();
    await createAllAuthorizedDevices();
    gamepadApp?.run();
    localStorage.setItem("dualsense_loop_running", "true");
    btnStart.disabled = true;
    btnStop.disabled = false;
    syncPipControls();
    log(t("logs.loopStarted"));
  } catch (err) {
    log(`❌ Error starting loop: ${String(err)}`);
  }
});

btnStop.addEventListener("click", async () => {
  if (!isRuntimeWindow && !gamepadApp) {
    runtimeChannel?.postMessage({ type: "stop" });
    return;
  }
  gamepadApp?.stopLoop();
  localStorage.setItem("dualsense_loop_running", "false");
  await stopAudioHapticsFromUi();
  syncPipControls();
  log(t("logs.loopStopped"));
});

// ==========================================
// FUNÇÕES AUXILIARES (UI e Lógica)
// ==========================================
function applyAudioSettings() {
  const ids = Array.from(deviceIds);
  if (ids.length === 0) {
    log(t("logs.audioNoDevice"));
    return;
  }

  const isSpeaker = !switchSpeaker?.checked ? 1 : 0;
  const rumbleMode = !switchAudioHaptics?.checked ? 0xfc : 0xff;
  const rumbleReduce = Math.min(
    15,
    Math.max(0, Number(inputRumbleReduce?.value ?? 0) || 0),
  );

  for (const deviceId of ids) {
    api?.dualsenseSettings?.(
      deviceId,
      0,
      1,
      isSpeaker,
      0,
      audioVolume,
      rumbleMode,
      rumbleReduce,
      0,
    );
    api?.updateOutput?.(deviceId);
  }

  gamepadApp?.setAudioHapticsSettings({
    bIsSpeaker: isSpeaker,
    audioVolume,
    gain: audioGain,
    rumbleMode,
    rumbleReduce,
  });
}

function syncPipControls() {
  const hasController = gamepadApp
    ? cachedDevices.length > 0 || deviceIds.size > 0
    : runtimeHasController;
  const loopIsRunning = gamepadApp?.isLoopRunning() ?? runtimeLoopRunning;
  btnStart.disabled = !hasController || loopIsRunning;
  btnStop.disabled = !hasController || !loopIsRunning;

  const targets = [compactHud, pipWindow?.document, inPagePip].filter(Boolean);
  for (const target of targets) {
    const play = target.querySelector?.("#pip-btn-play");
    const stop = target.querySelector?.("#pip-btn-stop-loop");
    const audio = target.querySelector?.("#pip-btn-audio");
    if (play) play.disabled = btnStart.disabled;
    if (stop) stop.disabled = btnStop.disabled;
    if (audio) {
      audio.disabled = !hasController || !loopIsRunning;
      setAudioButtonState(audio);
    }
  }
  publishPipState();
}

function setAudioButtonState(audio) {
  audio.classList.toggle("active", isAudioHapticsEnabled);
  audio.setAttribute("aria-pressed", String(isAudioHapticsEnabled));
  audio.textContent = isAudioHapticsEnabled
    ? "🎵 Audio Haptics (On)"
    : "🎵 Audio Haptics (Off)";
}

async function toggleAudioHapticsFromPip() {
  if (!isRuntimeWindow && !gamepadApp) {
    runtimeChannel?.postMessage({ type: "audio" });
    return;
  }
  if (!gamepadApp) return;
  try {
    await gamepadApp.toggleAudioHaptics();
    isAudioHapticsEnabled = gamepadApp.getIsAudioHapticsEnabled();
    localStorage.setItem(
      "dualsense_audio_haptics_enabled",
      isAudioHapticsEnabled ? "true" : "false",
    );
    dotAudioHaptics.classList.toggle("active", isAudioHapticsEnabled);
    lblAudioHaptics.textContent = isAudioHapticsEnabled
      ? t("status.active")
      : t("status.inactive");
    [pipWindow?.document, inPagePip].forEach((target) => {
      const audio = target?.querySelector?.("#pip-btn-audio");
      if (audio) setAudioButtonState(audio);
    });

    syncPipControls();
    log(t(isAudioHapticsEnabled ? "logs.audioEnabled" : "logs.audioDisabled"));
  } catch (err) {
    log(t("logs.audioToggleError", { error: String(err) }));
  }
}

btnPip?.addEventListener("click", () => togglePictureInPicture());
btnAudioHaptics?.addEventListener("click", async () => {
  if (isWebPage) {
    // Na página web, o áudio é iniciado pelo botão dentro do PiP.
    if (!pipWindow && inPagePip?.style.display === "none") {
      await togglePictureInPicture();
    }
    return;
  }
  await toggleAudioHapticsFromPip();
});

function updateAudioControls() {
  const settings = gamepadApp?.getAudioHapticsSettings();
  if (settings) {
    audioVolume = settings.audioVolume;
    audioGain = settings.gain;
  }
  if (inputAudioVolume) inputAudioVolume.value = String(audioVolume);
  if (inputAudioGain) inputAudioGain.value = String(audioGain);
  if (inputAudioVolumeValue)
    inputAudioVolumeValue.textContent = String(audioVolume);
  if (inputAudioGainValue)
    inputAudioGainValue.textContent = Number(audioGain).toFixed(1);
  if (btnAudioHaptics) {
    btnAudioHaptics.classList.toggle("active", isAudioHapticsEnabled);
    btnAudioHaptics.textContent = isAudioHapticsEnabled
      ? t("header.btnAudioHapticsOn")
      : t("header.btnAudioHaptics");
  }
}

function applyPanelAudioSettings() {
  audioVolume = Number(inputAudioVolume?.value ?? 100);
  audioGain = Number(inputAudioGain?.value ?? 1);
  gamepadApp?.setAudioHapticsSettings({ audioVolume, gain: audioGain });
  // Atualiza a interface depois de aplicar no runtime; caso contrário,
  // updateAudioControls() relê os valores antigos e sobrescreve o slider.
  updateAudioControls();
}
inputAudioVolume?.addEventListener("input", applyPanelAudioSettings);
inputAudioGain?.addEventListener("input", applyPanelAudioSettings);

async function refreshAuthorizedDevices() {
  if (!("hid" in navigator)) return;
  cachedDevices.length = 0;
  const devices = await navigator.hid.getDevices();
  for (const d of devices) cacheDevice(d);

  const savedDevices = cachedDevices.map((device) => ({
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName || "DualSense",
    serialNumber: device.serialNumber || "",
  }));
  localStorage.setItem(
    "dualsense_authorized_devices",
    JSON.stringify(savedDevices),
  );
  localStorage.setItem(
    "dualsense_hid_authorized",
    savedDevices.length > 0 ? "true" : "false",
  );

  if (cachedDevices.length > 0) {
    dotHid.classList.add("active");
    lblDevice.textContent = cachedDevices[0].productName || "DualSense";
  } else {
    dotHid.classList.remove("active");
    lblDevice.textContent = t("status.none");
  }
  syncPipControls();
}

// A página de opções e o painel lateral compartilham o estado de autorização.
window.addEventListener("storage", (event) => {
  if (
    event.key === "dualsense_hid_authorized" ||
    event.key === "dualsense_authorized_devices"
  ) {
    refreshAuthorizedDevices().catch((error) =>
      console.error("Failed to refresh HID authorization:", error),
    );
  }
});
window.addEventListener("focus", () => {
  refreshAuthorizedDevices().catch(() => {});
});

function bindNativeApi(mod) {
  const tryWrap = (name, ret, args) => {
    try {
      return mod.cwrap(name, ret, args);
    } catch {
      return null;
    }
  };
  return {
    setLogCallback: tryWrap("GCH_SetLogCallback", null, ["number"]),
    initializePlatformBridgeWasm: tryWrap(
      "GCH_InitializePlatformBridgeWasm",
      null,
      ["number", "number", "number", "number", "number", "number", "number"],
    ),
    initializeRegistryPolicyWasm: tryWrap(
      "GCH_InitializeDeviceRegistryPolicyWasm",
      null,
      ["number", "number", "number", "number"],
    ),
    createDevice: tryWrap("GCH_CreateDevice", null, ["number"]),
    discoverDevices: tryWrap("GCH_DiscoverDevices", null, ["number"]),
    updateInput: tryWrap("GCH_UpdateInput", null, ["number", "number"]),
    getInputState: tryWrap("GCH_GetInputState", null, ["number", "number"]),
    enableGyroscopeValues: tryWrap("GCH_EnableGyroscopeValues", null, [
      "number",
      "number",
    ]),
    enableTouch: tryWrap("GCH_EnableTouch", null, ["number", "number"]),
    resetGyroOrientation: tryWrap("GCH_ResetGyroOrientation", null, ["number"]),
    batteryLevelDevice: tryWrap("GCH_BatteryLevelDevice", "number", ["number"]),
    setVibration: tryWrap("GCH_SetVibration", null, [
      "number",
      "number",
      "number",
    ]),
    lightbar: tryWrap("GCH_Lightbar", null, [
      "number",
      "number",
      "number",
      "number",
    ]),
    resetLights: tryWrap("GCH_ResetLights", null, ["number"]),
    updateOutput: tryWrap("GCH_UpdateOutput", null, ["number"]),
    customTrigger: tryWrap("GCH_CustomTrigger", "number", [
      "number",
      "number",
      "number",
      "number",
    ]),
    stopTrigger: tryWrap("GCH_StopTrigger", null, ["number", "number"]),
    audioSubmitSamples: tryWrap("GCH_AudioSubmitSamples", "number", [
      "number",
      "number",
      "number",
      "number",
    ]),
    initializeAudio: tryWrap("GCH_InitializeAudio", null, ["number", "number"]),
    getProcessAudioHaptics:
      tryWrap("GCH_GetProcessAudioHaptics", "number", ["number"]) ||
      tryWrap("GCH_ProcessAudioHaptics", "number", ["number"]),
    processAudioHaptics:
      tryWrap("GCH_GetProcessAudioHaptics", "number", ["number"]) ||
      tryWrap("GCH_ProcessAudioHaptics", "number", ["number"]),
    dualsenseSettings: tryWrap("GCH_DualSenseSettings", null, [
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
  };
}

async function initializeBridges() {
  if (bridgesInitialized) return;

  const readPtr = hostModule.addFunction(onRead, "ijiii");
  const writePtr = hostModule.addFunction(onWrite, "ijiii");
  const detectPtr = hostModule.addFunction(() => 0, "iii");
  const createPtr = hostModule.addFunction(onCreateHandle, "ii");
  const invalidatePtr = hostModule.addFunction(onInvalidateHandle, "vj");
  const configPtr = hostModule.addFunction(() => {}, "vjiii");
  const hapticsPtr = hostModule.addFunction(() => {}, "vjiii");
  callbackPtrs.push(
    readPtr,
    writePtr,
    detectPtr,
    createPtr,
    invalidatePtr,
    configPtr,
    hapticsPtr,
  );

  const allocPtr = hostModule.addFunction(onAllocDevice, "i");
  const dispatchPtr = hostModule.addFunction(onDispatchDevice, "vi");
  const disconnectPtr = hostModule.addFunction(onDisconnectDevice, "vi");
  callbackPtrs.push(allocPtr, dispatchPtr, disconnectPtr);

  api.initializePlatformBridgeWasm(
    readPtr,
    writePtr,
    detectPtr,
    createPtr,
    invalidatePtr,
    configPtr,
    hapticsPtr,
  );
  api.initializeRegistryPolicyWasm(0, allocPtr, dispatchPtr, disconnectPtr);
  bridgesInitialized = true;
  log(t("logs.bridgeConnected"));
}

async function createAllAuthorizedDevices() {
  if (!api.createDevice) return;
  let created = 0;
  const descPtr = hostModule._malloc(DESCRIPTOR_SIZE);

  try {
    for (const device of cachedDevices) {
      if (device.vendorId !== SONY_VENDOR) continue;
      const path = makePath(device, created);

      if (!device.opened) {
        try {
          await device.open();
          log(`✅ Device opened: ${device.productName || path}`);
        } catch (e) {
          log(`❌ Failed to open ${path}: ${String(e)}`);
          continue;
        }
      }

      if (!byPath.has(path)) {
        const entry = {
          device,
          path,
          handle: 0,
          packet: new Uint8Array(0),
          listener: null,
        };
        byPath.set(path, entry);

        entry.listener = (event) => {
          const body = new Uint8Array(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength,
          );
          const packet = new Uint8Array(body.length + 1);
          packet[0] = event.reportId;
          packet.set(body, 1);
          entry.packet = packet;
        };
        device.addEventListener("inputreport", entry.listener);
      }

      const entry = byPath.get(path);
      if (!entry.handle) {
        entry.handle = nextHandle++;
        byHandle.set(entry.handle, entry);
      }

      const deviceType = DEVICE_TYPE_BY_PRODUCT_ID[device.productId] ?? 1;
      writeU64(descPtr + OFF_HANDLE, entry.handle);
      hostModule.setValue(descPtr + OFF_DEVICE_TYPE, deviceType, "i32");
      hostModule.setValue(descPtr + OFF_CONNECTION, CONNECTION_USB, "i32");
      hostModule.setValue(descPtr + OFF_CONNECTED, 1, "i32");

      const pathBytes = pathToBytes(path);
      for (let i = 0; i < PATH_SIZE; i++) {
        hostModule.setValue(descPtr + OFF_PATH + i, pathBytes[i] || 0, "i8");
      }

      api.createDevice(descPtr);
      created++;
    }
  } finally {
    hostModule._free(descPtr);
  }
}

function onAllocDevice() {
  return nextDeviceId++;
}

function onDispatchDevice(deviceId) {
  if (!deviceIds.has(deviceId)) {
    deviceIds.add(deviceId);
    audioVolume = 100;
    audioGain = 1.0;
    gamepadApp?.setAudioHapticsSettings({ audioVolume: 100, gain: 1.0 });
    syncPipControls();
    printStartupBanner();
    log(t("logs.deviceDispatched", { id: deviceId }));

    if (api.enableTouch) {
      api.enableTouch(deviceId, 1);
      isTouchActive = true;
      dotTouch.classList.add("active");
      lblTouch.textContent = t("status.active");
      log(t("logs.touchActive", { id: deviceId }));
    }
  }
}

function onDisconnectDevice(deviceId) {
  deviceIds.delete(deviceId);
  syncPipControls();
  log(t("logs.deviceDisconnected", { id: deviceId }));
}

function onCreateHandle(descPtr) {
  if (!descPtr) return 0;
  const path = readPath(descPtr + OFF_PATH);
  const entry = byPath.get(path);
  if (!entry) return 0;
  if (!entry.device.opened) {
    entry.device.open().catch(console.error);
  }
  hostModule.setValue(descPtr + OFF_CONNECTED, 1, "i32");
  return 1;
}

function onRead(handle, bufferPtr, length, bytesReadPtr) {
  const h = typeof handle === "bigint" ? Number(handle) : handle;
  const entry = byHandle.get(h);
  if (
    !entry ||
    !bufferPtr ||
    length <= 0 ||
    !entry.packet ||
    entry.packet.length === 0
  ) {
    writeI32(bytesReadPtr, 0);
    return 0;
  }
  const bytes = Math.min(length, entry.packet.length);
  for (let i = 0; i < bytes; i++) {
    hostModule.setValue(bufferPtr + i, entry.packet[i], "i8");
  }
  writeI32(bytesReadPtr, bytes);
  return bytes > 0 ? 1 : 0;
}

function onWrite(handle, bufferPtr, length, bytesWrittenPtr) {
  const h = typeof handle === "bigint" ? Number(handle) : handle;
  const entry = byHandle.get(h);
  if (!entry || !bufferPtr || length <= 0 || !entry.device.opened) {
    writeI32(bytesWrittenPtr, 0);
    return 0;
  }
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = hostModule.getValue(bufferPtr + i, "i8") & 0xff;
  }
  const reportId = data[0] || 0;
  const payload = data.subarray(1);
  entry.device
    .sendReport(reportId, payload)
    .catch((e) => log(`sendReport failed: ${String(e)}`));
  writeI32(bytesWrittenPtr, length);
  return 1;
}

function onInvalidateHandle(handle) {
  const h = typeof handle === "bigint" ? Number(handle) : handle;
  const entry = byHandle.get(h);
  if (!entry) return;
  byHandle.delete(h);
  entry.handle = 0;
  if (entry.listener) {
    entry.device.removeEventListener("inputreport", entry.listener);
  }
}

const TRIGGER_EFFECT_MAP = {
  none: null,
  feedback: TRIGGER_FEEDBACK,
  bow: TRIGGER_BOW,
  weapon: TRIGGER_WEAPON,
  autogun: TRIGGER_AUTOMATIC_GUN,
};

function getActiveDeviceId() {
  const ids = Array.from(deviceIds);
  return ids.length > 0 ? ids[0] : 1;
}

btnApplyTrigger?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  const effectKey = selTriggerEffect?.value || "none";
  const hand = parseInt(selTriggerHand?.value ?? "1", 10);
  const payload = TRIGGER_EFFECT_MAP[effectKey];

  if (!payload) {
    stopTriggers(id);
    return;
  }

  if (hand === 2) {
    setTriggerEffect(
      id,
      payload,
      0,
      `Trigger Effect: ${effectKey.toUpperCase()} (L2)`,
    );
    setTriggerEffect(
      id,
      payload,
      1,
      `Trigger Effect: ${effectKey.toUpperCase()} (R2)`,
    );
  } else {
    const handName = hand === 0 ? "L2" : "R2";
    setTriggerEffect(
      id,
      payload,
      hand,
      `Trigger Effect: ${effectKey.toUpperCase()} (${handName})`,
    );
  }
});

btnResetTrigger?.addEventListener("click", () => {
  stopTriggers(getActiveDeviceId());
});

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return { r, g, b };
}

function applySelectedColor(hexColor) {
  const id = getActiveDeviceId();
  const { r, g, b } = hexToRgb(hexColor);
  api?.lightbar?.(id, r, g, b);
  api?.updateOutput?.(id);
  log(`💡 Device ${id}: LED Color set to RGB(${r}, ${g}, ${b})`);
}

pickerLedColor?.addEventListener("change", () => {
  applySelectedColor(pickerLedColor.value);
});

switchSpeaker?.addEventListener("click", applyAudioSettings);
switchAudioHaptics?.addEventListener("click", applyAudioSettings);
inputRumbleReduce?.addEventListener("input", applyAudioSettings);

pickerLedColor?.addEventListener("input", (e) => {
  applySelectedColor(e.target.value);
});

document.querySelectorAll(".color-preset-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const color = e.target.getAttribute("data-color");
    if (color) {
      if (pickerLedColor) pickerLedColor.value = color;
      applySelectedColor(color);
    }
  });
});

btnTestSoft?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  api?.setVibration?.(id, 0, 64);
  api?.updateOutput?.(id);
  log(`📳 Device ${id}: Soft Rumble Test (Right Motor = 64)`);
});

btnTestHeavy?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  api?.setVibration?.(id, 64, 0);
  api?.updateOutput?.(id);
  log(`📳 Device ${id}: Heavy Rumble Test (Left Motor = 64)`);
});

btnTestBoth?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  api?.setVibration?.(id, 64, 64);
  api?.updateOutput?.(id);
  log(`📳 Device ${id}: Both Motors Rumble Test (Left=64, Right=64)`);
});

btnStopVibe?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  api?.setVibration?.(id, 0, 0);
  api?.updateOutput?.(id);
  log(`📳 Device ${id}: Vibration Stopped.`);
});

btnStopAll?.addEventListener("click", () => {
  const id = getActiveDeviceId();
  stopTriggers(id);
  api?.setVibration?.(id, 0, 0);
  api?.lightbar?.(id, 0, 0, 0);
  api?.resetLights?.(id);
  api?.updateOutput?.(id);
  log(`🛑 Device ${id}: All vibration, trigger effects, and lights stopped.`);
});

function setTriggerEffect(deviceId, payload, hand, msg) {
  if (!api.customTrigger || !api.updateOutput) {
    log(`⚠️ ${msg} (GCH_CustomTrigger not available)`);
    return;
  }
  for (let i = 0; i < payload.length; i++) {
    hostModule.setValue(triggerBufferPtr + i, payload[i], "i8");
  }
  const ok = api.customTrigger(
    deviceId,
    triggerBufferPtr,
    payload.length,
    hand,
  );
  api.updateOutput(deviceId);
  log(
    ok
      ? t("logs.triggerSuccess", { id: deviceId, msg })
      : t("logs.triggerFailed", { id: deviceId, msg }),
  );
}

function stopTriggers(deviceId) {
  api.stopTrigger?.(deviceId, 0);
  api.stopTrigger?.(deviceId, 1);
  api.updateOutput?.(deviceId);
  log(t("logs.triggersReset", { id: deviceId }));
}

function setBasicOutput(deviceId, left, right, r, g, b, msg) {
  api.setVibration?.(deviceId, left, right);
  api.lightbar?.(deviceId, r, g, b);
  api.updateOutput?.(deviceId);
  log(`✨ Device ${deviceId}: ${msg}`);
}

function updateUI(s) {
  lblL1.textContent = s.bLeftShoulder ? "1" : "0";
  lblL1.style.color = s.bLeftShoulder ? "var(--ok)" : "inherit";
  lblL2.textContent = s.leftTriggerAnalog.toFixed(3);
  barL2.style.width = `${Math.min(100, Math.max(0, s.leftTriggerAnalog * 100))}%`;
  lblL2Th.textContent = String(s.bLeftTriggerThreshold);
  lblL2Th.style.color = s.bLeftTriggerThreshold ? "var(--ok)" : "inherit";

  lblR1.textContent = s.bRightShoulder ? "1" : "0";
  lblR1.style.color = s.bRightShoulder ? "var(--ok)" : "inherit";
  lblR2.textContent = s.rightTriggerAnalog.toFixed(3);
  barR2.style.width = `${Math.min(100, Math.max(0, s.rightTriggerAnalog * 100))}%`;
  lblR2Th.textContent = String(s.bRightTriggerThreshold);
  lblR2Th.style.color = s.bRightTriggerThreshold ? "var(--ok)" : "inherit";
  lblR2Active.textContent = s.rightTriggerAnalog.toFixed(2);
  lblDeadzone.textContent = s.analogDeadZone.toFixed(2);

  lblLstickCoords.textContent = `(${s.leftAnalogX.toFixed(2)}, ${s.leftAnalogY.toFixed(2)})`;
  stickLeftDot.style.transform = `translate(${s.leftAnalogX * 32}px, ${-s.leftAnalogY * 32}px)`;
  stickLeftDot.classList.toggle("pressed", s.bLeftStick);
  lblL3.textContent = s.bLeftStick ? "1" : "0";
  lblL3.style.color = s.bLeftStick ? "var(--ok)" : "inherit";
  lblLaUp.textContent = s.bLeftAnalogUp ? "1" : "0";
  lblLaUp.style.color = s.bLeftAnalogUp ? "var(--ok)" : "inherit";
  lblLaDown.textContent = s.bLeftAnalogDown ? "1" : "0";
  lblLaDown.style.color = s.bLeftAnalogDown ? "var(--ok)" : "inherit";
  lblLaLeft.textContent = s.bLeftAnalogLeft ? "1" : "0";
  lblLaLeft.style.color = s.bLeftAnalogLeft ? "var(--ok)" : "inherit";
  lblLaRight.textContent = s.bLeftAnalogRight ? "1" : "0";
  lblLaRight.style.color = s.bLeftAnalogRight ? "var(--ok)" : "inherit";

  lblRstickCoords.textContent = `(${s.rightAnalogX.toFixed(2)}, ${s.rightAnalogY.toFixed(2)})`;
  stickRightDot.style.transform = `translate(${s.rightAnalogX * 32}px, ${-s.rightAnalogY * 32}px)`;
  stickRightDot.classList.toggle("pressed", s.bRightStick);
  lblR3.textContent = s.bRightStick ? "1" : "0";
  lblR3.style.color = s.bRightStick ? "var(--ok)" : "inherit";
  lblRaUp.textContent = s.bRightAnalogUp ? "1" : "0";
  lblRaUp.style.color = s.bRightAnalogUp ? "var(--ok)" : "inherit";
  lblRaDown.textContent = s.bRightAnalogDown ? "1" : "0";
  lblRaDown.style.color = s.bRightAnalogDown ? "var(--ok)" : "inherit";
  lblRaLeft.textContent = s.bRightAnalogLeft ? "1" : "0";
  lblRaLeft.style.color = s.bRightAnalogLeft ? "var(--ok)" : "inherit";
  lblRaRight.textContent = s.bRightAnalogRight ? "1" : "0";
  lblRaRight.style.color = s.bRightAnalogRight ? "var(--ok)" : "inherit";

  updatePill(pillCross, vCross, s.bCross);
  updatePill(pillCircle, vCircle, s.bCircle);
  updatePill(pillSquare, vSquare, s.bSquare);
  updatePill(pillTriangle, vTriangle, s.bTriangle);

  updatePill(pillUp, vUp, s.bDpadUp);
  updatePill(pillDown, vDown, s.bDpadDown);
  updatePill(pillLeft, vLeft, s.bDpadLeft);
  updatePill(pillRight, vRight, s.bDpadRight);

  updatePill(pillPs, vPs, s.bPSButton);
  updatePill(pillShare, vShare, s.bShare);
  updatePill(pillOptions, vOptions, s.bStart);
  updatePill(pillTouchBtn, vTouchBtn, s.bTouch);
  updatePill(pillMute, vMute, s.bMute);
  updatePill(pillPhone, vPhone, s.bHasPhoneConnected);

  updatePill(pillFn1, vFn1, s.bFn1);
  updatePill(pillFn2, vFn2, s.bFn2);
  updatePill(pillPaddL, vPaddL, s.bPaddleLeft);
  updatePill(pillPaddR, vPaddR, s.bPaddleRight);

  lblIsTouching.textContent = String(s.bIsTouching);
  lblIsTouching.style.color = s.bIsTouching ? "var(--ok)" : "inherit";
  lblTouchId.textContent = String(s.touchId);
  lblTouchDir.textContent = String(s.directionRaw);
  lblTouchPos.textContent = `(${s.touchPositionX.toFixed(1)}, ${s.touchPositionY.toFixed(1)})`;
  lblTouchRel.textContent = `(${s.touchRelativeX.toFixed(1)}, ${s.touchRelativeY.toFixed(1)})`;
  lblTouchRad.textContent = `(${s.touchRadiusX.toFixed(1)}, ${s.touchRadiusY.toFixed(1)})`;
  lastFingerCount = s.touchFingerCount;
  lblTouchStatus.textContent = `${t("touchpad.fingers")}: ${s.touchFingerCount}`;

  const isTouching = Boolean(
    s.bIsTouching ||
    s.touchFingerCount > 0 ||
    s.touchPositionX !== 0 ||
    s.touchPositionY !== 0,
  );

  if (
    isTouching &&
    (s.touchPositionX > 0 || s.touchPositionY > 0 || s.bIsTouching)
  ) {
    touchDot1.style.display = "block";
    let nx = 0,
      ny = 0;
    if (s.touchPositionX > 1.5 || s.touchPositionY > 1.5) {
      nx = Math.min(1, Math.max(0, s.touchPositionX / 1920));
      ny = Math.min(1, Math.max(0, s.touchPositionY / 1080));
    } else if (
      s.touchPositionX >= 0 &&
      s.touchPositionX <= 1.0 &&
      s.touchPositionY >= 0 &&
      s.touchPositionY <= 1.0
    ) {
      nx = s.touchPositionX;
      ny = s.touchPositionY;
    } else {
      nx = Math.min(1, Math.max(0, (s.touchPositionX + 1) / 2));
      ny = Math.min(1, Math.max(0, (s.touchPositionY + 1) / 2));
    }
    touchDot1.style.left = `${(nx * 100).toFixed(2)}%`;
    touchDot1.style.top = `${(ny * 100).toFixed(2)}%`;
    if (touchDotCoord)
      touchDotCoord.textContent = `${s.touchPositionX.toFixed(0)}, ${s.touchPositionY.toFixed(0)}`;
    touchHint.style.display = "none";
    touchpadArea?.classList.add("active-touch");
  } else {
    touchDot1.style.display = "none";
    touchHint.style.display = "block";
    touchpadArea?.classList.remove("active-touch");
  }

  lblBattery.textContent = `${s.batteryLevel.toFixed(0)}%`;
  updatePipUI(s);
}

function updatePill(pill, valEl, isPressed) {
  valEl.textContent = isPressed ? "1" : "0";
  pill.classList.toggle("active", isPressed);
}

let pipWindow = null;
const pipChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("dualsense_pip_controls")
    : null;

function publishPipState() {
  const state = {
    type: "state",
    loopRunning: gamepadApp?.isLoopRunning() ?? false,
    audioEnabled:
      gamepadApp?.getIsAudioHapticsEnabled() ?? isAudioHapticsEnabled,
    audioVolume,
    audioGain,
    hasController: cachedDevices.length > 0 || deviceIds.size > 0,
  };
  pipChannel?.postMessage(state);
  runtimeChannel?.postMessage(state);
}

pipChannel?.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "request-state") {
    publishPipState();
    return;
  }
  if (message.type === "play") btnStart.click();
  if (message.type === "stop") btnStop.click();
  if (message.type === "audio") toggleAudioHapticsFromPip();
  if (message.type === "audio-settings") {
    audioVolume = Math.min(100, Math.max(0, Number(message.volume) || 0));
    audioGain = Math.min(2, Math.max(1, Number(message.gain) || 1));
    if (message.headsetOnly !== undefined && switchSpeaker) {
      switchSpeaker.checked = Boolean(message.headsetOnly);
    }
    if (message.audioOnly !== undefined && switchAudioHaptics) {
      switchAudioHaptics.checked = Boolean(message.audioOnly);
    }
    if (message.rumbleReduce !== undefined && inputRumbleReduce) {
      inputRumbleReduce.value = String(message.rumbleReduce);
    }
    if (
      message.headsetOnly !== undefined ||
      message.audioOnly !== undefined ||
      message.rumbleReduce !== undefined
    ) {
      applyAudioSettings();
    } else {
      gamepadApp?.setAudioHapticsSettings({ audioVolume, gain: audioGain });
    }
    publishPipState();
  }
});

function getPipTemplateHTML(includeControls = true) {
  const controls = includeControls
    ? `
    <div class="pip-actions-bar">
      <button id="pip-btn-play" class="pip-control-btn pip-control-play">▶ Play</button>
      <button id="pip-btn-stop-loop" class="pip-control-btn pip-control-stop">■ Stop</button>
      <button id="pip-btn-audio" class="pip-control-btn pip-control-audio">🎵 Audio Haptics</button>
    </div>
    <div class="pip-actions-bar">
      <label class="pip-audio-slider">Vol <input id="pip-audio-volume" type="range" min="0" max="100" value="100" step="1"><output id="pip-audio-volume-value">100</output></label>
      <label class="pip-audio-slider">Gain <input id="pip-audio-gain" type="range" min="1.0" max="2.0" value="1.0" step="0.1"><output id="pip-audio-gain-value">1.0</output></label>
    </div>`
    : `<div class="compact-pip-hint"><button type="button" disabled data-i18n="controls.audioHapticsPipHint">${t("controls.audioHapticsPipHint")}</button></div><div class="compact-pip-overlay"><button id="compact-pip-open" class="btn-pip" data-i18n="controls.openPictureInPicture">${t("controls.openPictureInPicture")}</button></div>`;
  return `
    <div class="pip-header" id="pip-drag-handle">
      <div class="pip-title"><span>🎮</span><span>DualSense Mini</span></div>
      <div class="pip-header-right"><span id="pip-battery" class="pip-battery-badge">🔋 --%</span><button id="pip-close-btn" class="pip-close-btn" title="Close PiP">✕</button></div>
    </div>
    <div class="pip-triggers-row">
      <div class="pip-trigger-col">
        <div class="pip-trigger-top"><span id="pip-btn-l1" class="pip-btn-pill">L1</span><span class="pip-label">L2: <strong id="pip-l2-val">0.00</strong></span></div>
        <div class="pip-meter-track"><div id="pip-l2-bar" class="pip-meter-fill"></div></div>
      </div>
      <div class="pip-trigger-col">
        <div class="pip-trigger-top"><span class="pip-label">R2: <strong id="pip-r2-val">0.00</strong></span><span id="pip-btn-r1" class="pip-btn-pill">R1</span></div>
        <div class="pip-meter-track"><div id="pip-r2-bar" class="pip-meter-fill"></div></div>
      </div>
    </div>
    <div class="pip-main-body">
      <div class="pip-dpad-grid">
        <div></div><div id="pip-dpad-up" class="pip-dpad-btn pip-btn">▲</div><div></div>
        <div id="pip-dpad-left" class="pip-dpad-btn pip-btn">◀</div><div class="pip-dpad-center"></div><div id="pip-dpad-right" class="pip-dpad-btn pip-btn">▶</div>
        <div></div><div id="pip-dpad-down" class="pip-dpad-btn pip-btn">▼</div><div></div>
      </div>
      <div class="pip-center-col">
        <div class="pip-system-row">
          <span id="pip-btn-share" class="pip-sys-btn" title="Share / Create">◪</span>
          <span id="pip-btn-touch" class="pip-sys-btn" title="Touchpad">TOUCH</span>
          <span id="pip-btn-ps" class="pip-sys-btn pip-ps-btn" title="PS">PS</span>
          <span id="pip-btn-mute" class="pip-sys-btn" title="Mute">🎙️</span>
          <span id="pip-btn-options" class="pip-sys-btn" title="Options">☰</span>
        </div>
        <div class="pip-sticks-row">
          <div class="pip-stick-box">
            <div class="pip-stick-radar"><div class="pip-radar-cross"></div><div id="pip-lstick-dot" class="pip-stick-dot"></div></div>
            <div class="pip-stick-sub"><span id="pip-btn-l3" class="pip-stick-click">L3</span><span id="pip-lstick-coords" class="pip-coords">0.0, 0.0</span></div>
          </div>
          <div class="pip-stick-box">
            <div class="pip-stick-radar"><div class="pip-radar-cross"></div><div id="pip-rstick-dot" class="pip-stick-dot"></div></div>
            <div class="pip-stick-sub"><span id="pip-btn-r3" class="pip-stick-click">R3</span><span id="pip-rstick-coords" class="pip-coords">0.0, 0.0</span></div>
          </div>
        </div>
      </div>
      <div class="pip-face-grid">
        <div></div><div id="pip-btn-triangle" class="pip-face-btn pip-btn-triangle">△</div><div></div>
        <div id="pip-btn-square" class="pip-face-btn pip-btn-square">□</div><div class="pip-dpad-center"></div><div id="pip-btn-circle" class="pip-face-btn pip-btn-circle">○</div>
        <div></div><div id="pip-btn-cross" class="pip-face-btn pip-btn-cross">✕</div><div></div>
      </div>
    </div>
    ${controls}`;
}

async function stopAudioHapticsFromUi() {
  try {
    await gamepadApp?.disableAudioHaptics();
  } catch (err) {
    log(t("logs.audioStopError", { error: String(err) }));
  }
}

function setupPipEvents(targetDocOrEl, isNativeWindow) {
  const q = (sel) => targetDocOrEl.querySelector(sel);
  q("#pip-btn-play")?.addEventListener("click", () => btnStart.click());
  q("#pip-btn-stop-loop")?.addEventListener("click", () => {
    toggleAudioHapticsFromPip();
    btnStop.click();
  });
  q("#pip-btn-audio")?.addEventListener("click", () =>
    toggleAudioHapticsFromPip(),
  );
  q("#compact-pip-open")?.addEventListener("click", () =>
    togglePictureInPicture(),
  );

  const closeBtn = q("#pip-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", async () => {
      await toggleAudioHapticsFromPip();
      await stopAudioHapticsFromUi();
      if (isNativeWindow && pipWindow) {
        pipWindow.close();
        pipWindow = null;
      } else {
        inPagePip.style.display = "none";
      }
      btnPip.classList.remove("active");
    });
  }
}

async function togglePictureInPicture() {
  if (pipWindow) {
    pipWindow.close();
    pipWindow = null;
    btnPip.classList.remove("active");
    return;
  }
  // Na página web, abre o mini painel antes do getDisplayMedia,
  // aproveitando o clique do usuário para evitar bloqueio do popup.
  if (isWebPage) {
    const popup = window.open(
      new URL("pip.html", location.href).href,
      "dualsense-web-pip",
      "popup=yes,width=380,height=230,resizable=no",
    );
    if (popup) {
      pipWindow = popup;
      popup.addEventListener("beforeunload", () => {
        if (pipWindow === popup) pipWindow = null;
      });
      log(t("logs.pipOpened"));
      return;
    }
  }
  if (inPagePip.style.display !== "none") {
    inPagePip.style.display = "none";
    btnPip.classList.remove("active");
    return;
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    const popup = window.open(
      chrome.runtime.getURL("pip.html"),
      "dualsense-pip",
      "popup=yes,width=380,height=230,resizable=no",
    );
    if (popup) {
      pipWindow = popup;
      popup.addEventListener("load", () => publishPipState());
      popup.addEventListener("beforeunload", () => {
        if (pipWindow === popup) pipWindow = null;
        btnPip.classList.remove("active");
      });
      btnPip.classList.add("active");
      log(t("logs.pipOpened"));
      return;
    }
  }

  if ("documentPictureInPicture" in window) {
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 468,
        height: 344,
      });
      document
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((styleSheet) => {
          pipWindow.document.head.appendChild(styleSheet.cloneNode(true));
        });
      pipWindow.document.title = "DualSense Mini HUD";
      pipWindow.document.body.style.margin = "0";
      pipWindow.document.body.style.background = "#0d1322";

      const root = pipWindow.document.createElement("div");
      root.id = "pip-root";
      root.className = "pip-container";
      root.innerHTML = getPipTemplateHTML();
      pipWindow.document.body.appendChild(root);

      setupPipEvents(pipWindow.document, true);
      syncPipControls();

      pipWindow.addEventListener("pagehide", () => {
        stopAudioHapticsFromUi();
        pipWindow = null;
        btnPip.classList.remove("active");
      });

      btnPip.classList.add("active");
      log(t("logs.pipOpened"));
      return;
    } catch (err) {
      log(t("logs.pipFallback", { error: String(err) }));
    }
  }

  inPagePip.innerHTML = `<div class="pip-container">${getPipTemplateHTML()}</div>`;
  inPagePip.style.display = "flex";
  setupPipEvents(inPagePip, false);
  syncPipControls();
  btnPip.classList.add("active");
  log(t("logs.pipOverlayOpened"));
}

function updatePipUI(s) {
  const compactHud = document.getElementById("compact-hud");
  if (compactHud) updatePipTargetUI(s, compactHud);
  if (pipWindow && pipWindow.document) updatePipTargetUI(s, pipWindow.document);
  else if (inPagePip && inPagePip.style.display !== "none")
    updatePipTargetUI(s, inPagePip);
}

function updatePipTargetUI(s, doc) {
  if (!doc) return;
  const q = (id) =>
    doc.getElementById ? doc.getElementById(id) : doc.querySelector(`#${id}`);

  const elBat = q("pip-battery");
  if (elBat) elBat.textContent = `🔋 ${s.batteryLevel.toFixed(0)}%`;

  const elL1 = q("pip-btn-l1");
  if (elL1) elL1.classList.toggle("active", s.bLeftShoulder);
  const elL2Val = q("pip-l2-val");
  if (elL2Val) elL2Val.textContent = s.leftTriggerAnalog.toFixed(2);
  const elL2Bar = q("pip-l2-bar");
  if (elL2Bar)
    elL2Bar.style.width = `${Math.min(100, Math.max(0, s.leftTriggerAnalog * 100))}%`;

  const elR1 = q("pip-btn-r1");
  if (elR1) elR1.classList.toggle("active", s.bRightShoulder);
  const elR2Val = q("pip-r2-val");
  if (elR2Val) elR2Val.textContent = s.rightTriggerAnalog.toFixed(2);
  const elR2Bar = q("pip-r2-bar");
  if (elR2Bar)
    elR2Bar.style.width = `${Math.min(100, Math.max(0, s.rightTriggerAnalog * 100))}%`;

  q("pip-dpad-up")?.classList.toggle("active", s.bDpadUp);
  q("pip-dpad-down")?.classList.toggle("active", s.bDpadDown);
  q("pip-dpad-left")?.classList.toggle("active", s.bDpadLeft);
  q("pip-dpad-right")?.classList.toggle("active", s.bDpadRight);

  q("pip-btn-cross")?.classList.toggle("active", s.bCross);
  q("pip-btn-circle")?.classList.toggle("active", s.bCircle);
  q("pip-btn-square")?.classList.toggle("active", s.bSquare);
  q("pip-btn-triangle")?.classList.toggle("active", s.bTriangle);

  q("pip-btn-ps")?.classList.toggle("active", s.bPSButton);
  q("pip-btn-share")?.classList.toggle("active", s.bShare);
  q("pip-btn-options")?.classList.toggle("active", s.bStart);
  q("pip-btn-mute")?.classList.toggle("active", s.bMute);
  q("pip-btn-touch")?.classList.toggle("active", s.bTouch);

  const elL3 = q("pip-btn-l3");
  if (elL3) elL3.classList.toggle("active", s.bLeftStick);
  const elR3 = q("pip-btn-r3");
  if (elR3) elR3.classList.toggle("active", s.bRightStick);

  const elLdot = q("pip-lstick-dot");
  if (elLdot) {
    elLdot.style.transform = `translate(${s.leftAnalogX * 16}px, ${-s.leftAnalogY * 16}px)`;
    elLdot.classList.toggle("pressed", s.bLeftStick);
  }
  const elRdot = q("pip-rstick-dot");
  if (elRdot) {
    elRdot.style.transform = `translate(${s.rightAnalogX * 16}px, ${-s.rightAnalogY * 16}px)`;
    elRdot.classList.toggle("pressed", s.bRightStick);
  }

  const elLcoords = q("pip-lstick-coords");
  if (elLcoords)
    elLcoords.textContent = `${s.leftAnalogX.toFixed(1)}, ${s.leftAnalogY.toFixed(1)}`;
  const elRcoords = q("pip-rstick-coords");
  if (elRcoords)
    elRcoords.textContent = `${s.rightAnalogX.toFixed(1)}, ${s.rightAnalogY.toFixed(1)}`;
}

function makePath(d, idx) {
  return `webhid:${d.vendorId.toString(16)}:${d.productId.toString(16)}:${d.serialNumber || "noserial"}:${idx}`;
}

function pathToBytes(p) {
  const raw = new TextEncoder().encode(p);
  const fixed = new Uint8Array(PATH_SIZE);
  fixed.set(raw.subarray(0, PATH_SIZE - 1));
  return fixed;
}

function readPath(ptr) {
  let str = "";
  for (let i = 0; i < PATH_SIZE; i++) {
    const c = hostModule.getValue(ptr + i, "i8") & 0xff;
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function writeU64(ptr, value) {
  hostModule.setValue(ptr, value >>> 0, "i32");
  hostModule.setValue(ptr + 4, 0, "i32");
}

function writeI32(ptr, value) {
  if (!ptr) return;
  hostModule.setValue(ptr, value, "i32");
}

function cacheDevice(device) {
  if (device.vendorId !== SONY_VENDOR) return;
  const key = `${device.vendorId}:${device.productId}:${device.serialNumber || ""}`;
  if (
    cachedDevices.some(
      (d) => `${d.vendorId}:${d.productId}:${d.serialNumber || ""}` === key,
    )
  )
    return;
  cachedDevices.push(device);
}

function printStartupBanner() {
  if (bannerPrinted) return;
  bannerPrinted = true;
  log("=======================================================");
  log("           DUALSENSE INTEGRATION TEST");
  log("=======================================================");
}

const compactHud = document.getElementById("compact-hud");
if (compactHud) {
  compactHud.innerHTML = getPipTemplateHTML(false);
  setupPipEvents(compactHud, false);
}
const logCardHeader = document
  .getElementById("log-box")
  ?.closest(".card")
  ?.querySelector(".card-header");
if (logCardHeader && btnClearLogs) {
  logCardHeader.append(btnClearLogs);
}
syncPipControls();
applyTranslations(currentLocale);

import { uiTranslations } from "./dist/i18n/ui-translations.js";

const channel = new BroadcastChannel("dualsense_pip_controls");
const audio = document.getElementById("pip-audio");
const volume = document.getElementById("pip-volume");
const gain = document.getElementById("pip-gain");
const headsetOnly = document.getElementById("pip-headset-only");
const audioOnly = document.getElementById("pip-audio-only");
const rumbleReduce = document.getElementById("pip-rumble-reduce");
const volumeValue = document.getElementById("pip-volume-value");
const gainValue = document.getElementById("pip-gain-value");
const status = document.getElementById("status");
const locale = localStorage.getItem("dualsense_i18n_lang") || "en";
const dictionary = uiTranslations[locale] || uiTranslations.en;
const t = (key) =>
  key.split(".").reduce((value, part) => value && value[part], dictionary) ||
  key;

document.documentElement.lang = locale;
document.querySelectorAll("[data-i18n]").forEach((element) => {
  element.textContent = t(element.dataset.i18n);
});

audio.addEventListener("click", () => channel.postMessage({ type: "audio" }));

function sendSettings() {
  volumeValue.textContent = volume.value;
  gainValue.textContent = Number(gain.value).toFixed(1);
  channel.postMessage({
    type: "audio-settings",
    volume: volume.value,
    gain: gain.value,
    headsetOnly: headsetOnly.checked,
    audioOnly: audioOnly.checked,
    rumbleReduce: rumbleReduce.value,
  });
}

volume.addEventListener("input", sendSettings);
gain.addEventListener("input", sendSettings);
headsetOnly.addEventListener("change", sendSettings);
audioOnly.addEventListener("change", sendSettings);
rumbleReduce.addEventListener("input", sendSettings);

channel.addEventListener("message", (event) => {
  const state = event.data || {};
  if (state.type !== "state") return;

  audio.disabled = !state.hasController || !state.loopRunning;
  audio.classList.toggle("active", state.audioEnabled);
  audio.textContent = state.audioEnabled
    ? t("header.btnAudioHapticsOn")
    : t("header.btnAudioHaptics");
  if (document.activeElement !== volume) volume.value = state.audioVolume;
  if (document.activeElement !== gain) gain.value = state.audioGain;
  volumeValue.textContent = volume.value;
  gainValue.textContent = Number(gain.value).toFixed(1);
  status.textContent = state.loopRunning ? "" : t("status.inactive");
});

channel.postMessage({ type: "request-state" });

import { uiTranslations } from "./dist/i18n/ui-translations.js";

(function () {
  "use strict";

  const SONY_VENDOR = 0x054c;
  const button = document.getElementById("btn-request");
  const status = document.getElementById("status");
  const authorized = document.getElementById("authorized");
  const wasmStatus = document.getElementById("wasm-status");
  const locale = localStorage.getItem("dualsense_i18n_lang") || "en";
  const dictionary = uiTranslations[locale] || uiTranslations.en;
  const t = (key) =>
    key.split(".").reduce((value, part) => value && value[part], dictionary) ||
    key;
  document.documentElement.lang = locale;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  function saveDevices(devices) {
    const savedDevices = devices.map((device) => ({
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
    localStorage.setItem(
      "dualsense_hid_authorized_at",
      new Date().toISOString(),
    );
  }

  function showDevices(devices) {
    if (!devices.length) {
      authorized.textContent = t("options.none");
      return;
    }
    authorized.textContent = `${t("options.authorized")}: ${devices.map((device) => device.productName || "DualSense").join(", ")}`;
  }

  async function refreshDevices() {
    if (!("hid" in navigator))
      throw new Error("WebHID is not supported by this browser.");
    const devices = (await navigator.hid.getDevices()).filter(
      (device) => device.vendorId === SONY_VENDOR,
    );
    saveDevices(devices);
    showDevices(devices);
  }

  window.addEventListener("load", async () => {
    try {
      if (typeof window.InitGamepadCoreHost !== "function")
        throw new Error("WASM engine was not found.");
      await window.InitGamepadCoreHost({
        locateFile: (path) => `../src/lib/${path}`,
      });
      wasmStatus.textContent = t("options.loaded");
      await refreshDevices();
    } catch (error) {
      wasmStatus.textContent = `${t("options.error")}: ${error.message || error}`;
    }
  });

  button.addEventListener("click", async () => {
    try {
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: SONY_VENDOR }],
      });
      if (!devices.length) return;
      await refreshDevices();
      status.textContent = `${t("options.paired")}: ${devices.map((device) => device.productName || "DualSense").join(", ")}. ${t("options.closeHint")}`;
    } catch (error) {
      status.textContent = `${t("options.error")}: ${error.message || error}`;
    }
  });
})();

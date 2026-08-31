import { uiTranslations } from "./dist/i18n/ui-translations.js";

const locale = localStorage.getItem("dualsense_i18n_lang") || "en";
const dictionary = uiTranslations[locale] || uiTranslations.en;
const t = (key) =>
  key.split(".").reduce((value, part) => value && value[part], dictionary) ||
  key;
document.documentElement.lang = locale;
document.querySelectorAll("[data-i18n]").forEach((element) => {
  element.textContent = t(element.dataset.i18n);
});

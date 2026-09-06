import i18n from "./i18n/index.js";
const LANG_STORAGE_KEY = "dualsense_lang";
export function updateDOMTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (key) {
            el.innerHTML = i18n.t(key);
        }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) {
            el.placeholder = i18n.t(key);
        }
    });
}
export function initTranslations() {
    let savedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (!savedLang) {
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith("pt"))
            savedLang = "pt-BR";
        else if (browserLang.startsWith("es"))
            savedLang = "es";
        else
            savedLang = "en"; // Fallback padrão
    }
    i18n.setLanguage(savedLang);
    i18n.onLanguageChange((newLocale) => {
        localStorage.setItem(LANG_STORAGE_KEY, newLocale);
        updateDOMTranslations();
    });
    updateDOMTranslations();
    const langSelect = document.getElementById("sel-language");
    if (langSelect) {
        langSelect.value = savedLang;
        langSelect.addEventListener("change", (e) => {
            const selectedLang = e.target.value;
            i18n.setLanguage(selectedLang);
        });
    }
}

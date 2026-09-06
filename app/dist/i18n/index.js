import { en } from "./locales/en.js";
import { ptBR } from "./locales/pt-BR.js";
import { es } from "./locales/es.js";
export * from "./types.js";
export const translations = {
    en,
    "pt-BR": ptBR,
    es,
};
export const DEFAULT_LOCALE = "en";
let currentLocale = DEFAULT_LOCALE;
const changeListeners = new Set();
/**
 * Get the currently active locale code.
 */
export function getLanguage() {
    return currentLocale;
}
/**
 * Set the current active locale and trigger all registered change listeners.
 */
export function setLanguage(locale) {
    if (!translations[locale]) {
        console.warn(`[i18n] Locale "${locale}" is not supported. Keeping "${currentLocale}".`);
        return false;
    }
    if (currentLocale !== locale) {
        currentLocale = locale;
        for (const listener of changeListeners) {
            try {
                listener(currentLocale);
            }
            catch (err) {
                console.error("[i18n] Error in language change listener:", err);
            }
        }
    }
    return true;
}
/**
 * Register a callback for language changes.
 * @returns Unsubscribe function.
 */
export function onLanguageChange(listener) {
    changeListeners.add(listener);
    return () => {
        changeListeners.delete(listener);
    };
}
/**
 * Get available supported languages.
 */
export function getSupportedLanguages() {
    return [
        { code: "en", name: "English", flag: "🇺🇸" },
        { code: "pt-BR", name: "Português (BR)", flag: "🇧🇷" },
        { code: "es", name: "Español", flag: "🇪🇸" },
    ];
}
/**
 * Get translation dictionary for active or specified locale.
 */
export function getDictionary(locale = currentLocale) {
    return translations[locale] ?? translations[DEFAULT_LOCALE];
}
/**
 * Translates a dot-separated key (e.g., 'header.title' or 'commands.cross')
 * with optional parameter replacement (e.g. {{name}}).
 */
export function t(keyPath, params, locale = currentLocale) {
    const dict = translations[locale] ?? translations[DEFAULT_LOCALE];
    const keys = keyPath.split(".");
    let current = dict;
    for (const k of keys) {
        if (current && typeof current === "object" && k in current) {
            current = current[k];
        }
        else {
            // Fallback to default locale (English)
            current = undefined;
            break;
        }
    }
    if (current === undefined && locale !== DEFAULT_LOCALE) {
        let fallback = translations[DEFAULT_LOCALE];
        for (const k of keys) {
            if (fallback && typeof fallback === "object" && k in fallback) {
                fallback = fallback[k];
            }
            else {
                fallback = undefined;
                break;
            }
        }
        current = fallback;
    }
    if (typeof current !== "string") {
        return keyPath;
    }
    if (params) {
        return current.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, varName) => {
            return varName in params ? String(params[varName]) : `{{${varName}}}`;
        });
    }
    return current;
}
export const i18n = {
    getLanguage,
    setLanguage,
    onLanguageChange,
    getSupportedLanguages,
    getDictionary,
    t,
    translations,
    DEFAULT_LOCALE,
};
export default i18n;

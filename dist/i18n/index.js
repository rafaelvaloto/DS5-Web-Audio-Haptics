"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.i18n = exports.DEFAULT_LOCALE = exports.translations = void 0;
exports.getLanguage = getLanguage;
exports.setLanguage = setLanguage;
exports.onLanguageChange = onLanguageChange;
exports.getSupportedLanguages = getSupportedLanguages;
exports.getDictionary = getDictionary;
exports.t = t;
const en_ts_1 = require("./locales/en.js");
const pt_BR_ts_1 = require("./locales/pt-BR.js");
const es_ts_1 = require("./locales/es.js");
__exportStar(require("./types.js"), exports);
exports.translations = {
    en: en_ts_1.en,
    "pt-BR": pt_BR_ts_1.ptBR,
    es: es_ts_1.es,
};
exports.DEFAULT_LOCALE = "en";
let currentLocale = exports.DEFAULT_LOCALE;
const changeListeners = new Set();
/**
 * Get the currently active locale code.
 */
function getLanguage() {
    return currentLocale;
}
/**
 * Set the current active locale and trigger all registered change listeners.
 */
function setLanguage(locale) {
    if (!exports.translations[locale]) {
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
function onLanguageChange(listener) {
    changeListeners.add(listener);
    return () => {
        changeListeners.delete(listener);
    };
}
/**
 * Get available supported languages.
 */
function getSupportedLanguages() {
    return [
        { code: "en", name: "English", flag: "🇺🇸" },
        { code: "pt-BR", name: "Português (BR)", flag: "🇧🇷" },
        { code: "es", name: "Español", flag: "🇪🇸" },
    ];
}
/**
 * Get translation dictionary for active or specified locale.
 */
function getDictionary(locale = currentLocale) {
    var _a;
    return (_a = exports.translations[locale]) !== null && _a !== void 0 ? _a : exports.translations[exports.DEFAULT_LOCALE];
}
/**
 * Translates a dot-separated key (e.g., 'header.title' or 'commands.cross')
 * with optional parameter replacement (e.g. {{name}}).
 */
function t(keyPath, params, locale = currentLocale) {
    var _a;
    const dict = (_a = exports.translations[locale]) !== null && _a !== void 0 ? _a : exports.translations[exports.DEFAULT_LOCALE];
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
    if (current === undefined && locale !== exports.DEFAULT_LOCALE) {
        let fallback = exports.translations[exports.DEFAULT_LOCALE];
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
exports.i18n = {
    getLanguage,
    setLanguage,
    onLanguageChange,
    getSupportedLanguages,
    getDictionary,
    t,
    translations: exports.translations,
    DEFAULT_LOCALE: exports.DEFAULT_LOCALE,
};
exports.default = exports.i18n;

import { en } from "./locales/en.ts";
import { ptBR } from "./locales/pt-BR.ts";
import { es } from "./locales/es.ts";
import type { SupportedLocale, TranslationDictionary } from "./types.ts";

export * from "./types.ts";

export const translations: Record<SupportedLocale, TranslationDictionary> = {
  en,
  "pt-BR": ptBR,
  es,
};

export const DEFAULT_LOCALE: SupportedLocale = "en";

let currentLocale: SupportedLocale = DEFAULT_LOCALE;
const changeListeners: Set<(locale: SupportedLocale) => void> = new Set();

/**
 * Get the currently active locale code.
 */
export function getLanguage(): SupportedLocale {
  return currentLocale;
}

/**
 * Set the current active locale and trigger all registered change listeners.
 */
export function setLanguage(locale: SupportedLocale): boolean {
  if (!translations[locale]) {
    console.warn(`[i18n] Locale "${locale}" is not supported. Keeping "${currentLocale}".`);
    return false;
  }
  if (currentLocale !== locale) {
    currentLocale = locale;
    for (const listener of changeListeners) {
      try {
        listener(currentLocale);
      } catch (err) {
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
export function onLanguageChange(listener: (locale: SupportedLocale) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Get available supported languages.
 */
export function getSupportedLanguages(): Array<{ code: SupportedLocale; name: string; flag: string }> {
  return [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "pt-BR", name: "Português (BR)", flag: "🇧🇷" },
    { code: "es", name: "Español", flag: "🇪🇸" },
  ];
}

/**
 * Get translation dictionary for active or specified locale.
 */
export function getDictionary(locale: SupportedLocale = currentLocale): TranslationDictionary {
  return translations[locale] ?? translations[DEFAULT_LOCALE];
}

/**
 * Translates a dot-separated key (e.g., 'header.title' or 'commands.cross')
 * with optional parameter replacement (e.g. {{name}}).
 */
export function t(keyPath: string, params?: Record<string, string | number>, locale: SupportedLocale = currentLocale): string {
  const dict = translations[locale] ?? translations[DEFAULT_LOCALE];
  const keys = keyPath.split(".");
  let current: any = dict;

  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = current[k];
    } else {
      // Fallback to default locale (English)
      current = undefined;
      break;
    }
  }

  if (current === undefined && locale !== DEFAULT_LOCALE) {
    let fallback: any = translations[DEFAULT_LOCALE];
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

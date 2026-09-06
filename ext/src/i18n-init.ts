import i18n, { SupportedLocale } from "./i18n/index.ts";

const LANG_STORAGE_KEY = "dualsense_lang";

export function updateDOMTranslations(): void {
	// 1. Traduz os textos normais (textContent)
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		if (key) {
			el.textContent = i18n.t(key);
		}
	});

	// 2. Traduz os placeholders dos inputs
	document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
		const key = el.getAttribute("data-i18n-placeholder");
		if (key) {
			(el as HTMLInputElement).placeholder = i18n.t(key);
		}
	});
}

export function initTranslations(): void {
	// 1. Tenta recuperar do localStorage
	let savedLang = localStorage.getItem(LANG_STORAGE_KEY) as SupportedLocale | null;

	// 2. Se não houver salvo, detecta o idioma do navegador
	if (!savedLang) {
		const browserLang = navigator.language.toLowerCase();
		if (browserLang.startsWith("pt")) savedLang = "pt-BR";
		else if (browserLang.startsWith("es")) savedLang = "es";
		else savedLang = "en"; // Fallback padrão
	}

	// 3. Aplica o idioma no sistema i18n
	i18n.setLanguage(savedLang);

	// 4. Registra um ouvinte global: sempre que o idioma mudar, salva no localStorage e atualiza a tela
	i18n.onLanguageChange((newLocale) => {
		localStorage.setItem(LANG_STORAGE_KEY, newLocale);
		updateDOMTranslations();
	});

	// 5. Faz a primeira tradução da tela imediatamente
	updateDOMTranslations();

	// 6. Sincroniza o seletor de idiomas do HTML (se ele existir na página atual)
	const langSelect = document.getElementById("sel-language") as HTMLSelectElement | null;
	if (langSelect) {
		langSelect.value = savedLang;
		langSelect.addEventListener("change", (e) => {
			const selectedLang = (e.target as HTMLSelectElement).value as SupportedLocale;
			i18n.setLanguage(selectedLang);
		});
	}
}

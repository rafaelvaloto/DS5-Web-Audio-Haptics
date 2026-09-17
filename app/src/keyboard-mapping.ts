import { initTranslations } from "./i18n-init.ts";
import i18n from "./i18n/index.ts";
import {
	DEFAULT_KEYBOARD_BINDINGS,
	KEYBOARD_BINDING_DEFINITIONS,
	MOUSE_BINDING_CODES,
	loadKeyboardBindings,
	saveKeyboardBindings,
	type KeyboardBindingAction,
} from "./keyboard-bindings.ts";

let listeningAction: KeyboardBindingAction | null = null;

document.addEventListener("DOMContentLoaded", () => {
	initTranslations();
	renderBindingButtons(loadKeyboardBindings());
});

(document.getElementById("btn-reset-bindings") as HTMLButtonElement | null)?.addEventListener("click", () => {
	saveKeyboardBindings(DEFAULT_KEYBOARD_BINDINGS);
	renderBindingButtons(DEFAULT_KEYBOARD_BINDINGS);
});

window.addEventListener("keydown", (event) => {
	if (!listeningAction) return;

	event.preventDefault();

	if (event.code === "Escape") {
		stopListening();
		return;
	}

	if (event.code === "Backspace" || event.code === "Delete") {
		updateBinding(listeningAction, "");
		return;
	}

	updateBinding(listeningAction, event.code);
});

window.addEventListener("mousedown", (event) => {
	if (!listeningAction) return;
	event.preventDefault();
	const code = event.button === 0 ? "MouseLeft" : event.button === 1 ? "MouseMiddle" : event.button === 2 ? "MouseRight" : null;
	if (!code) return;
	updateBinding(listeningAction, code);
});

window.addEventListener("wheel", (event) => {
	if (!listeningAction) return;
	event.preventDefault();
	updateBinding(listeningAction, event.deltaY < 0 ? "MouseWheelUp" : "MouseWheelDown");
}, { passive: false });

function renderBindingButtons(bindings = loadKeyboardBindings()): void {
	const container = document.getElementById("keyboard-binding-list");
	if (!container) return;

	container.innerHTML = "";

	for (const definition of KEYBOARD_BINDING_DEFINITIONS) {
		const row = document.createElement("div");
		row.className = "binding-row";

		const label = document.createElement("span");
		label.className = "binding-label";
		label.textContent = i18n.t(definition.labelKey);

		const button = document.createElement("button");
		button.type = "button";
		button.className = "binding-button";
		button.dataset.action = definition.action;
		button.textContent = bindings[definition.action] || i18n.t("keyboardMapping.unassigned");
		button.addEventListener("click", () => startListening(definition.action));

		row.append(label, button);
		container.appendChild(row);
	}
}

function startListening(action: KeyboardBindingAction): void {
	listeningAction = action;
	for (const element of document.querySelectorAll<HTMLButtonElement>(".binding-button")) {
		const isCurrent = element.dataset.action === action;
		element.classList.toggle("listening", isCurrent);
		if (isCurrent) element.textContent = i18n.t("keyboardMapping.pressAnyKey");
	}
}

function stopListening(): void {
	listeningAction = null;
	renderBindingButtons(loadKeyboardBindings());
}

function updateBinding(action: KeyboardBindingAction, code: string): void {
	const bindings = loadKeyboardBindings();
	bindings[action] = code;
	saveKeyboardBindings(bindings);
	stopListening();
}

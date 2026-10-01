import { initTranslations } from "./i18n-init.ts";
import i18n from "./i18n/index.ts";
import {
	DEFAULT_KEYBOARD_BINDINGS,
	cloneDefaultGyroscopeMapping,
	KEYBOARD_BINDING_DEFINITIONS,
	loadGyroscopeMapping,
	loadKeyboardBindings,
	saveGyroscopeMapping,
	saveKeyboardBindings,
	type GyroscopeKeyboardBinding,
	type GyroscopeMapping,
	type KeyboardBindingAction,
} from "./keyboard-bindings.ts";

type ListeningTarget =
	| { kind: "controller"; action: KeyboardBindingAction }
	| { kind: "gyroscope"; action: GyroscopeKeyboardBinding };

const GYROSCOPE_BINDINGS: Array<{ action: GyroscopeKeyboardBinding; labelKey: string }> = [
	{ action: "pitchUp", labelKey: "keyboardMapping.gyroscopePitchUp" },
	{ action: "pitchDown", labelKey: "keyboardMapping.gyroscopePitchDown" },
	{ action: "lateralLeft", labelKey: "keyboardMapping.gyroscopeLateralLeft" },
	{ action: "lateralRight", labelKey: "keyboardMapping.gyroscopeLateralRight" },
];

let listeningTarget: ListeningTarget | null = null;

document.addEventListener("DOMContentLoaded", () => {
	initTranslations();
	renderBindingButtons(loadKeyboardBindings());
	initializeGyroscopeControls();

	document.getElementById("btn-reset-bindings")?.addEventListener("click", () => {
		saveKeyboardBindings(DEFAULT_KEYBOARD_BINDINGS);
		const gyroscopeMapping = cloneDefaultGyroscopeMapping();
		saveGyroscopeMapping(gyroscopeMapping);
		renderBindingButtons(DEFAULT_KEYBOARD_BINDINGS);
		applyGyroscopeMappingToControls(gyroscopeMapping);
	});
});

window.addEventListener("keydown", (event) => {
	if (!listeningTarget) return;

	event.preventDefault();

	if (event.code === "Escape") {
		stopListening();
		return;
	}

	if (event.code === "Backspace" || event.code === "Delete") {
		updateListeningBinding("");
		return;
	}

	updateListeningBinding(event.code);
});

window.addEventListener("mousedown", (event) => {
	if (!listeningTarget || listeningTarget.kind === "gyroscope") return;
	event.preventDefault();
	const code = event.button === 0 ? "MouseLeft" : event.button === 1 ? "MouseMiddle" : event.button === 2 ? "MouseRight" : null;
	if (!code) return;
	updateListeningBinding(code);
});

window.addEventListener("wheel", (event) => {
	if (!listeningTarget || listeningTarget.kind === "gyroscope") return;
	event.preventDefault();
	updateListeningBinding(event.deltaY < 0 ? "MouseWheelUp" : "MouseWheelDown");
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
		button.dataset.bindingKind = "controller";
		button.addEventListener("click", () => startListening({ kind: "controller", action: definition.action }));

		row.append(label, button);
		container.appendChild(row);
	}
}

function startListening(target: ListeningTarget): void {
	listeningTarget = target;
	for (const element of document.querySelectorAll<HTMLButtonElement>(".binding-button")) {
		const isCurrent = element.dataset.action === target.action && element.dataset.bindingKind === target.kind;
		element.classList.toggle("listening", isCurrent);
		if (isCurrent) element.textContent = i18n.t("keyboardMapping.pressAnyKey");
	}
}

function stopListening(): void {
	listeningTarget = null;
	renderBindingButtons(loadKeyboardBindings());
	renderGyroscopeBindingButtons(loadGyroscopeMapping());
}

function updateListeningBinding(code: string): void {
	if (!listeningTarget) return;
	if (listeningTarget.kind === "controller") {
		const bindings = loadKeyboardBindings();
		bindings[listeningTarget.action] = code;
		saveKeyboardBindings(bindings);
	} else {
		const mapping = loadGyroscopeMapping();
		mapping.bindings[listeningTarget.action] = code;
		saveGyroscopeMapping(mapping);
	}
	stopListening();
}

function initializeGyroscopeControls(): void {
	const enabled = document.getElementById("gyro-enabled") as HTMLInputElement | null;
	const output = document.getElementById("gyro-output") as HTMLSelectElement | null;
	const lateralAxis = document.getElementById("gyro-lateral-axis") as HTMLSelectElement | null;
	const gamepadStick = document.getElementById("gyro-gamepad-stick") as HTMLSelectElement | null;
	if (!enabled || !output || !lateralAxis || !gamepadStick) return;

	applyGyroscopeMappingToControls(loadGyroscopeMapping());
	enabled.addEventListener("change", () => updateGyroscopeMappingFromControls());
	output.addEventListener("change", () => updateGyroscopeMappingFromControls());
	lateralAxis.addEventListener("change", () => updateGyroscopeMappingFromControls());
	gamepadStick.addEventListener("change", () => updateGyroscopeMappingFromControls());
}

function updateGyroscopeMappingFromControls(): void {
	const mapping = loadGyroscopeMapping();
	mapping.enabled = (document.getElementById("gyro-enabled") as HTMLInputElement).checked;
	const output = (document.getElementById("gyro-output") as HTMLSelectElement).value;
	mapping.output = output === "mouse" || output === "gamepad" ? output : "keyboard";
	mapping.lateralAxis = (document.getElementById("gyro-lateral-axis") as HTMLSelectElement).value === "roll"
		? "roll"
		: "yaw";
	mapping.gamepadStick = (document.getElementById("gyro-gamepad-stick") as HTMLSelectElement).value === "left"
		? "left"
		: "right";
	saveGyroscopeMapping(mapping);
	applyGyroscopeMappingToControls(mapping);
}

function applyGyroscopeMappingToControls(mapping: GyroscopeMapping): void {
	(document.getElementById("gyro-enabled") as HTMLInputElement).checked = mapping.enabled;
	(document.getElementById("gyro-output") as HTMLSelectElement).value = mapping.output;
	(document.getElementById("gyro-lateral-axis") as HTMLSelectElement).value = mapping.lateralAxis;
	(document.getElementById("gyro-gamepad-stick") as HTMLSelectElement).value = mapping.gamepadStick;

	const isKeyboard = mapping.output === "keyboard";
	const isGamepad = mapping.output === "gamepad";
	(document.getElementById("gyro-settings") as HTMLElement).hidden = !mapping.enabled;
	(document.getElementById("gyro-lateral-field") as HTMLElement).hidden = mapping.output === "mouse";
	(document.getElementById("gyro-gamepad-stick-field") as HTMLElement).hidden = !isGamepad;
	(document.getElementById("gyro-keyboard-bindings") as HTMLElement).hidden = !isKeyboard;
	const hint = document.getElementById("gyro-mode-hint");
	if (hint) {
		hint.textContent = i18n.t(isKeyboard
			? "keyboardMapping.gyroscopeKeyboardHint"
			: isGamepad
				? "keyboardMapping.gyroscopeGamepadHint"
				: "keyboardMapping.gyroscopeMouseHint");
	}
	renderGyroscopeBindingButtons(mapping);
}

function renderGyroscopeBindingButtons(mapping: GyroscopeMapping): void {
	const container = document.getElementById("gyro-keyboard-bindings");
	if (!container) return;
	container.innerHTML = "";
	for (const definition of GYROSCOPE_BINDINGS) {
		const row = document.createElement("div");
		row.className = "binding-row";
		const label = document.createElement("span");
		label.className = "binding-label";
		label.textContent = i18n.t(definition.labelKey);
		const button = document.createElement("button");
		button.type = "button";
		button.className = "binding-button";
		button.dataset.action = definition.action;
		button.dataset.bindingKind = "gyroscope";
		button.textContent = mapping.bindings[definition.action] || i18n.t("keyboardMapping.unassigned");
		button.addEventListener("click", () => startListening({ kind: "gyroscope", action: definition.action }));
		row.append(label, button);
		container.appendChild(row);
	}
}

import type { state_t } from "./types.ts";

export type KeyboardBindingAction =
	| "leftAnalogUp"
	| "leftAnalogDown"
	| "leftAnalogLeft"
	| "leftAnalogRight"
	| "dpadUp"
	| "dpadDown"
	| "dpadLeft"
	| "dpadRight"
	| "cross"
	| "circle"
	| "square"
	| "triangle"
	| "leftShoulder"
	| "rightShoulder"
	| "leftTrigger"
	| "rightTrigger"
	| "start"
	| "share";

export type KeyboardBindingMap = Record<KeyboardBindingAction, string>;

export type KeyboardBindingDefinition = {
	action: KeyboardBindingAction;
	isPressed: (state: state_t) => boolean;
	labelKey: string;
};

export const KEYBOARD_BINDINGS_STORAGE_KEY = "dualsense_keyboard_bindings";
export const MOUSE_BINDING_CODES = ["MouseLeft", "MouseRight", "MouseMiddle", "MouseWheelUp", "MouseWheelDown"] as const;
export type MouseBindingCode = typeof MOUSE_BINDING_CODES[number];

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindingMap = {
	leftAnalogUp: "KeyW",
	leftAnalogDown: "KeyS",
	leftAnalogLeft: "KeyA",
	leftAnalogRight: "KeyD",
	dpadUp: "Numpad8",
	dpadDown: "Numpad2",
	dpadLeft: "Numpad4",
	dpadRight: "Numpad6",
	cross: "Space",
	circle: "ShiftLeft",
	square: "ControlLeft",
	triangle: "KeyR",
	leftShoulder: "KeyQ",
	rightShoulder: "KeyE",
	leftTrigger: "",
	rightTrigger: "",
	start: "Enter",
	share: "Escape",
};

export const KEYBOARD_BINDING_DEFINITIONS: KeyboardBindingDefinition[] = [
	{ action: "leftAnalogUp", isPressed: (state) => state.bLeftAnalogUp, labelKey: "keyboardMapping.leftAnalogUp" },
	{ action: "leftAnalogDown", isPressed: (state) => state.bLeftAnalogDown, labelKey: "keyboardMapping.leftAnalogDown" },
	{ action: "leftAnalogLeft", isPressed: (state) => state.bLeftAnalogLeft, labelKey: "keyboardMapping.leftAnalogLeft" },
	{ action: "leftAnalogRight", isPressed: (state) => state.bLeftAnalogRight, labelKey: "keyboardMapping.leftAnalogRight" },
	{ action: "dpadUp", isPressed: (state) => state.bDpadUp, labelKey: "keyboardMapping.dpadUp" },
	{ action: "dpadDown", isPressed: (state) => state.bDpadDown, labelKey: "keyboardMapping.dpadDown" },
	{ action: "dpadLeft", isPressed: (state) => state.bDpadLeft, labelKey: "keyboardMapping.dpadLeft" },
	{ action: "dpadRight", isPressed: (state) => state.bDpadRight, labelKey: "keyboardMapping.dpadRight" },
	{ action: "cross", isPressed: (state) => state.bCross, labelKey: "keyboardMapping.cross" },
	{ action: "circle", isPressed: (state) => state.bCircle, labelKey: "keyboardMapping.circle" },
	{ action: "square", isPressed: (state) => state.bSquare, labelKey: "keyboardMapping.square" },
	{ action: "triangle", isPressed: (state) => state.bTriangle, labelKey: "keyboardMapping.triangle" },
	{ action: "leftShoulder", isPressed: (state) => state.bLeftShoulder, labelKey: "keyboardMapping.leftShoulder" },
	{ action: "rightShoulder", isPressed: (state) => state.bRightShoulder, labelKey: "keyboardMapping.rightShoulder" },
	{ action: "leftTrigger", isPressed: () => false, labelKey: "keyboardMapping.leftTrigger" },
	{ action: "rightTrigger", isPressed: () => false, labelKey: "keyboardMapping.rightTrigger" },
	{ action: "start", isPressed: (state) => state.bStart, labelKey: "keyboardMapping.start" },
	{ action: "share", isPressed: (state) => state.bShare, labelKey: "keyboardMapping.share" },
];

export function loadKeyboardBindings(): KeyboardBindingMap {
	try {
		const raw = localStorage.getItem(KEYBOARD_BINDINGS_STORAGE_KEY);
		if (!raw) return { ...DEFAULT_KEYBOARD_BINDINGS };
		const parsed = JSON.parse(raw) as Partial<KeyboardBindingMap>;
		return mergeKeyboardBindings(parsed);
	} catch {
		return { ...DEFAULT_KEYBOARD_BINDINGS };
	}
}

export function saveKeyboardBindings(bindings: KeyboardBindingMap): void {
	localStorage.setItem(KEYBOARD_BINDINGS_STORAGE_KEY, JSON.stringify(bindings));
}

export function mergeKeyboardBindings(bindings: Partial<KeyboardBindingMap>): KeyboardBindingMap {
	const merged = { ...DEFAULT_KEYBOARD_BINDINGS };
	for (const entry of KEYBOARD_BINDING_DEFINITIONS) {
		const value = bindings[entry.action];
		if (typeof value === "string") merged[entry.action] = value;
	}
	return merged;
}

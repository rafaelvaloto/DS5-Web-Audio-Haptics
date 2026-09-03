export const MAX_LOG_LINES = 150;
export const logLines: string[] = [];
export const FRAME_MS = 10;
export const FRAME_SECONDS = 0.01;
export const SONY_VENDOR = 0x054c;
export const DEVICE_TYPE_BY_PRODUCT_ID: Record<number, number> = {
	0x0ce6: 1, // DualSense
	0x0df2: 2, // DualSense Edge
};
export const OFFSET_HANDLE = 0;
export const OFFSET_DEVICE_TYPE = 8;
export const OFFSET_CONNECTION_TYPE = 12;
export const OFFSET_IS_CONNECTED = 16;
export const OFFSET_PATH = 20;
export const SIZE_PATH = 512;
export const CONNECTION_TYPE = 1;
export const DESCRIPTOR_SIZE = 532;
export const INPUT_DESCRIPTOR_SIZE = 148;
export const SONY_VENDOR_ID = 0x054c;

export const FEEDBACK = new Uint8Array([0x21, 0xfe, 0x03, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x00, 0x00]);
export const WEAPON_GUN = new Uint8Array([0x25, 0x08, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
export const BOW = new Uint8Array([0x22, 0x02, 0x01, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
export const AUTOMATIC_GUN = new Uint8Array([0x26, 0x00, 0x03, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x0a]);
export const GAMECUBE = new Uint8Array([0x25, 0x90, 0x02, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
export const NONE = new Uint8Array([0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0]);

export const TRIGGERS: Record<string, Uint8Array | null> = {
	none: NONE,
	bow: BOW,
	feedback: FEEDBACK,
	gamecube: GAMECUBE,
	weapon: WEAPON_GUN,
	autogun: AUTOMATIC_GUN,
};

export const VIRTUAL_GAMEPAD = {
	DPAD_UP: 1 << 0,
	DPAD_DOWN: 1 << 1,
	DPAD_LEFT: 1 << 2,
	DPAD_RIGHT: 1 << 3,
	START: 1 << 4,
	BACK: 1 << 5,
	LEFT_THUMB: 1 << 6,
	RIGHT_THUMB: 1 << 7,
	LEFT_SHOULDER: 1 << 8,
	RIGHT_SHOULDER: 1 << 9,
	GUIDE: 1 << 10,
	A: 1 << 12,
	B: 1 << 13,
	X: 1 << 14,
	Y: 1 << 15,
} as const;

export const DEFAULT_INPUT_SERVER_URL = "ws://localhost:26760";

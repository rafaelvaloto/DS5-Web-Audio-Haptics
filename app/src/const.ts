export const MAX_LOG_LINES = 150;
export const logLines: string[] = [];
export const FRAME_MS = 10;
export const FRAME_SECONDS = 0.01;
export const SONY_VENDOR_ID = 0x054c;
export const INPUT_DESCRIPTOR_SIZE = 148;
export const NONE = new Uint8Array([0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0]);
export const TRIGGERS: Record<string, Uint8Array | null> = {
	none: NONE,
};

export const FRAME_MS = 10;
export const FRAME_SECONDS = 0.01;
export const SONY_VENDOR_ID = 0x054c;
export const INPUT_DESCRIPTOR_SIZE = 148;
export const STANDARD_HID_BUFFER_SIZE = 78;
export const DUALSHOCK4_BLUETOOTH_BUFFER_SIZE = 547;

export const USB_CONNECTION_TYPE = 0;
export const BLUETOOTH_CONNECTION_TYPE = 1;

export const DUALSENSE_DEVICE_TYPE = 0;
export const DUALSENSE_EDGE_DEVICE_TYPE = 1;
export const DUALSHOCK4_DEVICE_TYPE = 2;

export const SONY_HID_FILTERS = [
	{ vendorId: SONY_VENDOR_ID, productId: 0x0ce6 },
	{ vendorId: SONY_VENDOR_ID, productId: 0x0df2 },
	{ vendorId: SONY_VENDOR_ID, productId: 0x05c4 },
	{ vendorId: SONY_VENDOR_ID, productId: 0x09cc },
] as const;

export function getSonyDeviceType(productId: number): number {
	if (productId === 0x05c4 || productId === 0x09cc) {
		return DUALSHOCK4_DEVICE_TYPE;
	}
	if (productId === 0x0df2) {
		return DUALSENSE_EDGE_DEVICE_TYPE;
	}
	return DUALSENSE_DEVICE_TYPE;
}

export function getSonyConnectionType(device: HIDDevice): number {
	const reportIds = new Set<number>();
	const collectReportIds = (collections: HIDCollectionInfo[]): void => {
		for (const collection of collections) {
			for (const report of collection.inputReports ?? []) {
				if (typeof report.reportId === "number") reportIds.add(report.reportId);
			}
			if (collection.children?.length) collectReportIds(collection.children);
		}
	};

	collectReportIds(device.collections);
	if (reportIds.has(0x11) || reportIds.has(0x31)) return BLUETOOTH_CONNECTION_TYPE;
	if (reportIds.has(0x01)) return USB_CONNECTION_TYPE;
	return BLUETOOTH_CONNECTION_TYPE;
}

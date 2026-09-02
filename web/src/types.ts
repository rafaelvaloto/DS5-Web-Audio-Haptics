/**
 * @file types.ts
 * @description This file contains the type definitions for the HID device manager.
 */
export type Descriptor = {
    path: string;
    deviceType: number;
    device: HIDDevice;
    handleId: number;
    lastInputPacket: Uint8Array;
    inputListener?: (event: HIDInputReportEvent) => void;
};

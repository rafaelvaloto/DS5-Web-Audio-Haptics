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

/**
 * Represents the complete input state of a PlayStation controller device.
 *
 * This interface contains all input data from a PlayStation controller including:
 * - Analog stick positions and trigger values
 * - Motion sensor data (gyroscope, accelerometer, gravity, tilt)
 * - Touchpad state and touch position information
 * - Button states for all face buttons, d-pad, shoulders, triggers, and special buttons
 * - Device status information (battery level, headphone connection)
 * - Additional features for DualSense Edge (paddles, function buttons)
 *
 * The state is updated every frame during the input processing cycle and represents
 * the current snapshot of all controller inputs at a given moment.
 */
export interface state_t {
	analogDeadZone: number;

	leftAnalogX: number;
	leftAnalogY: number;
	rightAnalogX: number;
	rightAnalogY: number;
	leftTriggerAnalog: number;
	rightTriggerAnalog: number;

	gyroscopeX: number;
	gyroscopeY: number;
	gyroscopeZ: number;

	accelerometerX: number;
	accelerometerY: number;
	accelerometerZ: number;

	gravityX: number;
	gravityY: number;
	gravityZ: number;

	tiltX: number;
	tiltY: number;
	tiltZ: number;

	touchId: number;
	touchFingerCount: number;
	directionRaw: number;
	bIsTouching: boolean;

	touchRadiusX: number;
	touchRadiusY: number;
	touchPositionX: number;
	touchPositionY: number;
	touchRelativeX: number;
	touchRelativeY: number;

	bCross: boolean;
	bSquare: boolean;
	bTriangle: boolean;
	bCircle: boolean;
	bDpadUp: boolean;
	bDpadDown: boolean;
	bDpadLeft: boolean;
	bDpadRight: boolean;

	bLeftAnalogRight: boolean;
	bLeftAnalogUp: boolean;
	bLeftAnalogDown: boolean;
	bLeftAnalogLeft: boolean;
	bRightAnalogLeft: boolean;
	bRightAnalogDown: boolean;
	bRightAnalogUp: boolean;
	bRightAnalogRight: boolean;

	bLeftTriggerThreshold: boolean;
	bRightTriggerThreshold: boolean;
	bLeftShoulder: boolean;
	bRightShoulder: boolean;
	bLeftStick: boolean;
	bRightStick: boolean;
	bPSButton: boolean;
	bShare: boolean;
	bStart: boolean;
	bTouch: boolean;
	bMute: boolean;
	bHasPhoneConnected: boolean;

	bFn1: boolean;
	bFn2: boolean;
	bPaddleLeft: boolean;
	bPaddleRight: boolean;

	batteryLevel: number;
}

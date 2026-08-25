# 🎮 Gamepad-Core Web (DualSense WebHID & WebAssembly Suite)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-Emscripten-654FF0?logo=webassembly&logoColor=white)](https://webassembly.org/)
[![WebHID](https://img.shields.io/badge/WebHID-API-00C7B7?logo=w3c&logoColor=white)](https://wicg.github.io/webhid/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-2ea44f?logo=github)](https://rafaelvaloto.github.io/Gamepad-Core-Web/)

> High-performance WebHID and WebAssembly integration for PlayStation **DualSense** and **DualSense Edge** controllers in the browser, powered by the native **Gamepad-Core** engine.

---

## 🚀 Live Demo & Testing

Experience the live interactive diagnostic suite and hardware integration test in any Chromium-based browser with WebHID support (Chrome, Edge, Opera, Brave):

👉 **[Launch DualSense Integration Test Online](https://rafaelvaloto.github.io/Gamepad-Core-Web/)**

---

## 🌟 Overview & Parent Projects

**Gamepad-Core Web** bridges the native C++ hardware communication capabilities of **Gamepad-Core** with modern web standards using **WebAssembly** and the **WebHID API**.

### 🎮 DualSense-Multiplatform / Gamepad-Core
> **The Ultimate Cross-Platform DualSense & DualShock API**  
> *Pure C++ • Zero Dependencies • Engine Agnostic*  
The foundational native library designed for high-precision, low-latency communication with PlayStation controllers across Windows, Linux, macOS, Android, and embedded targets.

### 🎮 Gamepad-Core Host Bridge
> **Native C++ High-Level API (v1.0.6)**  
A C-compatible host bridge library exposing the full feature set of `Gamepad-Core` through clean, exported FFI symbols (`GCH_*`), enabling seamless integration into any language or runtime.

### 🌐 JavaScript, TypeScript & WebAssembly
The C-compatible API is compiled with **Emscripten** into high-efficiency **WebAssembly (`GamepadCoreHost.wasm`)**, allowing browser applications and Node.js environments to access raw hardware buffers, adaptive trigger profiles, IMU sensor fusion, and multi-touch tracking at ~60 Hz without performance compromises.

---

## ✨ Features

- 🎯 **Direct WebHID Communication**: Native bidirectional communication with Sony DualSense (VID `0x054C`, PID `0x0CE6`) and DualSense Edge (PID `0x0DF2`).
- ⚡ **Zero-Copy WebAssembly Telemetry**: Direct 148-byte memory layout decoding (`FInputContext` / `InputDescriptor`) for real-time input status.
- 🏎️ **Adaptive Triggers**: Real-time programmatic triggers (Feedback, Weapon Semi-Auto, Automatic Gun Buzz, Bow Resistance, Gallop, GameCube click, Machine Gun).
- 📳 **Haptics & Dual Rumble**: Heavy and soft rumble motor control with synchronized RGB Lightbar feedback.
- 📱 **Multi-Touch Capacitive Touchpad**: Multi-finger touch tracking, normalized position, relative deltas, and radius.
- 🎮 **DualSense Edge Support**: Dedicated telemetry for Function buttons (`Fn1`, `Fn2`) and Back Paddles (`PaddleLeft`, `PaddleRight`).
- 🌐 **Built-in Internationalization (i18n)**: Multi-language interface supporting **English (`en`)**, **Portuguese (`pt-BR`)**, and **Spanish (`es`)**.

---

## 🕹️ DualSense Integration Test Function Map

The diagnostic interface includes the official DualSense integration test suite:

```
=======================================================
           DUALSENSE INTEGRATION TEST
=======================================================

 [ FACE BUTTONS ]
   (X) Cross    : Heavy Rumble + RED Light
   (O) Circle   : Soft Rumble  + YELLOW Light
   [ ] Square   : Trigger Effect: GAMECUBE (R2)
   /\ Triangle  : Stop All (Rumble, Triggers & Lights)

-------------------------------------------------------

 [ D-PADS & SHOULDERS ]
   [L1]    : Trigger Effect: Gallop (L2)
   [R1]    : Trigger Effect: Machine (R2)
   [UP]    : Trigger Effect: Feedback (Rigid)
   [DOWN]  : Trigger Effect: Bow (Tension)
   [LEFT]  : Trigger Effect: Weapon (Semi)
   [RIGHT] : Trigger Effect: Automatic Gun (Buzz)

=======================================================
```

---

## 🧠 Memory Layout & Architecture

The WebAssembly engine interfaces with the browser via standardized descriptor structs:

### 1. `GamepadDeviceDescriptor` (Platform Handle & Metadata)
```cpp
struct GamepadDeviceDescriptor
{
    std::uint64_t Handle;          // Unique platform handle
    std::int32_t DeviceType;       // 1 = DualSense, 2 = DualSenseEdge, 3 = DualShock4
    std::int32_t ConnectionType;   // 1 = USB, 2 = Bluetooth
    std::int32_t IsConnected;      // Connection status flag
    char Path[512];                // Platform device path identifier
};
```

### 2. `FInputContext` / `InputDescriptor` (148-Byte Input State Buffer)
| Offset | Field | Type | Description |
|---|---|---|---|
| `0` | `AnalogDeadZone` | `float` | Analog stick deadzone threshold |
| `4, 8` | `LeftAnalog (X, Y)` | `float[2]` | Left stick normalized coordinates [-1.0, 1.0] |
| `12, 16` | `RightAnalog (X, Y)` | `float[2]` | Right stick normalized coordinates [-1.0, 1.0] |
| `20, 24` | `LeftTrigger / RightTrigger` | `float[2]` | L2 / R2 continuous analog pull [0.0, 1.0] |
| `28..39` | `Gyroscope (X, Y, Z)` | `float[3]` | Gyroscopic angular velocity (rad/s) |
| `40..51` | `Accelerometer (X, Y, Z)` | `float[3]` | 3-Axis linear acceleration (g) |
| `52..63` | `Gravity (X, Y, Z)` | `float[3]` | Filtered gravity vector |
| `64..75` | `Tilt (X, Y, Z)` | `float[3]` | Orientation tilt angles (deg) |
| `76..85` | `Touchpad State` | `int/byte` | `TouchId`, `TouchFingerCount`, `DirectionRaw`, `IsTouching` |
| `88..111`| `Touch Vectors` | `float[6]` | `TouchRadius`, `TouchPosition`, `TouchRelative` |
| `112..119`| `Face & D-Pad Buttons` | `byte[8]` | Cross, Square, Triangle, Circle, Dpad Up/Down/Left/Right |
| `120..127`| `Analog Directions` | `byte[8]` | Digital threshold booleans for L/R sticks |
| `128..139`| `Special & System` | `byte[12]` | Triggers thresholds, L1, R1, L3, R3, PS, Share, Options, Touch, Mute, Headphone |
| `140..143`| `DualSense Edge` | `byte[4]` | `Fn1`, `Fn2`, `PaddleLeft`, `PaddleRight` |
| `144` | `BatteryLevel` | `float` | Controller battery percentage [0.0 - 100.0] |

---

## 🛠️ Local Development & Build

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer)
- npm

### Installation & Run
```bash
# Clone the repository
git clone https://github.com/rafaelvaloto/Gamepad-Core-Web.git
cd Gamepad-Core-Web

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start a local static server (using any local HTTP server)
npx serve .
```

Navigate to `http://localhost:3000/testes/index.html` in Chrome/Edge to test with your DualSense controller.

---

## 📦 Repository & GitHub Setup

To initialize and push changes to the official repository:

```bash
git branch -M main
git remote add origin https://github.com/rafaelvaloto/Gamepad-Core-Web.git
git push -u origin main
```

The included GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds TypeScript sources and deploys the diagnostic web application to **GitHub Pages** upon every push to `main`.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License
Copyright (c) 2026 Rafael Valoto
```

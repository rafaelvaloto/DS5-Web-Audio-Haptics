# 🔊 DS5 Web Audio Haptics Bluetooth

Transform your browser into a real-time haptic feedback router. This tool captures live game audio via Screen Share and translates it into high-fidelity haptics via Bluetooth for PlayStation **DualSense** controllers—no cables or custom dongles required!

*[☕ Buy me a coffee or support the project!](https://github.com/sponsors/rafaelvaloto/button)*

---

## 🚀 Live Haptic Router & Browser Extension

Experience live audio haptic routing directly in your Chromium-based browser (Chrome, Edge, Opera, Brave).

👉 **[Launch DS5 Web Audio Haptics Online](https://rafaelvaloto.github.io/DS5-Web-Audio-Haptics/)**

### 🧩 Browser Extension
You can also use this tool as a dedicated browser extension for an integrated experience.
* **Status:** 🚧 *Coming soon directly to the Google Chrome Web Store!*

---

## 🎥 Full Video Tutorial

Watch the complete setup guide, including the browser extension, server configuration, and itch.io gameplay demonstration:

[![Watch the tutorial](https://img.youtube.com/vi/YfGAkdejegI/maxresdefault.jpg)](https://youtu.be/YfGAkdejegI?si=3CojajkqFkR0tHr3)
*Click the image to watch on YouTube*

---

## 🎧 How to Use (Step-by-Step)

To get the full experience, especially for browser games like those on itch.io, follow these steps to route both inputs and audio haptics.

### Part 1: Setting up the Virtual Gamepad
1. **Download Gamepad Socket:** Go to the [Gamepad Socket repository](https://github.com/rafaelvaloto/Gamepad_Socket) and download the latest release.
2. **Install Drivers:** If you haven't already, install the **ViGEm Bus Driver** (prompted during setup) to allow your PC to emulate an Xbox/Virtual controller.
3. **Run the Server:** Extract the downloaded files and execute `Gamepad_Socket.exe` to start the local server.

### Part 2: Connection Flow & Haptic Activation
After installing the drivers and the server, follow this flow to activate haptic feedback:

1. **Bluetooth Connection:** Ensure your DualSense controller is paired and connected to your PC via Bluetooth.
2. **Run the Server:** Execute `Gamepad_Socket.exe` and keep the server running. This background process is required to mediate communication between the hardware and your web browser.
3. **Activate the Extension:** Open the DS5 Web Audio Haptics extension in your browser and click "Connect". Ensure the connection to the local server is successfully established.
4. **Audio Capture:** When loading a game on itch.io (or any other platform), click to enable Audio Haptics and select the tab audio capture option in the extension's interface/browser prompt.
	* You MUST check the **"Share audio"** option in the browser prompt. This allows the game's audio signal to be captured and converted into real-time tactile vibrations on your controller.
5. **Play:** You can use the Picture-in-Picture mode to keep the app running in a small floating window while you play.

---

## ✨ Key Features

- 🔊 **Audio-to-Haptic:** Turn on-screen game audio into synchronized controller vibrations.
- 🛜 **100% Wireless:** Works fully over Bluetooth. No USB cables needed.
- 🚫 **No Installs Required (Web Version):** Runs entirely in your web browser.
- 🎮 **Universal Compatibility:** Works with native games or via Gamepad Socket for browser games.
- 🏎️ **Trigger Testing:** Manually test Adaptive Triggers (Machine Gun, Bow, etc.) directly in the app.
- 🔋 **Battery Monitor:** Check your controller's battery life in real-time.

---

## 🕹️ Game Compatibility

**Note:** This routing method relies on the game engine natively reading PlayStation hardware inputs (Raw Input / Direct HID). **It should work on any game that natively supports the DualSense controller via Bluetooth.** Games that strictly require Microsoft's XInput API (Xbox controller format) will require the Gamepad Socket external wrapper.

### 🌐 Web Browser Games (itch.io, etc.)
Browser games generally require the socket connection to emulate a compatible virtual gamepad. As shown in the tutorial video, this setup works flawlessly for indie titles.
* *Example:* [Little Big Smasher](https://augustopolonio.itch.io/little-big-smasher)

### 🖥️ Native PC Games
**Tested & Confirmed Games:** These games were tested successfully with native DualSense support, without requiring the socket connection or virtual gamepad emulation.

**Free Games:**
- [Atlas Wars](https://store.epicgames.com/p/atlas-wars-5b83bd)
- [Pixel Gun 3D](https://store.epicgames.com/p/pixel-gun-3d-812855)

**Paid Games:**
- NBA THE RUN
- EA SPORTS FC 26

---

## ⭐ 3rdParty

* [Gamepad-Core Host](https://github.com/rafaelvaloto/Gamepad-Core-Host) - The C-compatible API can also be consumed from JavaScript and TypeScript through WebAssembly, compiled with Emscripten. This makes Gamepad-Core Host available to browser applications, Node.js tools, and other JavaScript runtimes that support WebAssembly.

## ⭐ Credits

* [SAxense](https://github.com/egormanga/SAxense) - Base for Bluetooth Audio Haptics.
* [Awalol/DS5Dongle](https://github.com/awalol/DS5Dongle) - Reference **Bluetooth Audio (Headset/Speaker)** opus codec and buffer sizes.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

# 🔊 DS5 Web Audio Haptics Bluetooth

Transform your browser into a real-time haptic feedback router. This tool captures live game audio via Screen Share and translates it into high-fidelity haptics via Bluetooth for PlayStation **DualSense** controllers—no cables or custom dongles required!


---

## 🚀 Live Haptic Router

Experience live audio haptic routing in any Chromium-based browser (Chrome, Edge, Opera, Brave):

👉 **[Launch DS5 Web Audio Haptics Online](https://rafaelvaloto.github.io/DS5-Web-Audio-Haptics/testes/index.html)**


🎥 **[Watch the example on YouTube.](https://youtu.be/k_1XgeNzt5A)**


## Picture-In-Picture

<img width="329" alt="image" src="https://github.com/user-attachments/assets/b3730e87-5c40-40d8-a9de-52a243e5d337" />

---

## 🎧 How to Use (Step-by-Step)

1. **Connect your Controller:** Pair your DualSense controller to your PC via Bluetooth.
2. **Open the Router:** Go to the [Live Link](https://rafaelvaloto.github.io/DS5-Web-Audio-Haptics/testes/index.html).
3. **Connect Device:** Click the connect button and select your DualSense controller from the browser prompt.
4. **Enable Haptics:** Click **"Audio Haptics (On)"** and select your game's window in the Screen Share prompt. **Important:** Make sure to check the "Share audio" option in the browser prompt.
5. **Play:** Use the Picture-in-Picture mode to keep the app running in a small floating window while you play.

---

## 🕹️ Game Compatibility

**Note:** This routing method relies on the game engine natively reading PlayStation hardware inputs (Raw Input / Direct HID). **It should work on any game that natively supports the DualSense controller via Bluetooth.** Games that strictly require Microsoft's XInput API (Xbox controller format) will not register commands without an external wrapper.

**Tested & Confirmed Games:**

**Free Games:**
- [GOALS](https://store.epicgames.com/p/goals-a271d5)
- [Atlas Wars](https://store.epicgames.com/p/atlas-wars-5b83bd)
- [Pixel Gun 3D](https://store.epicgames.com/p/pixel-gun-3d-812855)
- [Armor of God](https://store.epicgames.com/p/armor-of-god-d55d93)

**Paid Games:**
- [NBA THE RUN](https://store.steampowered.com/app/2866670/NBA_THE_RUN/)

- [EA | FC 26]
<img width="960" height="540" alt="FC26" src="https://github.com/user-attachments/assets/8cc6cf98-1a3b-4b7f-8243-1595959c7a8f" />



---

## ✨ Key Features

- 🔊 **Audio-to-Haptic:** Turn on-screen game audio into synchronized controller vibrations.
- 🛜 **100% Wireless:** Works fully over Bluetooth. No USB cables needed.
- 🚫 **No Installs Required:** Runs entirely in your web browser.
- 🏎️ **Trigger Testing:** Manually test Adaptive Triggers (Machine Gun, Bow, etc.) directly in the app.
- 🔋 **Battery Monitor:** Check your controller's battery life in real-time.

---

## ⭐ 3rdParty

* [Gamepad-Core Host](https://github.com/rafaelvaloto/Gamepad-Core-Host) - The C-compatible API can also be consumed from JavaScript and TypeScript through WebAssembly, compiled with Emscripten. This makes Gamepad-Core Host available to browser applications, Node.js tools, and other JavaScript runtimes that support WebAssembly.

## ⭐ Credits

* [SAxense](https://github.com/egormanga/SAxense) - Base for Bluetooth Audio Haptics.
* [Awalol/DS5Dongle](https://github.com/awalol/DS5Dongle) - Reference **Bluetooth Audio (Headset/Speaker)** opus codec and buffer sizes.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

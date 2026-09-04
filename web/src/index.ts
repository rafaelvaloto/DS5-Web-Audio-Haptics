import { GamepadClientApplication } from "./main.ts";
import { bootWasmAndPlatform } from "./load.ts";
import { logLines, TRIGGERS } from "./const.ts";
import { debounce, hexToRgb } from "./helpers.ts";

// app engine instance
let app: GamepadClientApplication | null = null;

(document.getElementById("btn-load") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	if (app) {
		// skip if already loaded
		return;
	}

	try {
		const wasmContext = await bootWasmAndPlatform("src/lib");
		app = GamepadClientApplication.createFromContext(wasmContext, 1);

		if (app) {
			(e.target as HTMLButtonElement).disabled = true;
			(document.getElementById("btn-request") as HTMLButtonElement).disabled = false;

			console.log("WASM loaded successfully.");
		}
	} catch (err) {
		console.error("Failed to load the app:", err);
	}
});

(document.getElementById("btn-show-logs") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	const logContainer = document.getElementById("log-dialog");
	if (logContainer) {
		logContainer.style.display = logContainer.style.display !== "block" ? "block" : "none";
	}
});

(document.getElementById("btn-close-logs") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	const logContainer = document.getElementById("log-dialog");
	if (logContainer) {
		logContainer.style.display = "none";
	}
});

(document.getElementById("btn-clear-logs") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	logLines.length = 0;
	(document.getElementById("log-box") as HTMLButtonElement).textContent = "";
});

(document.getElementById("btn-request") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	if (!app) {
		console.warn("Você precisa carregar o WASM primeiro (clique em Load).");
		return;
	}

	try {
		// Open the pop-up of the browser, wait for the choice, save it in the cache and INJECT it into C++
		const authorizedDeviceNames = await app.requestDeviceAccess();

		if (authorizedDeviceNames.length === 0) {
			console.log("No devices were selected.");
			return;
		}

		console.log(`Success! Connected controllers: ${authorizedDeviceNames.join(", ")}`);
		const lblDevice = document.getElementById("lbl-device");
		if (lblDevice) {
			lblDevice.textContent = authorizedDeviceNames.join(", ");
		}

		(e.target as HTMLButtonElement).disabled = true;
		(document.getElementById("btn-start") as HTMLButtonElement).disabled = false;
	} catch (err) {
		// Falls here if the WebHID blocks the pop-up (e.g., lack of user interaction)
		// or if the browser does not support it.
		console.error("Failed to request device access:", err);
	}
});

(document.getElementById("btn-start") as HTMLButtonElement)?.addEventListener("click", (e) => {
	if (!app) {
		console.warn("WASM não carregado.");
		return;
	}

	if (app.devices.size === 0) {
		console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
		return;
	}

	app.run();
	console.log("🚀 Loop rodando!");

	(e.target as HTMLButtonElement).disabled = true;
	(document.getElementById("btn-stop") as HTMLButtonElement).disabled = false;
});

(document.getElementById("btn-stop") as HTMLButtonElement)?.addEventListener("click", (e) => {
	if (app) {
		app.stop();
	}

	(e.target as HTMLButtonElement).disabled = true;
	(document.getElementById("btn-start") as HTMLButtonElement).disabled = false;
});

(document.getElementById("btn-stop") as HTMLButtonElement)?.addEventListener("click", (e) => {
	if (app) {
		app.stop();
	}

	(e.target as HTMLButtonElement).disabled = true;
	(document.getElementById("btn-start") as HTMLButtonElement).disabled = false;
});

(document.getElementById("btn-reset-trigger") as HTMLButtonElement)?.addEventListener("click", (e) => {
	(document.getElementById("sel-trigger-effect") as HTMLSelectElement).value = "none";
	if (!app) {
		console.warn("WASM não carregado.");
		return;
	}

	if (app.devices.size === 0) {
		console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
		return;
	}

	app?.devices.forEach((descriptor, deviceId) => {
		app?.api?.reset(deviceId, 0);
		app?.api?.reset(deviceId, 1);
		app?.api?.output(deviceId);
		console.log(`Trigger reset applied to the controller ${deviceId}.`);
	});
});

(document.getElementById("btn-apply-trigger") as HTMLButtonElement)?.addEventListener("click", (e) => {
	let pattern: string = (document.getElementById("sel-trigger-effect") as HTMLSelectElement).value;
	let hand: number = Number((document.getElementById("sel-trigger-hand") as HTMLSelectElement).value);

	if (!app) {
		console.warn("WASM não carregado.");
		return;
	}

	if (app.devices.size === 0) {
		console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
		return;
	}

	const arr = TRIGGERS[pattern] || new Uint8Array(0);
	const bytesLength = arr.length;
	const bufferPtr = app.module?._malloc(bytesLength);

	if (bufferPtr) {
		try {
			app.module?.HEAPU8.set(arr, bufferPtr);
			app?.devices.forEach((descriptor, deviceId) => {
				app?.api?.triggers(deviceId, bufferPtr, arr.length, hand);
				app?.api?.output(deviceId);
				console.log(`Trigger pattern applied to the controller ${deviceId}.`);
			});
		} finally {
			app.module?._free(bufferPtr);
		}
	}
});

let lastColor = (document.getElementById("picker-led-color") as HTMLInputElement).value;
(document.getElementById("picker-led-color") as HTMLInputElement)?.addEventListener(
	"input",
	debounce((event: Event) => {
		if (!app) {
			console.warn("WASM não carregado.");
			return;
		}

		if (app.devices.size === 0) {
			console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
			return;
		}

		const target = event.target as HTMLInputElement;
		const hexColor = target.value;
		if (hexColor === lastColor) {
			return;
		}

		const rgb = hexToRgb(hexColor);
		app?.devices.forEach((descriptor, deviceId) => {
			app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
			app?.api?.output(deviceId);
			console.log(`Lightbar color applied to device ${deviceId}: ${hexColor}`);
		});
	}, 1000)
);

(Array.from(document.getElementsByClassName("color-preset-btn")) as HTMLButtonElement[]).forEach((btn) => {
	btn.addEventListener("click", (e) => {
		try {
			app?.devices.forEach((descriptor, deviceId) => {
				if (btn.dataset.color) {
					const rgb = hexToRgb(btn.dataset.color);

					app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
					app?.api?.output(deviceId);
					console.log(`Lightbar pattern applied to device ${deviceId}.`);
				}
			});
		} catch (err) {
			console.error("Failed to apply lightbar pattern:", err);
		}
	});
});

(document.getElementById("btn-pip") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	try {
		if (!app) {
			console.warn("WASM não carregado.");
			return;
		}

		if (app.devices.size === 0) {
			console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
			return;
		}

		const result = await app.toggleHaptics();
		if (result) {
			for (const [deviceId, descriptor] of app.devices) {
				await app?.audioSettings(
					deviceId,
					0, // enable haptics
					1, // rumble mode
					1, // rumble reduce
					0, // trigger reduce
					100, // audio volume
					0xfc, // audio gain
					0, // audio device
					0 // reserved
				);
			}
			console.log("Haptics enabled.");
		}
	} catch (error) {
		console.error("Screen permission denied or error:", error);
	}
});

function updateAudioSettings() {
	if (!app) {
		console.warn("WASM não carregado.");
		return;
	}

	if (app.devices.size === 0) {
		console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
		return;
	}

	const volume = Number((document.getElementById("input-audio-volume") as HTMLInputElement)?.value);
	const gain = Number((document.getElementById("input-audio-gain") as HTMLInputElement)?.value);
	const bIsSpeaker = Number((document.getElementById("switch-speaker") as HTMLInputElement)?.checked);
	const bIsAudioOnly = Number((document.getElementById("switch-audio-haptics") as HTMLInputElement)?.checked);

	for (const [deviceId, descriptor] of app.devices) {
		app?.audioSettings(
			deviceId,
			0, // enable haptics
			1, // rumble mode
			bIsSpeaker, // rumble reduce
			0, // trigger reduce
			volume, // audio volume
			bIsAudioOnly ? 0xfc : 0xff, // audio gain
			0, // audio device
			0,
			volume,
			gain // reserved
		).catch((err) => {
			console.error(`Failed to apply audio settings for device ${deviceId}:`, err);
		});
	}
}
(document.getElementById("input-audio-gain") as HTMLInputElement)?.addEventListener(
	"input",
	debounce((event: Event) => {
		const gainValueDisplay = document.getElementById("input-audio-gain-value");
		if (gainValueDisplay) {
			gainValueDisplay.textContent = Number((event.target as HTMLInputElement).value).toFixed(1);
		}
		updateAudioSettings();
	}, 400)
);
(document.getElementById("input-audio-volume") as HTMLInputElement)?.addEventListener(
	"input",
	debounce((event: Event) => {
		const volumeValueDisplay = document.getElementById("input-audio-volume-value");
		if (volumeValueDisplay) {
			volumeValueDisplay.textContent = (event.target as HTMLInputElement).value;
		}
		updateAudioSettings();
	}, 400)
);
(document.getElementById("switch-audio-haptics") as HTMLInputElement)?.addEventListener("change", (e) => {
	updateAudioSettings();
});
(document.getElementById("switch-speaker") as HTMLInputElement)?.addEventListener("change", (e) => {
	updateAudioSettings();
});

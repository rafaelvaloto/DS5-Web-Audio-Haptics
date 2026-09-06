import { GamepadClientApplication } from "./main.ts";
import { bootWasmAndPlatform } from "./load.ts";
import { logLines, TRIGGERS } from "./const.ts";
import { debounce, hexToRgb } from "./helpers.ts";
import { AudioHapticsManager } from "./stream.ts";

// app engine instance
let app: GamepadClientApplication | null = null;

const deviceChannel = new BroadcastChannel("dualsense_channel");

function loadProfilesIntoSelect() {
	let selTriggerProfile = document.getElementById("sel-trigger-effect-profile") as HTMLSelectElement;
	selTriggerProfile.innerHTML = ""; // Clear existing options
	selTriggerProfile.add(new Option("None", "None"));

	let profiles = JSON.parse(localStorage.getItem("dualsense_profiles") || "null");
	profiles?.forEach((profile: any) => {
		selTriggerProfile.add(new Option(profile.gameName, profile.gameName));
	});
}

loadProfilesIntoSelect();

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

			deviceChannel.onmessage = async (event) => {
				if (event.data.type === "LOAD_PROFILES") {
					loadProfilesIntoSelect();
				}
				if (event.data.type === "DEVICE_APPLY_TRIGGER") {
					const selTriggerEffectProfile = document.getElementById(
						"sel-trigger-effect-profile"
					) as HTMLSelectElement;
					let profiles = JSON.parse(localStorage.getItem("dualsense_profiles") || "null");

					profiles.forEach((profile: any) => {
						if (profile.gameName === selTriggerEffectProfile.value) {
							let num: number = event.data.message || 0;
							let trigger = profile.triggers[num] || null;
							if (!trigger) {
								app?.api?.reset(event.data.deviceId, 0);
								app?.api?.reset(event.data.deviceId, 1);
								app?.api?.output(event.data.deviceId);
								console.log(`Trigger reset applied to the controller ${event.data.deviceId}.`);
								(document.getElementById("trigger-selected-out") as HTMLSpanElement).innerText =
									"Change trigger use R3 + d-pad: ⬅️➡️⬆️⬇️";
								(document.getElementById("dot-trigger") as HTMLSpanElement).className = "dot danger";
								return;
							}
							(document.getElementById("trigger-selected-out") as HTMLSpanElement).innerText =
								trigger.name || "";
							const effectString = trigger.type + " " + trigger.hex || "";
							const effectValues = effectString
								.trim()
								.split(/\s+/)
								.map((hex: string) => parseInt(hex, 16))
								.filter((n: number) => !isNaN(n));

							const hand: number = Number(trigger.hand || 0);
							const arr = new Uint8Array(effectValues);
							const t_bufferPtr = app?.module?._malloc(arr.length);
							if (t_bufferPtr) {
								try {
									app?.module?.HEAPU8.set(arr, t_bufferPtr);
									app?.api?.triggers(event.data.deviceId, t_bufferPtr, arr.length, hand);
									app?.api?.output(event.data.deviceId);
									console.log(`Trigger pattern applied to the controller ${event.data.deviceId}.`);
									(document.getElementById("dot-trigger") as HTMLSpanElement).className =
										"dot active";
								} finally {
									app?.module?._free(t_bufferPtr);
								}
							}
						}
					});
				}

				if (event.data.type === "DEVICE_APPLY_TRIGGER_TEST") {
					app?.devices.forEach((descriptor, deviceId) => {
						let trigger = JSON.parse(localStorage.getItem("trigger_test") || "null");
						if (!trigger) {
							return;
						}

						const effectString = trigger.effect || "";
						const effectValues = effectString
							.trim()
							.split(/\s+/)
							.map((hex: string) => parseInt(hex, 16))
							.filter((n: number) => !isNaN(n));

						const hand: number = Number(trigger.hand || 0);
						const arr = new Uint8Array(effectValues);
						const t_bufferPtr = app?.module?._malloc(arr.length);
						if (t_bufferPtr) {
							try {
								app?.module?.HEAPU8.set(arr, t_bufferPtr);
								app?.api?.triggers(deviceId, t_bufferPtr, arr.length, hand);
								app?.api?.output(deviceId);
								console.log(`Trigger pattern applied to the controller ${deviceId}.`);
							} finally {
								app?.module?._free(t_bufferPtr);
							}
						}
					});
				}
				if (event.data.type === "DEVICE_AUTHORIZED") {
					app?.devices.clear();

					try {
						const devices = await navigator.hid.getDevices();

						if (devices.length > 0) {
							devices.forEach((d: HIDDevice) => {
								app?.createDeviceFromDescriptor(d, app.nextManualHandle++, 1, 1, true, d.productName);
							});

							const btnRequest = document.getElementById("btn-request") as HTMLButtonElement;
							const btnStart = document.getElementById("btn-start") as HTMLButtonElement;

							if (btnRequest) btnRequest.disabled = true;
							if (btnStart) btnStart.disabled = false;
						}
					} catch (err) {
						console.log("Failed to get authorized devices:", err);
					}
				}
			};
		}
	} catch (err) {
		console.log("Failed to load the app:", err);
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

(document.getElementById("create-trigger") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	if (chrome.runtime) {
		const url = chrome.runtime.getURL("triggers.html");
		await chrome.tabs.create({ url: url });
		return;
	}
});
(document.getElementById("btn-request") as HTMLButtonElement)?.addEventListener("click", async (e) => {
	if (!app) {
		console.warn("Você precisa carregar o WASM primeiro (clique em Load).");
		return;
	}

	if (chrome.runtime?.openOptionsPage) {
		await chrome.runtime.openOptionsPage();
		return;
	}

	try {
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
		console.log("Failed to request device access:", err);
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
	setTimeout(() => {
		const battery = document.getElementById(`lbl-battery`) as HTMLButtonElement;
		app?.devices.forEach((descriptor, deviceId) => {
			battery.className = `${app?.api?.battery(deviceId)}`;
			battery.textContent = `${app?.api?.battery(deviceId)}%`;
		});
	}, 10000);
});

(document.getElementById("btn-stop") as HTMLButtonElement)?.addEventListener("click", (e) => {
	if (app) {
		app.stop();
	}

	(e.target as HTMLButtonElement).disabled = true;
	(document.getElementById("btn-start") as HTMLButtonElement).disabled = false;
});

(document.getElementById("btn-reset-trigger") as HTMLButtonElement)?.addEventListener("click", (e) => {
	(document.getElementById("sel-trigger-effect-profile") as HTMLSelectElement).value = "none";
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

let lastColor = (document.getElementById("picker-led-color") as HTMLInputElement)?.value || "#ffffff";
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
			AudioHapticsManager.lastLightbarColor = { r: rgb.r, g: rgb.g, b: rgb.b };
			app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
			app?.api?.output(deviceId);
			console.log(`Lightbar color applied to device ${deviceId}: ${hexColor}`);
		});
	}, 400)
);

(Array.from(document.getElementsByClassName("color-preset-btn")) as HTMLButtonElement[]).forEach((btn) => {
	btn.addEventListener("click", (e) => {
		try {
			app?.devices.forEach((descriptor, deviceId) => {
				if (btn.dataset.color) {
					const rgb = hexToRgb(btn.dataset.color);
					AudioHapticsManager.lastLightbarColor = { r: rgb.r, g: rgb.g, b: rgb.b };

					app?.api?.lightbar(deviceId, rgb.r, rgb.g, rgb.b);
					app?.api?.output(deviceId);
					console.log(`Lightbar pattern applied to device ${deviceId}.`);
				}
			});
		} catch (err) {
			console.log("Failed to apply lightbar pattern:", err);
		}
	});
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
	const bHeadSetOnly = Number((document.getElementById("switch-speaker") as HTMLInputElement)?.checked);
	const bIsAudioOnly = Number((document.getElementById("switch-audio-haptics") as HTMLInputElement)?.checked);

	for (const [deviceId, descriptor] of app.devices) {
		app?.audioSettings(
			deviceId,
			0, // enable haptics
			1,
			Number(!bHeadSetOnly),
			0, // trigger reduce
			0x7c, // audio volume
			!bIsAudioOnly ? 0xfc : 0xff, // audio gain
			0, // audio device
			0,
			Number(gain),
			Number(volume) // reserved
		).catch((err) => {
			console.log(`Failed to apply audio settings for device ${deviceId}:`, err);
		});
	}
}
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
			console.log("Haptics enabled.");
			(e.target as HTMLButtonElement).textContent = "🪟 Stop Picture-in-Picture";
			(e.target as HTMLButtonElement).className = "btn btn-danger";
			(Array.from(document.getElementsByClassName("shared-card-overlay")) as HTMLElement[]).forEach((el) => {
				el.style.opacity = "100";
			});
			(document.getElementById("dot-audio-haptics") as HTMLButtonElement).className = "dot active";
			updateAudioSettings();
		} else {
			(e.target as HTMLButtonElement).textContent = "🪟 Start Picture-in-Picture";
			(e.target as HTMLButtonElement).className = "btn btn-primary";
			(document.getElementById("dot-audio-haptics") as HTMLButtonElement).className = "dot";

			console.log("Haptics disabled.");
		}
	} catch (error) {
		console.log("Screen permission denied or error:", error);
	}
});
(document.getElementById("input-audio-gain") as HTMLInputElement)?.addEventListener(
	"input",
	debounce((event: Event) => {
		const gainValueDisplay = document.getElementById("input-audio-gain-value");
		if (gainValueDisplay) {
			gainValueDisplay.textContent = Number((event.target as HTMLInputElement).value).toFixed(1);
		}
		updateAudioSettings();
	}, 200)
);
(document.getElementById("input-audio-volume") as HTMLInputElement)?.addEventListener(
	"input",
	debounce((event: Event) => {
		const volumeValueDisplay = document.getElementById("input-audio-volume-value");
		if (volumeValueDisplay) {
			volumeValueDisplay.textContent = (event.target as HTMLInputElement).value;
		}
		updateAudioSettings();
	}, 100)
);
(document.getElementById("switch-audio-haptics") as HTMLInputElement)?.addEventListener("change", (e) => {
	updateAudioSettings();
});
(document.getElementById("switch-speaker") as HTMLInputElement)?.addEventListener("change", (e) => {
	updateAudioSettings();
});

(document.getElementById("btn-ws-connect") as HTMLInputElement)?.addEventListener("click", (e) => {
	try {
		if (!app) {
			console.warn("WASM não carregado.");
			return;
		}

		if (app.devices.size === 0) {
			console.warn("Nenhum controle conectado. Faça o Request Device primeiro.");
			return;
		}

		(e.target as HTMLButtonElement).textContent = !app?.wsIsConnect() ? "Connecting..." : "Disconnecting...";
		(e.target as HTMLButtonElement).disabled = true;

		app.wsToggle();
		setTimeout(() => {
			if (app?.wsIsConnect()) {
				console.log("WebSocket is connected.");
				(e.target as HTMLButtonElement).textContent = "Disconnect";
				(e.target as HTMLButtonElement).className = "btn btn-danger";
				document.getElementById("lbl-ws-status")!.textContent = "Connected";
				(e.target as HTMLButtonElement).disabled = false;
			} else {
				console.log("WebSocket connection failed.");
				(e.target as HTMLButtonElement).textContent = "Connect";
				(e.target as HTMLButtonElement).className = "btn btn-primary";
				document.getElementById("lbl-ws-status")!.textContent = "Disconnected";
				(e.target as HTMLButtonElement).disabled = false;
			}
		}, 1500);
	} catch (error) {
		console.log("Screen permission denied or error:", error);
	}
});

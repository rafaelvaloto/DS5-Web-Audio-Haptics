import {
  createInMemoryDeviceRegistryPolicy,
  initializeDeviceRegistryPolicy,
  initializeWebHidPlatformBridge,
  requestSonyWebHidAccess,
  type EmscriptenLikeModule,
} from "./platform/web_hid_platform.ts";

const FRAME_SECONDS = 0.010;
const FRAME_MS = 10;
const INPUT_DESCRIPTOR_SIZE = 148;
let bannerPrinted = false;

// Trigger Effect Payloads
const TRIGGER_GALLOPING = new Uint8Array([0x23, 0x82, 0x00, 0xf7, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_MACHINE = new Uint8Array([0x27, 0x80, 0x02, 0x3a, 0x0a, 0x04, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_FEEDBACK = new Uint8Array([0x21, 0xfe, 0x03, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x00, 0x00]);
const TRIGGER_WEAPON = new Uint8Array([0x25, 0x08, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_BOW = new Uint8Array([0x22, 0x02, 0x01, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TRIGGER_AUTOMATIC_GUN = new Uint8Array([0x26, 0x00, 0x03, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x0a]);
const TRIGGER_GAMECUBE = new Uint8Array([0x25, 0x90, 0x02, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const AUDIO_HAPTICS_WORKLET_CODE = `
class AudioHapticsWorkletProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const ch0 = input[0];
      const ch1 = input[1];
      if (ch0 && ch0.length > 0) {
        const frameCount = ch0.length;
        const numChannels = ch1 && ch1.length > 0 ? 2 : 1;
        const totalFloats = frameCount * numChannels;
        const interleaved = new Float32Array(totalFloats);
        if (numChannels >= 2 && ch1) {
          for (let i = 0; i < frameCount; i++) {
            interleaved[i * 2] = ch0[i];
            interleaved[i * 2 + 1] = ch1[i];
          }
        } else {
          interleaved.set(ch0);
        }
        this.port.postMessage({
          audioData: interleaved,
          frameCount,
          numChannels
        }, [interleaved.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('audio-haptics-worklet-processor', AudioHapticsWorkletProcessor);
`;

type NativeModule = EmscriptenLikeModule & {
  _malloc(size: number): number;
  _free(ptr: number): void;
  getValue(ptr: number, type: string): number;
};

export interface FInputContext {
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

type NativeApi = {
  setLogCallback?: (logFnPtr: number) => void;
  discoverDevices: (deltaSeconds: number) => void;
  updateInput: (deviceId: number, deltaSeconds: number) => void;
  getInputState: (deviceId: number, outPtr: number) => void;
  enableGyroscopeValues?: (deviceId: number, enable: number) => void;
  enableTouch?: (deviceId: number, enable: number) => void;
  resetGyroOrientation?: (deviceId: number) => void;
  batteryLevelDevice?: (deviceId: number) => number;
  setVibration?: (deviceId: number, left: number, right: number) => void;
  lightbar?: (deviceId: number, red: number, green: number, blue: number) => void;
  resetLights?: (deviceId: number) => void;
  updateOutput?: (deviceId: number) => void;
  customTrigger?: (deviceId: number, buffer: number, length: number, hand: number) => number;
  stopTrigger?: (deviceId: number, hand: number) => void;
  shutdown?: () => void;
  audioSubmitSamples?: (audioDataPtr: number, frameCount: number, numChannels: number, sampleRate: number) => number | boolean;
  getProcessAudioHaptics?: (deviceId: number) => number | boolean;
  processAudioHaptics?: (deviceId: number) => number | boolean;
  dualsenseSettings?: (
    controllerId: number,
    bIsMic: number,
    bIsHeadset: number,
    bIsSpeaker: number,
    micVolume: number,
    audioVolume: number,
    rumbleMode: number,
    rumbleReduce: number,
    triggerReduce: number
  ) => void;
};

/** Audio haptics adapter for pages that own the UI/connection lifecycle. */
export function createAudioHapticsController(options: {
  module: NativeModule;
  api: NativeApi;
  deviceIds: Set<number>;
  settings?: Partial<AudioHapticsSettings>;
  onChange?: (enabled: boolean) => void;
}): { enable(): Promise<void>; disable(): Promise<void>; toggle(): Promise<boolean>; isEnabled(): boolean } {
  let enabled = false;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: AudioNode | null = null;
  let mute: GainNode | null = null;
  let bufferPtr = 0;
  let bufferCapacity = 0;
  const settings: AudioHapticsSettings = {
    bIsSpeaker: options.settings?.bIsSpeaker === 0 ? 0 : 1,
    audioVolume: Math.min(100, Math.max(0, options.settings?.audioVolume ?? 100)),
    rumbleMode: options.settings?.rumbleMode === 0xFF ? 0xFF : 0xFC,
    rumbleReduce: Math.min(15, Math.max(0, options.settings?.rumbleReduce ?? 0)),
  };

  const applySettings = (mode = settings.rumbleMode) => {
    for (const id of options.deviceIds) {
      options.api.dualsenseSettings?.(id, 0, 1, settings.bIsSpeaker, 0xc7, settings.audioVolume, mode, settings.rumbleReduce, 0);
      options.api.updateOutput?.(id);
    }
  };

  const submit = (data: Float32Array, frames: number, channels: number, rate: number) => {
    if (!enabled || !options.api.audioSubmitSamples) return;
    const bytes = data.length * Float32Array.BYTES_PER_ELEMENT;
    if (bufferCapacity < bytes) {
      if (bufferPtr) options.module._free(bufferPtr);
      bufferPtr = options.module._malloc(bytes);
      bufferCapacity = bytes;
    }
    const heap = options.module.HEAPU8;
    new Float32Array(heap.buffer, heap.byteOffset + bufferPtr, data.length).set(data);
    options.api.audioSubmitSamples(bufferPtr, frames, channels, rate);
  };

  const disable = async () => {
    if (!enabled && !stream) return;
    enabled = false;
    processor?.disconnect();
    if (processor && "port" in processor) (processor as AudioWorkletNode).port.close();
    source?.disconnect();
    mute?.disconnect();
    if (context) await context.close().catch(() => {});
    stream?.getTracks().forEach((track) => track.stop());
    if (bufferPtr) options.module._free(bufferPtr);
    stream = null; context = null; source = null; processor = null; mute = null;
    bufferPtr = 0; bufferCapacity = 0;
    applySettings(0xFF);
    options.onChange?.(false);
  };

  const enable = async () => {
    if (enabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("getDisplayMedia não é suportado neste ambiente.");
    }
    const nextStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (nextStream.getAudioTracks().length === 0) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw new Error("Nenhuma faixa de áudio disponível. Marque 'Compartilhar áudio'.");
    }
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const nextContext = new AudioContextClass();
      if (nextContext.state === "suspended") await nextContext.resume();
      const nextSource = nextContext.createMediaStreamSource(nextStream);
      let nextProcessor: AudioNode;
      if (nextContext.audioWorklet && typeof nextContext.audioWorklet.addModule === "function") {
        const url = URL.createObjectURL(new Blob([AUDIO_HAPTICS_WORKLET_CODE], { type: "application/javascript" }));
        try { await nextContext.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        const node = new AudioWorkletNode(nextContext, "audio-haptics-worklet-processor");
        node.port.onmessage = (event: MessageEvent) => {
          const value = event.data as { audioData: Float32Array; frameCount: number; numChannels: number };
          submit(value.audioData, value.frameCount, value.numChannels, nextContext.sampleRate);
        };
        nextProcessor = node;
      } else {
        const node = nextContext.createScriptProcessor(4096, 2, 2);
        node.onaudioprocess = (event) => {
          const input = event.inputBuffer;
          const channels = input.numberOfChannels;
          const data = new Float32Array(input.length * channels);
          for (let i = 0; i < input.length; i++) for (let c = 0; c < channels; c++) data[i * channels + c] = input.getChannelData(c)[i];
          submit(data, input.length, channels, input.sampleRate);
        };
        nextProcessor = node;
      }
      const nextMute = nextContext.createGain();
      nextMute.gain.value = 0;
      nextSource.connect(nextProcessor); nextProcessor.connect(nextMute); nextMute.connect(nextContext.destination);
      nextStream.getTracks().forEach((track) => track.addEventListener("ended", () => { if (enabled) disable().catch(console.error); }));
      stream = nextStream; context = nextContext; source = nextSource; processor = nextProcessor; mute = nextMute; enabled = true;
      applySettings();
      options.onChange?.(true);
    } catch (error) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  };
  return { enable, disable, toggle: async () => { if (enabled) { await disable(); return false; } await enable(); return true; }, isEnabled: () => enabled };
}

export interface AudioHapticsSettings {
  bIsSpeaker: 0 | 1;
  audioVolume: number;
  rumbleMode: number;
  rumbleReduce: number;
}

export class GamepadClientApplication {
  private readonly module: NativeModule;
  private readonly api: NativeApi;
  private readonly deviceIds: Set<number>;
  private readonly previousInput = new Map<number, FInputContext>();
  private readonly inputBufferPtr: number;
  private readonly outputBufferPtr: number;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private inputTimer: ReturnType<typeof setInterval> | null = null;
  private readonly platformCleanup: { dispose(): Promise<void> };
  private readonly registryCleanup: { dispose(): void };
  private readonly logFnPtr: number | null;
  private isRunning = false;
  private isAudioHapticsEnabled = false;
  private audioHapticsSettings: AudioHapticsSettings = {
    bIsSpeaker: 1,
    audioVolume: 100,
    rumbleMode: 0xFC,
    rumbleReduce: 0,
  };
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioProcessorNode: AudioNode | null = null;
  private audioSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioMuteNode: GainNode | null = null;
  private audioBufferPtr = 0;
  private audioBufferCapacityBytes = 0;

  private constructor(
    module: NativeModule,
    api: NativeApi,
    platformCleanup: { dispose(): Promise<void> },
    registryCleanup: { dispose(): void },
    logFnPtr: number | null,
    deviceIds = new Set<number>()
  ) {
    this.module = module;
    this.api = api;
    this.deviceIds = deviceIds;
    this.platformCleanup = platformCleanup;
    this.registryCleanup = registryCleanup;
    this.logFnPtr = logFnPtr;
    this.inputBufferPtr = module._malloc(INPUT_DESCRIPTOR_SIZE);
    this.outputBufferPtr = module._malloc(64);
  }

  /**
   * Creates an application facade around a runtime already initialized by a
   * legacy/custom UI. The UI can still use the main class as the single owner
   * of audio haptics without initializing WASM or WebHID a second time.
   */
  public static fromNativeRuntime(module: NativeModule, api: NativeApi, deviceIds: Set<number>): GamepadClientApplication {
    return new GamepadClientApplication(
      module,
      api,
      { dispose: async () => {} },
      { dispose: () => {} },
      null,
      deviceIds
    );
  }

  static async create(typeId = 0): Promise<GamepadClientApplication> {
    if (typeof navigator === "undefined" || !("hid" in navigator)) {
      throw new Error("Este loop usa WebHID e precisa rodar no navegador (com interação do usuário).");
    }

    await requestSonyWebHidAccess();
    const initGamepadCoreHost = await loadGamepadCoreHostFactory();
    const module = (await initGamepadCoreHost()) as NativeModule;

    const platformCleanup = await initializeWebHidPlatformBridge(module);

    let nextDeviceId = 1;
    const registryCallbacks = createInMemoryDeviceRegistryPolicy(nextDeviceId);
    const wrappedCallbacks = {
      alloc: (...args: number[]) => {
        const deviceId = registryCallbacks.alloc(...args);
        nextDeviceId = Math.max(nextDeviceId, deviceId + 1);
        return deviceId;
      },
      dispatch: registryCallbacks.dispatch,
      disconnect: registryCallbacks.disconnect,
    };

    const appRef: { value: GamepadClientApplication | null } = { value: null };

    const registryCleanup = initializeDeviceRegistryPolicy(
      module,
      typeId,
      {
        alloc: wrappedCallbacks.alloc,
        dispatch: (deviceId) => {
          appRef.value?.deviceIds.add(deviceId);
          wrappedCallbacks.dispatch(deviceId);
          console.log(`Device dispatched: ${deviceId}`);

          // Enable Touchpad
          if (appRef.value?.api.enableTouch) {
            appRef.value.api.enableTouch(deviceId, 1);
            console.log(`Device ${deviceId}: Touchpad enabled.`);
          }

          if (appRef.value?.getIsAudioHapticsEnabled()) {
            appRef.value.applyAudioHapticsSettings(deviceId);
          }
        },
        disconnect: (deviceId) => {
          appRef.value?.deviceIds.delete(deviceId);
          appRef.value?.previousInput.delete(deviceId);
          wrappedCallbacks.disconnect(deviceId);
          console.log(`Device disconnected: ${deviceId}`);
        },
      }
    );

    const api = bindNativeApi(module);
    const logFnPtr = registerLogCallback(module, api);

    const app = new GamepadClientApplication(module, api, platformCleanup, registryCleanup, logFnPtr);
    appRef.value = app;
    return app;
  }

  run(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.api.discoverDevices(2.0);

    const discoveryHandle = setInterval(() => {
      this.api.discoverDevices(FRAME_SECONDS);
    }, FRAME_MS);

    let frameCount = 0;
    const inputHandle = setInterval(() => {
      const ids = Array.from(this.deviceIds);
      for (const deviceId of ids) {
        this.api.updateInput(deviceId, FRAME_SECONDS);
        if (this.audioHapticsSettings.rumbleMode === 0xFC) {
          this.api.updateOutput?.(deviceId);
        }
      }
      // for (const deviceId of ids) {
      //   const state = this.readInputState(deviceId);
      //   this.handleInput(deviceId, state);
      // }
    }, FRAME_MS);

    this.discoveryTimer = discoveryHandle;
    this.inputTimer = inputHandle;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
    }
    if (this.inputTimer) {
      clearInterval(this.inputTimer);
    }

    await this.disableAudioHaptics();

    this.registryCleanup.dispose();
    await this.platformCleanup.dispose();
    this.api.shutdown?.();

    if (this.logFnPtr !== null) {
      this.module.removeFunction(this.logFnPtr);
    }
    this.module._free(this.inputBufferPtr);
    this.module._free(this.outputBufferPtr);
  }

  public getIsAudioHapticsEnabled(): boolean {
    return this.isAudioHapticsEnabled;
  }

  public getAudioHapticsSettings(): AudioHapticsSettings {
    return { ...this.audioHapticsSettings };
  }

  public setAudioHapticsSettings(settings: Partial<AudioHapticsSettings>): void {
    this.audioHapticsSettings = {
      bIsSpeaker: settings.bIsSpeaker === 0 ? 0 : 1,
      audioVolume: Math.min(100, Math.max(0, Math.round(settings.audioVolume ?? this.audioHapticsSettings.audioVolume))),
      rumbleMode: settings.rumbleMode === 0xFF ? 0xFF : 0xFC,
      rumbleReduce: Math.min(15, Math.max(0, Math.round(settings.rumbleReduce ?? this.audioHapticsSettings.rumbleReduce))),
    };

    if (this.isAudioHapticsEnabled) {
      for (const deviceId of this.deviceIds) {
        this.applyAudioHapticsSettings(deviceId);
      }
    }
  }

  private applyAudioHapticsSettings(deviceId: number, rumbleMode = this.audioHapticsSettings.rumbleMode): void {
    this.api.dualsenseSettings?.(
      deviceId,
      0,
      1,
      this.audioHapticsSettings.bIsSpeaker,
      0xc7,
      this.audioHapticsSettings.audioVolume,
      rumbleMode,
      this.audioHapticsSettings.rumbleReduce,
      0
    );
    this.api.updateOutput?.(deviceId);
  }

    public async enableAudioHaptics(): Promise<void> {
        if (this.isAudioHapticsEnabled) {
            return;
        }

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
            throw new Error("getDisplayMedia não é suportado neste ambiente.");
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
                channelCount: 2,
                sampleRate: 48000
            }
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error("Nenhuma faixa de áudio disponível no stream.");
        }

        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass({
            sampleRate: 48000,
            latencyHint: "interactive", //
        });

        if (ctx.state === "suspended") {
            await ctx.resume();
        }

        const source = ctx.createMediaStreamSource(stream);

        if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function") {
            const blob = new Blob([AUDIO_HAPTICS_WORKLET_CODE], {type: "application/javascript"});
            const workletUrl = URL.createObjectURL(blob);
            try {
                await ctx.audioWorklet.addModule(workletUrl);
            } finally {
                URL.revokeObjectURL(workletUrl);
            }

            const workletNode = new AudioWorkletNode(ctx, "audio-haptics-worklet-processor");
            workletNode.port.onmessage = (event: MessageEvent) => {
                if (!this.isAudioHapticsEnabled || !this.api.audioSubmitSamples) {
                    return;
                }

                const {audioData, frameCount, numChannels} = event.data as {
                    audioData: Float32Array;
                    frameCount: number;
                    numChannels: number;
                };

                const totalFloats = frameCount * numChannels;
                const totalBytes  = totalFloats * Float32Array.BYTES_PER_ELEMENT;

                if (this.audioBufferCapacityBytes < totalBytes) {
                    if (this.audioBufferPtr !== 0) {
                        this.module._free(this.audioBufferPtr);
                    }
                    this.audioBufferPtr = this.module._malloc(totalBytes);
                    this.audioBufferCapacityBytes = totalBytes;
                }

                const heap = this.module.HEAPU8;
                const floatView = new Float32Array(heap.buffer, heap.byteOffset + this.audioBufferPtr, totalFloats);
                floatView.set(audioData);

                this.api.audioSubmitSamples(this.audioBufferPtr, frameCount, numChannels, ctx.sampleRate);
            };

            // Mute
            const muteNode = ctx.createGain();
            muteNode.gain.value = 0;

            //
            source.connect(workletNode);
            workletNode.connect(muteNode);
            muteNode.connect(ctx.destination);

            stream.getVideoTracks().concat(audioTracks).forEach((track) => {
                track.addEventListener("ended", () => {
                    if (this.isAudioHapticsEnabled) {
                        this.disableAudioHaptics().catch(console.error);
                    }
                });
            });

            this.audioMuteNode = muteNode;
            this.audioStream = stream;
            this.audioContext = ctx;
            this.audioSourceNode = source;
            this.audioProcessorNode = workletNode;
            this.isAudioHapticsEnabled = true;
            for (const deviceId of this.deviceIds) {
                this.applyAudioHapticsSettings(deviceId);
            }
        }
    }

  public async disableAudioHaptics(): Promise<void> {
    if (!this.isAudioHapticsEnabled) {
      return;
    }

    this.isAudioHapticsEnabled = false;

    if (this.audioProcessorNode) {
      this.audioProcessorNode.disconnect();
      if ("onaudioprocess" in this.audioProcessorNode) {
        (this.audioProcessorNode as ScriptProcessorNode).onaudioprocess = null;
      }
      if ("port" in this.audioProcessorNode) {
        const port = (this.audioProcessorNode as AudioWorkletNode).port;
        port.onmessage = null;
        port.close();
      }
      this.audioProcessorNode = null;
    }
    if (this.audioSourceNode) {
      this.audioSourceNode.disconnect();
      this.audioSourceNode = null;
    }
    if (this.audioMuteNode) {
      this.audioMuteNode.disconnect();
      this.audioMuteNode = null;
    }
    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    if (this.audioBufferPtr !== 0) {
      this.module._free(this.audioBufferPtr);
      this.audioBufferPtr = 0;
      this.audioBufferCapacityBytes = 0;
    }

    // RumbleMode = 0xff, vibracao normal.
    const ids = Array.from(this.deviceIds);
    for (const deviceId of ids) {
      this.applyAudioHapticsSettings(deviceId, 0xFF);
    }
  }

  public async toggleAudioHaptics(): Promise<boolean> {
    if (this.isAudioHapticsEnabled) {
      await this.disableAudioHaptics();
      return false;
    } else {
      await this.enableAudioHaptics();
      return true;
    }
  }

  public readInputState(deviceId: number): FInputContext {
    this.api.getInputState(deviceId, this.inputBufferPtr);
    const b = this.inputBufferPtr;
    const heap = this.module.HEAPU8;

    const rf = (offset: number) => {
      if (typeof this.module.getValue === "function") {
        return this.module.getValue(b + offset, "float");
      }
      const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
      return view.getFloat32(0, true);
    };

    const ri32 = (offset: number) => {
      if (typeof this.module.getValue === "function") {
        return this.module.getValue(b + offset, "i32");
      }
      const view = new DataView(heap.buffer, heap.byteOffset + b + offset, 4);
      return view.getInt32(0, true);
    };

    const rb = (offset: number) => (heap[b + offset] ?? 0) !== 0;
    const ru8 = (offset: number) => heap[b + offset] ?? 0;

    return {
      analogDeadZone: rf(0),

      leftAnalogX: rf(4),
      leftAnalogY: rf(8),
      rightAnalogX: rf(12),
      rightAnalogY: rf(16),
      leftTriggerAnalog: rf(20),
      rightTriggerAnalog: rf(24),

      gyroscopeX: rf(28),
      gyroscopeY: rf(32),
      gyroscopeZ: rf(36),

      accelerometerX: rf(40),
      accelerometerY: rf(44),
      accelerometerZ: rf(48),

      gravityX: rf(52),
      gravityY: rf(56),
      gravityZ: rf(60),

      tiltX: rf(64),
      tiltY: rf(68),
      tiltZ: rf(72),

      touchId: ri32(76),
      touchFingerCount: ri32(80),
      directionRaw: ru8(84),
      bIsTouching: rb(85),

      touchRadiusX: rf(88),
      touchRadiusY: rf(92),
      touchPositionX: rf(96),
      touchPositionY: rf(100),
      touchRelativeX: rf(104),
      touchRelativeY: rf(108),

      bCross: rb(112),
      bSquare: rb(113),
      bTriangle: rb(114),
      bCircle: rb(115),
      bDpadUp: rb(116),
      bDpadDown: rb(117),
      bDpadLeft: rb(118),
      bDpadRight: rb(119),

      bLeftAnalogRight: rb(120),
      bLeftAnalogUp: rb(121),
      bLeftAnalogDown: rb(122),
      bLeftAnalogLeft: rb(123),
      bRightAnalogLeft: rb(124),
      bRightAnalogDown: rb(125),
      bRightAnalogUp: rb(126),
      bRightAnalogRight: rb(127),

      bLeftTriggerThreshold: rb(128),
      bRightTriggerThreshold: rb(129),
      bLeftShoulder: rb(130),
      bRightShoulder: rb(131),
      bLeftStick: rb(132),
      bRightStick: rb(133),
      bPSButton: rb(134),
      bShare: rb(135),
      bStart: rb(136),
      bTouch: rb(137),
      bMute: rb(138),
      bHasPhoneConnected: rb(139),

      bFn1: rb(140),
      bFn2: rb(141),
      bPaddleLeft: rb(142),
      bPaddleRight: rb(143),

      batteryLevel: rf(144),
    };
  }

  private handleInput(deviceId: number, state: FInputContext): void {
    this.previousInput.set(deviceId, state);
  }

  public setTriggerEffect(deviceId: number, payload: Uint8Array, hand: number): void {
    if (!this.api.customTrigger || !this.api.updateOutput) {
      return;
    }
    this.module.HEAPU8.set(payload, this.outputBufferPtr);
    this.api.customTrigger(deviceId, this.outputBufferPtr, payload.length, hand);
    this.api.updateOutput(deviceId);
  }

  public stopTriggers(deviceId: number): void {
    this.api.stopTrigger?.(deviceId, 0);
    this.api.stopTrigger?.(deviceId, 1);
    this.api.updateOutput?.(deviceId);
  }

  public setBasicOutput(
    deviceId: number,
    leftRumble: number,
    rightRumble: number,
    red: number,
    green: number,
    blue: number
  ): void {
    this.api.setVibration?.(deviceId, leftRumble, rightRumble);
    this.api.lightbar?.(deviceId, red, green, blue);
    this.api.updateOutput?.(deviceId);
  }
}

export async function startGamepadClientLoop(typeId = 0): Promise<GamepadClientApplication> {
  const app = await GamepadClientApplication.create(typeId);
  app.run();
  return app;
}

function bindNativeApi(module: NativeModule): NativeApi {
  const cwrap = module.cwrap.bind(module);
  const must = (name: string, returnType: string | null, args: string[]): ((...args: number[]) => unknown) => {
    return cwrap(name, returnType, args);
  };

  const maybe = (
    name: string,
    returnType: string | null,
    args: string[]
  ): ((...args: number[]) => unknown) | undefined => {
    try {
      return cwrap(name, returnType, args);
    } catch {
      return undefined;
    }
  };

  return {
    setLogCallback: maybe("GCH_SetLogCallback", null, ["number"]) as NativeApi["setLogCallback"],
    discoverDevices: must("GCH_DiscoverDevices", null, ["number"]) as NativeApi["discoverDevices"],
    updateInput: must("GCH_UpdateInput", null, ["number", "number"]) as NativeApi["updateInput"],
    getInputState: must("GCH_GetInputState", null, ["number", "number"]) as NativeApi["getInputState"],
    enableGyroscopeValues: maybe("GCH_EnableGyroscopeValues", null, ["number", "number"]) as NativeApi["enableGyroscopeValues"],
    enableTouch: maybe("GCH_EnableTouch", null, ["number", "number"]) as NativeApi["enableTouch"],
    resetGyroOrientation: maybe("GCH_ResetGyroOrientation", null, ["number"]) as NativeApi["resetGyroOrientation"],
    batteryLevelDevice: maybe("GCH_BatteryLevelDevice", "number", ["number"]) as NativeApi["batteryLevelDevice"],
    setVibration: maybe(
      "GCH_SetVibration",
      null,
      ["number", "number", "number"]
    ) as NativeApi["setVibration"],
    lightbar: maybe(
      "GCH_Lightbar",
      null,
      ["number", "number", "number", "number"]
    ) as NativeApi["lightbar"],
    resetLights: maybe("GCH_ResetLights", null, ["number"]) as NativeApi["resetLights"],
    updateOutput: maybe("GCH_UpdateOutput", null, ["number"]) as NativeApi["updateOutput"],
    customTrigger: maybe(
      "GCH_CustomTrigger",
      "number",
      ["number", "number", "number", "number"]
    ) as NativeApi["customTrigger"],
    stopTrigger: maybe("GCH_StopTrigger", null, ["number", "number"]) as NativeApi["stopTrigger"],
    shutdown: maybe("GCH_Shutdown", null, []) as NativeApi["shutdown"],
    audioSubmitSamples: maybe(
      "GCH_AudioSubmitSamples",
      "number",
      ["number", "number", "number", "number"]
    ) as NativeApi["audioSubmitSamples"],
    getProcessAudioHaptics: (maybe(
      "GCH_GetProcessAudioHaptics",
      "number",
      ["number"]
    ) || maybe(
      "GCH_ProcessAudioHaptics",
      "number",
      ["number"]
    )) as NativeApi["getProcessAudioHaptics"],
    processAudioHaptics: (maybe(
      "GCH_GetProcessAudioHaptics",
      "number",
      ["number"]
    ) || maybe(
      "GCH_ProcessAudioHaptics",
      "number",
      ["number"]
    )) as NativeApi["processAudioHaptics"],
    dualsenseSettings: maybe(
      "GCH_DualSenseSettings",
      null,
      ["number", "number", "number", "number", "number", "number", "number", "number", "number"]
    ) as NativeApi["dualsenseSettings"],
  };
}

function registerLogCallback(module: NativeModule, api: NativeApi): number | null {
  if (!api.setLogCallback) {
    return null;
  }

  const logPtr = module.addFunction((level, messagePtr) => {
    const text = readCString(module.HEAPU8, messagePtr);
    console.log(`[Native:${level}] ${text}`);
  }, "vii");

  api.setLogCallback(logPtr);
  return logPtr;
}

async function loadGamepadCoreHostFactory(): Promise<(moduleArg?: Record<string, unknown>) => Promise<unknown>> {
  const esm = await import("./lib/GamepadCoreHost.js");
  const candidate = (esm as { default?: unknown }).default ?? esm;
  if (typeof candidate !== "function") {
    throw new Error("GamepadCoreHost.js inválido: export esperado é função de inicialização.");
  }
  return candidate as (moduleArg?: Record<string, unknown>) => Promise<unknown>;
}

function readCString(heap: Uint8Array, ptr: number): string {
  if (!ptr) {
    return "";
  }
  let end = ptr;
  while (heap[end] !== 0) {
    end++;
  }
  return new TextDecoder().decode(heap.subarray(ptr, end));
}

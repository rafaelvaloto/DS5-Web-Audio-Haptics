export {};

type DeviceType = 1 | 2 | 3 | 4;

interface WebHidInputReportEvent extends Event {
  readonly reportId: number;
  readonly data: DataView<ArrayBuffer>;
}

interface WebHidDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly serialNumber?: string;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: "inputreport", listener: (event: WebHidInputReportEvent) => void): void;
  removeEventListener(type: "inputreport", listener: (event: WebHidInputReportEvent) => void): void;
}

interface WebHidHost {
  __cachedDevices?: WebHidDevice[];
  getDevices(): Promise<WebHidDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId: number }> }): Promise<WebHidDevice[]>;
}

type NavigatorWithWebHid = Navigator & { hid?: WebHidHost };

export async function requestSonyWebHidAccess(): Promise<void> {
  const nav = navigator as NavigatorWithWebHid;
  if (!nav.hid) {
    throw new Error("WebHID não está disponível neste navegador.");
  }
  const devices = await nav.hid.requestDevice({ filters: [{ vendorId: SONY_VENDOR_ID }] });
  nav.hid.__cachedDevices = devices;
}

const SONY_VENDOR_ID = 0x054c;
const DEVICE_TYPE_BY_PRODUCT_ID: Record<number, DeviceType> = {
  0x0ce6: 1, // DualSense
  0x0df2: 2, // DualSense Edge
  0x05c4: 3, // DualShock 4
  0x09cc: 3, // DualShock 4 (rev)
};

const DESCRIPTOR_SIZE = 532;
const PATH_SIZE = 512;
const HANDLE_OFFSET = 0;
const DEVICE_TYPE_OFFSET = 8;
const CONNECTION_TYPE_OFFSET = 12;
const IS_CONNECTED_OFFSET = 16;
const PATH_OFFSET = 20;

const CONNECTION_USB = 1;

type CallbackSignatureConfig = {
  read: string;
  write: string;
  detect: string;
  createHandle: string;
  invalidateHandle: string;
  configureFeatures: string;
  processAudioHaptics: string;
};

const DEFAULT_SIGNATURES: CallbackSignatureConfig = {
  read: "iiiii",
  write: "iiiii",
  detect: "iii",
  createHandle: "ii",
  invalidateHandle: "vi",
  configureFeatures: "ii",
  processAudioHaptics: "vii",
};

type DeviceRegistrySignatureConfig = {
  alloc: string;
  dispatch: string;
  disconnect: string;
};

const DEFAULT_DEVICE_REGISTRY_SIGNATURES: DeviceRegistrySignatureConfig = {
  alloc: "ii",
  dispatch: "vii",
  disconnect: "vi",
};

export interface EmscriptenLikeModule {
  HEAPU8: Uint8Array;
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: number[]) => unknown;
  addFunction(fn: (...args: number[]) => number | void, signature: string): number;
  removeFunction(fnPtr: number): void;
}

export interface PlatformBridgeRegistration {
  dispose(): Promise<void>;
}

export type AllocEngineDeviceCallback = (...args: number[]) => number;
export type DispatchNewGamepadCallback = (...args: number[]) => void;
export type DisconnectDeviceCallback = (...args: number[]) => void;

export interface DeviceRegistryPolicyCallbacks {
  alloc: AllocEngineDeviceCallback;
  dispatch: DispatchNewGamepadCallback;
  disconnect: DisconnectDeviceCallback;
}

export interface DeviceRegistryPolicyRegistration {
  dispose(): void;
}

type ManagedDevice = {
  path: string;
  deviceType: DeviceType;
  device: WebHidDevice;
  handleId: number;
  lastInputPacket: Uint8Array;
  inputListener?: (event: WebHidInputReportEvent) => void;
};

export class WebHidPlatformBridge {
  private readonly byPath = new Map<string, ManagedDevice>();
  private readonly byHandle = new Map<number, ManagedDevice>();
  private nextHandle = 1;

  async requestSonyDevices(): Promise<WebHidDevice[]> {
    const nav = navigator as NavigatorWithWebHid;
    if (!nav.hid) {
      throw new Error("WebHID não está disponível neste navegador.");
    }

    const devices = await nav.hid.requestDevice({
      filters: [{ vendorId: SONY_VENDOR_ID }],
    });
    nav.hid.__cachedDevices = devices;
    return devices;
  }

  detect = (heap: Uint8Array, descriptorsBuffer: number, maxDevices: number): number => {
    if (descriptorsBuffer === 0 || maxDevices <= 0) {
      return 0;
    }

    const devices = this.getSupportedDevicesSync();
    let found = 0;

    for (const device of devices) {
      if (found >= maxDevices) {
        break;
      }
      const deviceType = DEVICE_TYPE_BY_PRODUCT_ID[device.productId];
      if (deviceType === undefined) {
        continue;
      }

      const path = this.makePath(device, found);
      const descriptorPtr = descriptorsBuffer + found * DESCRIPTOR_SIZE;
      const descriptorView = new DataView(heap.buffer, heap.byteOffset + descriptorPtr, DESCRIPTOR_SIZE);
      const pathBytes = this.toFixedPath(path);

      this.writeHandleU64(descriptorView, HANDLE_OFFSET, 0);
      descriptorView.setInt32(DEVICE_TYPE_OFFSET, deviceType, true);
      descriptorView.setInt32(CONNECTION_TYPE_OFFSET, CONNECTION_USB, true);
      descriptorView.setInt32(IS_CONNECTED_OFFSET, 1, true);
      heap.set(pathBytes, descriptorPtr + PATH_OFFSET);

      const existing = this.byPath.get(path);
      if (existing) {
        existing.device = device;
      } else {
        this.byPath.set(path, {
          path,
          deviceType,
          device,
          handleId: 0,
          lastInputPacket: new Uint8Array(0),
        });
      }

      found++;
    }

    return found;
  };

  createHandle = (heap: Uint8Array, descriptorBuffer: number): boolean => {
    if (descriptorBuffer === 0) {
      return false;
    }

    const descriptorView = new DataView(heap.buffer, heap.byteOffset + descriptorBuffer, DESCRIPTOR_SIZE);
    const path = this.pathFromHeap(heap, descriptorBuffer + PATH_OFFSET, PATH_SIZE);
    if (!path) {
      return false;
    }

    const entry = this.byPath.get(path);
    if (!entry) {
      return false;
    }

    if (!entry.handleId) {
      entry.handleId = this.nextHandle++;
      this.byHandle.set(entry.handleId, entry);
      this.ensureInputCapture(entry);
    }

    this.writeHandleU64(descriptorView, HANDLE_OFFSET, entry.handleId);
    descriptorView.setInt32(IS_CONNECTED_OFFSET, 1, true);
    return true;
  };

  read = (heap: Uint8Array, handle: number, buffer: number, length: number, bytesReadPtr: number): boolean => {
    if (handle <= 0 || buffer === 0 || length <= 0) {
      this.writeInt32(heap, bytesReadPtr, 0);
      return false;
    }

    const entry = this.byHandle.get(handle);
    if (!entry) {
      this.writeInt32(heap, bytesReadPtr, 0);
      return false;
    }

    const packet = entry.lastInputPacket;
    const bytesToCopy = Math.min(length, packet.length);
    heap.set(packet.subarray(0, bytesToCopy), buffer);
    this.writeInt32(heap, bytesReadPtr, bytesToCopy);
    return bytesToCopy > 0;
  };

  write = (heap: Uint8Array, handle: number, buffer: number, length: number, bytesWrittenPtr: number): boolean => {
    if (handle <= 0 || buffer === 0 || length <= 0) {
      this.writeInt32(heap, bytesWrittenPtr, 0);
      return false;
    }

    const entry = this.byHandle.get(handle);
    if (!entry?.device.opened) {
      this.writeInt32(heap, bytesWrittenPtr, 0);
      return false;
    }

    const output = heap.slice(buffer, buffer + length);
    const reportId = output[0] ?? 0;
    const payload = output.subarray(1);

    entry.device.sendReport(reportId, payload).catch((error: unknown) => {
      console.error("WebHID sendReport falhou:", error);
    });

    this.writeInt32(heap, bytesWrittenPtr, length);
    return true;
  };

  invalidateHandle = (handle: number): void => {
    const entry = this.byHandle.get(handle);
    if (!entry) {
      return;
    }

    this.byHandle.delete(handle);
    entry.handleId = 0;
    if (entry.inputListener) {
      entry.device.removeEventListener("inputreport", entry.inputListener);
      entry.inputListener = undefined;
    }
  };

  configureFeatures = (): boolean => {
    return true;
  };

  processAudioHaptics = (): void => {

  };

  async dispose(): Promise<void> {
    for (const entry of this.byPath.values()) {
      if (entry.inputListener) {
        entry.device.removeEventListener("inputreport", entry.inputListener);
      }
      if (entry.device.opened) {
        await entry.device.close().catch(() => undefined);
      }
    }
    this.byPath.clear();
    this.byHandle.clear();
  }

  private getSupportedDevicesSync(): WebHidDevice[] {
    const hid = (navigator as NavigatorWithWebHid).hid;
    if (!hid) {
      return [];
    }

    // getDevices é assíncrono na API; aqui usamos cache do navegador para manter callback síncrono.
    // Se a lista estiver vazia, chame requestSonyDevices() antes da inicialização do bridge.
    const shadow = hid.__cachedDevices;
    if (Array.isArray(shadow)) {
      return shadow.filter((d) => d.vendorId === SONY_VENDOR_ID && DEVICE_TYPE_BY_PRODUCT_ID[d.productId] !== undefined);
    }

    return [];
  }

  async refreshCachedDevices(): Promise<void> {
    const nav = navigator as NavigatorWithWebHid;
    if (!nav.hid) {
      return;
    }
    const devices = await nav.hid.getDevices();
    nav.hid.__cachedDevices = devices;
  }

  private ensureInputCapture(entry: ManagedDevice): void {
    const device = entry.device;

    if (!device.opened) {
      device.open().catch((error: unknown) => {
        console.error("WebHID open falhou:", error);
      });
    }

    if (entry.inputListener) {
      return;
    }

    entry.inputListener = (event: WebHidInputReportEvent) => {
      const body = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      const packet = new Uint8Array(body.length + 1);
      packet[0] = event.reportId;
      packet.set(body, 1);
      entry.lastInputPacket = packet;
    };

    device.addEventListener("inputreport", entry.inputListener);
  }

  private makePath(device: WebHidDevice, index: number): string {
    const serial = device.serialNumber?.trim() || "noserial";
    return `webhid:${device.vendorId.toString(16)}:${device.productId.toString(16)}:${serial}:${index}`;
  }

  private toFixedPath(path: string): Uint8Array {
    const bytes = new TextEncoder().encode(path);
    const fixed = new Uint8Array(PATH_SIZE);
    fixed.set(bytes.subarray(0, PATH_SIZE - 1), 0);
    return fixed;
  }

  private pathFromHeap(heap: Uint8Array, ptr: number, maxLength: number): string {
    const slice = heap.subarray(ptr, ptr + maxLength);
    let end = 0;
    while (end < slice.length && slice[end] !== 0) {
      end++;
    }
    return new TextDecoder().decode(slice.subarray(0, end)).trim();
  }

  private writeInt32(heap: Uint8Array, ptr: number, value: number): void {
    if (!ptr) {
      return;
    }
    new DataView(heap.buffer, heap.byteOffset + ptr, 4).setInt32(0, value, true);
  }

  private writeHandleU64(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value >>> 0, true);
    view.setUint32(offset + 4, 0, true);
  }
}

export async function initializeWebHidPlatformBridge(
  module: EmscriptenLikeModule,
  signatures: Partial<CallbackSignatureConfig> = {}
): Promise<PlatformBridgeRegistration> {
  if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
    throw new Error(
      "Module sem addFunction/removeFunction. Recompile o WASM com EXPORTED_RUNTIME_METHODS=addFunction,removeFunction."
    );
  }

  const bridge = new WebHidPlatformBridge();
  await bridge.refreshCachedDevices();

  const resolved = { ...DEFAULT_SIGNATURES, ...signatures };

  const readPtr = module.addFunction((handle, buffer, length, bytesRead) => {
    return bridge.read(module.HEAPU8, handle, buffer, length, bytesRead) ? 1 : 0;
  }, resolved.read);

  const writePtr = module.addFunction((handle, buffer, length, bytesWritten) => {
    return bridge.write(module.HEAPU8, handle, buffer, length, bytesWritten) ? 1 : 0;
  }, resolved.write);

  const detectPtr = module.addFunction((descriptorsBuffer, maxDevices) => {
    return bridge.detect(module.HEAPU8, descriptorsBuffer, maxDevices);
  }, resolved.detect);

  const createHandlePtr = module.addFunction((descriptorBuffer) => {
    return bridge.createHandle(module.HEAPU8, descriptorBuffer) ? 1 : 0;
  }, resolved.createHandle);

  const invalidateHandlePtr = module.addFunction((handle) => {
    bridge.invalidateHandle(handle);
  }, resolved.invalidateHandle);

  const configureFeaturesPtr = module.addFunction(() => {
    return bridge.configureFeatures() ? 1 : 0;
  }, resolved.configureFeatures);

  const processAudioHapticsPtr = module.addFunction(() => {
    bridge.processAudioHaptics();
  }, resolved.processAudioHaptics);

  const initializeBridge = module.cwrap("GCH_InitializePlatformBridge", null, [
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
    "number",
  ]);

  initializeBridge(
    readPtr,
    writePtr,
    detectPtr,
    createHandlePtr,
    invalidateHandlePtr,
    configureFeaturesPtr,
    processAudioHapticsPtr
  );

  return {
    dispose: async () => {
      module.removeFunction(readPtr);
      module.removeFunction(writePtr);
      module.removeFunction(detectPtr);
      module.removeFunction(createHandlePtr);
      module.removeFunction(invalidateHandlePtr);
      module.removeFunction(configureFeaturesPtr);
      module.removeFunction(processAudioHapticsPtr);
      await bridge.dispose();
    },
  };
}

export function initializeDeviceRegistryPolicy(
  module: EmscriptenLikeModule,
  typeId: number,
  callbacks: DeviceRegistryPolicyCallbacks,
  signatures: Partial<DeviceRegistrySignatureConfig> = {}
): DeviceRegistryPolicyRegistration {
  if (typeof module.addFunction !== "function" || typeof module.removeFunction !== "function") {
    throw new Error(
      "Module sem addFunction/removeFunction. Recompile o WASM com EXPORTED_RUNTIME_METHODS=addFunction,removeFunction."
    );
  }

  const resolved = { ...DEFAULT_DEVICE_REGISTRY_SIGNATURES, ...signatures };

  const allocPtr = module.addFunction((...args) => {
    return callbacks.alloc(...args);
  }, resolved.alloc);

  const dispatchPtr = module.addFunction((...args) => {
    callbacks.dispatch(...args);
  }, resolved.dispatch);

  const disconnectPtr = module.addFunction((...args) => {
    callbacks.disconnect(...args);
  }, resolved.disconnect);

  const initializePolicy = module.cwrap("GCH_InitializeDeviceRegistryPolicy", null, [
    "number",
    "number",
    "number",
    "number",
  ]);

  initializePolicy(typeId, allocPtr, dispatchPtr, disconnectPtr);

  return {
    dispose: () => {
      module.removeFunction(allocPtr);
      module.removeFunction(dispatchPtr);
      module.removeFunction(disconnectPtr);
    },
  };
}

export function createInMemoryDeviceRegistryPolicy(startEngineDeviceId = 1): DeviceRegistryPolicyCallbacks {
  let nextId = startEngineDeviceId;
  const handlesToEngineIds = new Map<number, number>();

  return {
    alloc: (handleOrDescriptorPtr) => {
      const key = handleOrDescriptorPtr > 0 ? handleOrDescriptorPtr : nextId;
      const existing = handlesToEngineIds.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const created = nextId++;
      handlesToEngineIds.set(key, created);
      return created;
    },
    dispatch: () => {
      // Encaminhamento para a engine fica no callback consumidor.
    },
    disconnect: (handleOrDescriptorPtr) => {
      if (handleOrDescriptorPtr > 0) {
        handlesToEngineIds.delete(handleOrDescriptorPtr);
      }
    },
  };
}

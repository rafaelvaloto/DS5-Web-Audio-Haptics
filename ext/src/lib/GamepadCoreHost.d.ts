declare const InitGamepadCoreHost: (moduleArg?: Record<string, unknown>) => Promise<{
  HEAPU8: Uint8Array;
  HEAPF32?: Float32Array;
  cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: number[]) => unknown;
  addFunction(fn: (...args: number[]) => number | void, signature: string): number;
  removeFunction(fnPtr: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  getValue?(ptr: number, type: string): number;
  setValue?(ptr: number, value: number, type: string): void;
}>;

export default InitGamepadCoreHost;

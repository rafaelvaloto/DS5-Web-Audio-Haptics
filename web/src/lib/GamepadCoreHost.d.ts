export interface NativeModule {
	HEAPU8: Uint8Array;
	HEAPF32?: Float32Array;

	// cwrap accepts any input arguments and returns anything
	cwrap(name: string, returnType: string | null, argTypes: string[]): (...args: any[]) => any;

	// addFunction accepts a function and a signature string and returns a number (pointer)
	addFunction(fn: Function, signature: string): number;

	removeFunction(fnPtr: number): void;
	_malloc(size: number): number;
	_free(ptr: number): void;
	getValue?(ptr: number, type: string): number;
	setValue?(ptr: number, value: number, type: string): void;
}

export declare const InitGamepadCoreHost: (moduleArg?: Record<string, unknown>) => Promise<NativeModule>;

export type SupportedLocale = "en" | "pt-BR" | "es";

export interface TranslationDictionary {
  header: {
    title: string;
    subtitle: string;
    btnLoadWasm: string;
    btnConnectHid: string;
    btnStartLoop: string;
    btnStopLoop: string;
    btnAudioHaptics?: string;
    btnAudioHapticsOn?: string;
    btnPip?: string;
    btnClearLogs: string;
    language: string;
  };
  status: {
    wasm: string;
    notLoaded: string;
    ready: string;
    error: string;
    device: string;
    none: string;
    connected: string;
    gyro: string;
    touch: string;
    audioHaptics?: string;
    active: string;
    inactive: string;
    battery: string;
    rate: string;
  };
  cards: {
    commands: {
      title: string;
      subtitle: string;
    };
    analogs: {
      title: string;
      subtitle: string;
    };
    buttons: {
      title: string;
      subtitle: string;
    };
    motion: {
      title: string;
      subtitle: string;
    };
    touchpad: {
      title: string;
      subtitle: string;
    };
    logs: {
      title: string;
      subtitle: string;
    };
  };
  controls?: {
    triggerEffectsTitle: string;
    selectTriggerEffect: string;
    targetTrigger: string;
    applyTrigger: string;
    resetTriggers: string;
    lightbarTitle: string;
    selectColor: string;
    applyColor: string;
    vibrationTitle: string;
    testSoft: string;
    testHeavy: string;
    testBoth: string;
    stopVibration: string;
    stopAll: string;
    leftTrigger: string;
    rightTrigger: string;
    bothTriggers: string;
    effectNone: string;
    effectGameCube: string;
    effectGallop: string;
    effectMachine: string;
    effectFeedback: string;
    effectBow: string;
    effectWeapon: string;
    effectAutoGun: string;
    inputServerHint?: string;
    inputServerRepository?: string;
  };
  commands?: {
    cross: string;
    circle: string;
    square: string;
    triangle: string;
    l1: string;
    r1: string;
    up: string;
    down: string;
    left: string;
    right: string;
  };
  analogs: {
    l1: string;
    l2: string;
    r1: string;
    r2: string;
    threshold: string;
    deadzone: string;
    active: string;
    leftStick: string;
    rightStick: string;
    l3Click: string;
    r3Click: string;
    up: string;
    down: string;
    left: string;
    right: string;
  };
  buttons: {
    cross: string;
    circle: string;
    square: string;
    triangle: string;
    dpadUp: string;
    dpadDown: string;
    dpadLeft: string;
    dpadRight: string;
    ps: string;
    share: string;
    options: string;
    touchClick: string;
    mute: string;
    phone: string;
    fn1: string;
    fn2: string;
    paddleL: string;
    paddleR: string;
  };
  motion: {
    gyroscope: string;
    accelerometer: string;
    gravity: string;
    tilt: string;
  };
  touchpad: {
    status: string;
    touching: string;
    notTouching: string;
    touchId: string;
    fingers: string;
    direction: string;
    position: string;
    relative: string;
    radius: string;
  };
  logs: {
    wasmLoading: string;
    wasmLoaded: string;
    wasmFailed: string;
    webHidPrompt: string;
    webHidConnected: string;
    webHidNotFound: string;
    loopStarted: string;
    loopStopped: string;
    gyroEnabled: string;
    touchEnabled: string;
    triggerApplied: string;
    rumbleApplied: string;
    allStopped: string;
    notConnected: string;
  };
}

import { vi } from "vitest";

const globalScope = globalThis as typeof globalThis & { __DEV__?: boolean };

if (typeof globalScope.__DEV__ === "undefined") {
  Object.defineProperty(globalThis, "__DEV__", {
    configurable: true,
    writable: true,
    value: false,
  });
}

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
    Rigid: "rigid",
    Soft: "soft",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

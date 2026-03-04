import React from "react";

type HostProps = { children?: React.ReactNode; [key: string]: any };

function host(name: string) {
  const Component = React.forwardRef<unknown, HostProps>((props, ref) =>
    React.createElement(name, { ...props, ref }, props.children)
  );
  Component.displayName = name;
  return Component;
}

function flattenStyle(input: unknown): Record<string, unknown> {
  if (!input) {
    return {};
  }
  if (Array.isArray(input)) {
    return input.reduce<Record<string, unknown>>((acc, value) => ({ ...acc, ...flattenStyle(value) }), {});
  }
  if (typeof input === "object") {
    return input as Record<string, unknown>;
  }
  return {};
}

export const View = host("View");
export const Text = host("Text");
export const ScrollView = host("ScrollView");
export const Pressable = host("Pressable");
export const Switch = host("Switch");
export const TextInput = host("TextInput");
export const Modal = host("Modal");
export const SafeAreaView = host("SafeAreaView");
export const KeyboardAvoidingView = host("KeyboardAvoidingView");
export const ActivityIndicator = host("ActivityIndicator");
export const Image = host("Image");

export const Alert = {
  alert: (_title?: string, _message?: string, _buttons?: Array<{ text?: string; onPress?: () => void }>) => {},
};

export const Share = {
  sharedAction: "sharedAction",
  dismissedAction: "dismissedAction",
  share: async (_content: unknown) => ({ action: "sharedAction" }),
};

export const AppState = {
  currentState: "active",
  addEventListener: (_type: string, _listener: (state: string) => void) => ({
    remove: () => {},
  }),
};

export const PanResponder = {
  create: (handlers: Record<string, unknown>) => ({
    panHandlers: handlers,
  }),
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(value: T) => value,
  flatten: (value: unknown) => flattenStyle(value),
  hairlineWidth: 1,
};

export const Platform = {
  OS: "ios",
  select: <T>(options: { ios?: T; android?: T; web?: T; default?: T }) =>
    options.ios ?? options.default ?? options.android ?? options.web,
};

export function useWindowDimensions() {
  return { width: 1280, height: 720, scale: 2, fontScale: 1 };
}

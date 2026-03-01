import React from "react";

import AppShell from "./AppShell";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installSecureStoreWebFallback } from "./polyfills/secureStoreWeb";

installSecureStoreWebFallback();

export default function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}

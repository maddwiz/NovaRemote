import React from "react";

import AppShell from "./AppShell";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

export default function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}

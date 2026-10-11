import React from "react";
import { render } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import { CrumbProvider } from "@/components/ui/Breadcrumbs";
import { setExecutionMode } from "@/lib/api-client";
import { resetStore } from "@/lib/store";

export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <CrumbProvider>{ui}</CrumbProvider>
    </ToastProvider>
  );
}

/** Fresh Demo Mode dataset for each test. */
export function useFreshDemoData() {
  setExecutionMode("demo");
  resetStore();
}

export { navState, routerMock } from "./test-nav";

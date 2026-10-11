import { vi } from "vitest";

// Mutable stand-ins for next/navigation, kept in a dependency-free module so vi.mock
// factories can import it without a circular import through the component tree.
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
};

export const navState: { pathname: string; params: URLSearchParams; routeParams: Record<string, string> } = {
  pathname: "/",
  params: new URLSearchParams(),
  routeParams: {},
};

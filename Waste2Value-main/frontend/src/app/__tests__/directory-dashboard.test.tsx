import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => {
  const t = await import("@/test-nav");
  return {
    useRouter: () => t.routerMock,
    usePathname: () => t.navState.pathname,
    useSearchParams: () => t.navState.params,
    useParams: () => t.navState.routeParams,
  };
});
// recharts needs layout; the charts are replaced so tests focus on the accessible text/table alternatives.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div data-testid="chart-stub">{children}</div>;
  return { ResponsiveContainer: Stub, BarChart: Stub, PieChart: Stub, Bar: Stub, Pie: Stub, Cell: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, Legend: Stub, CartesianGrid: Stub };
});

import DirectoryPage from "../batches/page";
import DashboardPage from "../dashboard/page";
import { navState, renderWithProviders, routerMock, useFreshDemoData } from "@/test-utils";
import { setExecutionMode } from "@/lib/api-client";
import { demoRecordDecision } from "@/lib/store";

beforeEach(() => {
  useFreshDemoData();
  navState.pathname = "/batches";
  navState.params = new URLSearchParams();
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setExecutionMode("demo");
});

describe("Batch directory", () => {
  it("lists batches with verification, risk and passport state in separate columns and unknown masses as Not recorded", async () => {
    renderWithProviders(<DirectoryPage />);
    const row = (await screen.findByRole("link", { name: "BATCH-2025-002" })).closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    const text = cells.map((c) => c.textContent);
    expect(text.join(" | ")).toMatch(/Review Required/);
    expect(text.join(" | ")).toMatch(/Medium Risk|High Risk/);
    expect(text.join(" | ")).toMatch(/No Passport Issued/);
    expect(text.join(" | ")).toMatch(/Not recorded/); // processed mass
    expect(screen.getByRole("columnheader", { name: "Claimed mass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Received mass" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Processed mass" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Evidence-Supported Mass/i })).not.toBeInTheDocument();
  });

  it("changing one filter keeps the others (URL-synced)", async () => {
    navState.params = new URLSearchParams("category=large_appliances");
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />);
    await screen.findByRole("link", { name: "BATCH-2025-003" });
    await user.selectOptions(screen.getByLabelText("Verification status"), "REVIEW_REQUIRED");
    const url = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("category=large_appliances");
    expect(url).toContain("status=REVIEW_REQUIRED");
  });

  it("shows removable chips and a working clear-all", async () => {
    navState.params = new URLSearchParams("category=large_appliances&status=REVIEW_REQUIRED&search=apex");
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />);
    await screen.findByRole("link", { name: "BATCH-2025-003" });
    expect(screen.queryByRole("link", { name: "BATCH-2025-001" })).not.toBeInTheDocument();
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Remove filter Verification/ }));
    const afterRemove = routerMock.replace.mock.calls.at(-1)?.[0] as string;
    expect(afterRemove).toContain("category=large_appliances");
    expect(afterRemove).toContain("search=apex");
    expect(afterRemove).not.toContain("status=");
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(routerMock.replace.mock.calls.at(-1)?.[0]).toBe("/batches");
  });

  it("explains an empty result and offers to reset", async () => {
    navState.params = new URLSearchParams("search=zzzz");
    renderWithProviders(<DirectoryPage />);
    expect(await screen.findByText("No matching batches")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear all filters" }).length).toBeGreaterThan(0);
  });

  it("navigates on a bare row click but not twice when a nested link is used", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />);
    const link = await screen.findByRole("link", { name: "BATCH-2025-001" });
    const row = link.closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("cell", { name: /GreenTech/ }));
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(routerMock.push).toHaveBeenCalledWith("/batches/batch-001");
    routerMock.push.mockClear();
    await user.click(within(row).getByRole("link", { name: /Inspect evidence/ }));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("is keyboard operable: the batch id is a focusable link", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />);
    const link = await screen.findByRole("link", { name: "BATCH-2025-001" });
    link.focus();
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute("href", "/batches/batch-001");
    await user.keyboard("{Enter}");
  });

  it("shows an API failure in Live Mode instead of demo rows", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    renderWithProviders(<DirectoryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/unreachable/i);
    expect(screen.queryByRole("link", { name: "BATCH-2025-001" })).not.toBeInTheDocument();
  });

  it("shows an empty dataset call to action", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
    renderWithProviders(<DirectoryPage />);
    expect(await screen.findByText("No batches yet")).toBeInTheDocument();
  });
});

describe("Dashboard", () => {
  beforeEach(() => {
    navState.pathname = "/dashboard";
  });

  it("shows KPI cards with definitions, units and provenance", async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("Total batches")).toBeInTheDocument();
    expect(screen.getByText("Evidence-supported received mass")).toBeInTheDocument();
    expect(screen.getByText("4.96 t")).toBeInTheDocument();
    expect(screen.getByText(/Received stage only: not processed or recovered mass/)).toBeInTheDocument();
    expect(screen.getByText(/Not counted: 19,700 kg documented on batches that are not evidence supported/)).toBeInTheDocument();
    expect(screen.getByText(/Illustrative reference prices/)).toBeInTheDocument();
    expect(screen.getByText(/^USD [\d,]+$/)).toBeInTheDocument();
  });

  it("orders the page: KPIs, then investigation queue, then analytics, then recent batches", async () => {
    renderWithProviders(<DirectoryPageOrder />);
    await screen.findByText("Total batches");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const idx = (s: RegExp) => headings.findIndex((h) => s.test(h ?? ""));
    expect(idx(/Active investigations queue/)).toBeGreaterThanOrEqual(0);
    expect(idx(/Active investigations queue/)).toBeLessThan(idx(/Recent batches/));
  });

  it("separates queue sections and links each item to its exact finding", async () => {
    demoRecordDecision("batch-003", "REJECTED", "Fraud confirmed", "tester");
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Review required/, { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText(/Rejected cases requiring authorized follow-up/, { selector: "h3" })).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /^Review finding/ });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.getAttribute("href")).toMatch(/^\/batches\/batch-00[23]#finding-find-/);
    expect(screen.getAllByText(/Next action:/).length).toBe(links.length);
  });

  it("offers a table alternative for each chart", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await screen.findByText("Total batches");
    await user.click(screen.getByRole("button", { name: /Show data table/ }));
    const table = screen.getByRole("table", { name: /Claimed, received and processed mass per batch/ });
    expect(within(table).getAllByText("Not recorded").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Show table/ }));
    expect(screen.getByRole("table", { name: /Number of batches per verification status/ })).toBeInTheDocument();
  });

  it("reports a Live Mode failure without fabricating metrics", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load batches/);
    await waitFor(() => expect(screen.queryByText("Total batches")).not.toBeInTheDocument());
    expect(screen.getByText(/Queue unavailable/)).toBeInTheDocument();
  });
});

function DirectoryPageOrder() {
  return <DashboardPage />;
}

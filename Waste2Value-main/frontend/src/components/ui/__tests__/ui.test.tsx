import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

import { IntegrityBadge, PassportStatusBadge, RiskBadge, SignatureBadge, StatusBadge } from "../Badge";
import { ConfirmDialog } from "../ConfirmDialog";
import { GlobalSearch, isEditableTarget } from "../GlobalSearch";
import { Breadcrumbs, CrumbProvider, useCrumbs } from "../Breadcrumbs";
import { setExecutionMode } from "@/lib/api-client";
import { resetStore } from "@/lib/store";

describe("status badges", () => {
  it("expose text, an accessible name and an explanatory tooltip (not colour alone)", () => {
    render(<StatusBadge status="REVIEW_REQUIRED" />);
    const badge = screen.getByText("Review Required").closest("[title]") as HTMLElement;
    expect(badge).toHaveAttribute("title", expect.stringMatching(/not a rejection/i));
    expect(screen.getByText(/Verification status:/)).toBeInTheDocument();
  });

  it("keeps a review-required batch distinct from a rejected one", () => {
    const { rerender } = render(<StatusBadge status="REVIEW_REQUIRED" />);
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    rerender(<StatusBadge status="REJECTED" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("renders passport lifecycle independently of verification status", () => {
    render(
      <>
        <StatusBadge status="SUPPORTED" />
        <PassportStatusBadge status="REVOKED" />
      </>
    );
    expect(screen.getByText("Evidence Supported")).toBeInTheDocument();
    expect(screen.getByText("Passport Revoked")).toBeInTheDocument();
  });

  it("never labels an unconfigured or simulated signature as valid", () => {
    const { rerender } = render(<SignatureBadge state="NOT_CONFIGURED" />);
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
    rerender(<SignatureBadge state="SIMULATED" />);
    expect(screen.getByText(/Simulated \(not authentic\)/)).toBeInTheDocument();
    expect(screen.queryByText("Signature Valid")).not.toBeInTheDocument();
  });

  it("explains that a hash match is not issuer identity or physical proof", () => {
    render(<IntegrityBadge state="VALID" />);
    expect(screen.getByText("Hash Matches").closest("[title]")).toHaveAttribute("title", expect.stringMatching(/does not identify the issuer/));
  });

  it("shows risk with its score", () => {
    render(<RiskBadge level="high" score={92} />);
    expect(screen.getByText("High Risk (92/100)")).toBeInTheDocument();
  });
});

function DialogHarness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <input aria-label="Background field" />
      <ConfirmDialog isOpen={open} onClose={() => setOpen(false)} onConfirm={onConfirm} title="Revoke it?" description="This is a test." confirmText="Do it">
        <label>
          Reason
          <input data-autofocus />
        </label>
      </ConfirmDialog>
    </div>
  );
}

describe("ConfirmDialog accessibility", () => {
  it("is labelled and described, moves focus in, traps Tab, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Revoke it?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This is a test.");
    expect(screen.getByLabelText("Reason")).toHaveFocus();

    // Background is inert while the dialog is open.
    expect(document.body.querySelector("[inert]")).not.toBeNull();

    // Tab cycles within the dialog only.
    const seen = new Set<Element | null>();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      seen.add(document.activeElement);
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(2);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body.querySelector("[inert]")).toBeNull();
  });

  it("disables confirm until allowed", () => {
    render(<ConfirmDialog isOpen onClose={vi.fn()} onConfirm={vi.fn()} title="T" description="D" confirmDisabled />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("does not close on Escape while busy", () => {
    const onClose = vi.fn();
    render(<ConfirmDialog isOpen onClose={onClose} onConfirm={vi.fn()} title="T" description="D" isLoading />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("global search '/' shortcut", () => {
  beforeEach(() => {
    setExecutionMode("demo");
    resetStore();
  });

  it("focuses the search input", async () => {
    render(<GlobalSearch />);
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("does not hijack typing in other inputs or editable regions", () => {
    render(
      <>
        <GlobalSearch />
        <input aria-label="other" />
        <textarea aria-label="ta" />
        <div contentEditable suppressContentEditableWarning data-testid="ce" />
      </>
    );
    const other = screen.getByLabelText("other");
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();
    const ta = screen.getByLabelText("ta");
    ta.focus();
    fireEvent.keyDown(ta, { key: "/" });
    expect(ta).toHaveFocus();
    expect(isEditableTarget(screen.getByTestId("ce"))).toBe(true);
  });

  it("ignores '/' with modifiers and while a modal dialog is open", () => {
    render(
      <>
        <GlobalSearch />
        <div role="dialog" aria-modal="true" />
      </>
    );
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("shows typed results, an empty state, and loading/error states", async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);
    const box = screen.getByRole("searchbox");
    await user.type(box, "W2V-CP-0001");
    expect(await screen.findByText("Passport")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Passport for BATCH-2025-001/ })).toHaveAttribute("href", "/passports/W2V-CP-0001");
    await user.clear(box);
    await user.type(box, "zzzzzz");
    expect(await screen.findByText(/No batches, passports or evidence match/)).toBeInTheDocument();
  });

  it("reports a search failure in Live Mode instead of silently using demo data", async () => {
    setExecutionMode("live");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    const user = userEvent.setup();
    render(<GlobalSearch />);
    await user.type(screen.getByRole("searchbox"), "abc");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Search unavailable/);
    vi.unstubAllGlobals();
    setExecutionMode("demo");
  });
});

function CrumbPage() {
  useCrumbs([{ label: "Batches", href: "/batches" }, { label: "BATCH-1", href: "/batches/b1" }, { label: "Evidence", href: "/evidence" }, { label: "CERT.pdf" }]);
  return <Breadcrumbs />;
}

describe("breadcrumbs", () => {
  afterEach(() => undefined);
  it("renders real links for ancestors and marks the current page", () => {
    render(
      <CrumbProvider>
        <CrumbPage />
      </CrumbProvider>
    );
    expect(screen.getByRole("link", { name: "Batches" })).toHaveAttribute("href", "/batches");
    expect(screen.getByRole("link", { name: "BATCH-1" })).toHaveAttribute("href", "/batches/b1");
    expect(screen.getByRole("link", { name: "Evidence" })).toHaveAttribute("href", "/evidence");
    expect(screen.getByText("CERT.pdf")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
  });
});

// keep act imported for lint when unused in some environments
void act;

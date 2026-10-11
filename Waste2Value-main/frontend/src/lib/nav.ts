import type { ComponentType } from "react";
import { Award, FileSearch, Layers, LayoutDashboard, PlusCircle, Settings } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Path prefix that marks this item active. */
  prefix: string;
  /** Exact-match only (used for items that share a prefix with a sibling). */
  exact?: boolean;
}

export interface NavGroup {
  name: string;
  items: NavItem[];
}

// Only routes that exist and work are listed. No "Investigations" route exists, so none is shown.
export const NAV_GROUPS: NavGroup[] = [
  {
    name: "WORKSPACE",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, prefix: "/dashboard" },
      { href: "/batches", label: "Batches", icon: Layers, prefix: "/batches" },
      { href: "/batches/new", label: "New Batch", icon: PlusCircle, prefix: "/batches/new", exact: true },
    ],
  },
  {
    name: "RECORDS",
    items: [
      { href: "/evidence", label: "Evidence", icon: FileSearch, prefix: "/evidence" },
      { href: "/passports", label: "Circularity Passports", icon: Award, prefix: "/passports" },
    ],
  },
  {
    name: "ADMINISTRATION",
    items: [{ href: "/settings", label: "Settings", icon: Settings, prefix: "/settings" }],
  },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/batches") return pathname === "/batches" || (pathname.startsWith("/batches/") && pathname !== "/batches/new");
  return pathname === item.href || pathname.startsWith(`${item.prefix}/`);
}

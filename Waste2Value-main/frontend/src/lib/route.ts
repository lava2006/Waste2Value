"use client";

import { usePathname } from "next/navigation";

/**
 * Reads the record id for a detail route (e.g. /batches/<id>) from the browser URL.
 *
 * The static export (S3 + CloudFront) pre-renders a single placeholder page per detail route
 * and CloudFront rewrites /batches/<anything> to it, so `useParams()` would return the
 * placeholder "_". The pathname always carries the real id, in dev, tests and production alike.
 */
export function useRouteId(prefix: "batches" | "evidence" | "passports" | "verify"): string {
  const pathname = usePathname() ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const idx = segments.indexOf(prefix);
  const raw = idx >= 0 ? segments[idx + 1] ?? "" : "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

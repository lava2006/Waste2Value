import { Suspense } from "react";
import Client from "./client";

// Static export: one placeholder page per detail route; CloudFront rewrites real ids to it and
// the client reads the id from the URL (see lib/route.ts).
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-700">Loading evidence…</p>}>
      <Client />
    </Suspense>
  );
}

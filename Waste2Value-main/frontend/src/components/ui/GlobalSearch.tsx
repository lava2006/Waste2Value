"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import type { Batch } from "@/types";
import { errorMessage, fetchBatches } from "@/lib/api-client";
import { searchEntities } from "@/lib/domain";
import { useExecutionMode } from "@/lib/hooks";

/** True when a keystroke originates from somewhere the user is typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const KIND_LABEL = { batch: "Batch", passport: "Passport", evidence: "Evidence" } as const;

export function GlobalSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const mode = useExecutionMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<Batch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);

  // Drop the index when the dataset (mode) changes.
  useEffect(() => {
    setIndex(null);
    setError(null);
  }, [mode]);

  // "/" focuses search, unless the user is already typing or a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ensureIndex = () => {
    if (index || loading) return;
    const id = ++loadId.current;
    setLoading(true);
    setError(null);
    fetchBatches()
      .then((b) => {
        if (id === loadId.current) setIndex(b);
      })
      .catch((err: unknown) => {
        if (id === loadId.current) setError(errorMessage(err));
      })
      .finally(() => {
        if (id === loadId.current) setLoading(false);
      });
  };

  const results = useMemo(() => (index ? searchEntities(index, query) : []), [index, query]);
  const showPanel = open && query.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (results[0]) router.push(results[0].href);
    else router.push(`/batches?search=${encodeURIComponent(q)}`);
    setOpen(false);
  };

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search batches, recyclers, passports and evidence
      </label>
      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
      <input
        id={`${listId}-input`}
        ref={inputRef}
        type="search"
        autoComplete="off"
        placeholder="Search batches, recyclers, passports"
        value={query}
        onFocus={() => {
          setOpen(true);
          ensureIndex();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          ensureIndex();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-darkbg-card border border-slate-300 dark:border-darkbg-border text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <kbd
        aria-hidden="true"
        className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-darkbg-hover rounded border border-slate-300 dark:border-darkbg-border text-slate-500 pointer-events-none"
      >
        /
      </kbd>

      <div id={listId} aria-live="polite" className={showPanel ? "absolute left-0 right-0 top-full mt-1.5 z-50" : "sr-only"}>
        {showPanel && (
          <div className="rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card shadow-xl overflow-hidden text-xs">
            {loading && (
              <p className="p-3 flex items-center gap-2 text-slate-600 dark:text-text-dark-secondary">
                <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" /> Searching…
              </p>
            )}
            {error && (
              <p role="alert" className="p-3 text-rose-800 dark:text-rose-200">
                Search unavailable: {error}
              </p>
            )}
            {!loading && !error && index && results.length === 0 && (
              <p className="p-3 text-slate-600 dark:text-text-dark-secondary">No batches, passports or evidence match “{query.trim()}”.</p>
            )}
            {results.length > 0 && (
              <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-darkbg-border">
                {results.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link
                      href={r.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-darkbg-hover focus:bg-slate-50 dark:focus:bg-darkbg-hover"
                    >
                      <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-darkbg-hover text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono font-bold text-slate-900 dark:text-white truncate">{r.title}</span>
                        <span className="block text-slate-600 dark:text-text-dark-secondary truncate">{r.subtitle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

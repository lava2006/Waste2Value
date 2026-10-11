"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Batch, ExecutionMode } from "@/types";
import { MODE_EVENT, errorMessage, fetchBatches, getExecutionMode } from "./api-client";

function subscribeMode(cb: () => void): () => void {
  window.addEventListener(MODE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MODE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Current execution mode; SSR renders "demo" and hydrates without mismatch. */
export function useExecutionMode(): ExecutionMode {
  return useSyncExternalStore(subscribeMode, getExecutionMode, () => "demo" as ExecutionMode);
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** Machine-readable HTTP status when the failure came from the API. */
  status: number | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `loader` on mount, whenever `deps` or the execution mode change, and on reload().
 * Stale responses (a slower earlier request finishing after a newer one) are ignored.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const mode = useExecutionMode();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setStatus(null);
    loaderRef
      .current()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setData(null);
        setError(errorMessage(err));
        setStatus(typeof (err as { status?: unknown }).status === "number" ? (err as { status: number }).status : null);
        setLoading(false);
      });
    return () => {
      // Invalidate in-flight work when deps change or the component unmounts.
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, status, loading, reload };
}

export function useBatches(): AsyncState<Batch[]> {
  return useAsync(fetchBatches, []);
}

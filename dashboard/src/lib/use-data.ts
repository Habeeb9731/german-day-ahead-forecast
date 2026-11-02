"use client";

import { useEffect, useState } from "react";

export type DataState<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/** Loads an exported JSON file. A 404 means the pipeline has not exported it yet, not a failure. */
export function useData<T>(file: string): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/data/${file}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404) return setState({ status: "empty" });
        if (!response.ok) throw new Error(`The server returned ${response.status}.`);
        setState({ status: "ready", data: (await response.json()) as T });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", message: error.message });
        }
      });
    return () => controller.abort();
  }, [file]);
  return state;
}

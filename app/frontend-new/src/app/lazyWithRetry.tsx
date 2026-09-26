import { lazy, type ComponentType } from "react";

/**
 * Resilient lazy loader (moved from the pre-router App.tsx, T033):
 * auto-reloads the page if a chunk fails to load (e.g. after a new
 * deployment when old chunk hashes no longer exist). Reloads at most once
 * per session to avoid a refresh loop.
 */
export function lazyWithRetry<T extends { default: ComponentType<unknown> }>(importFn: () => Promise<T>) {
  return lazy(() =>
    importFn().catch((error) => {
      const hasReloaded = sessionStorage.getItem("chunk_reload");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload", "true");
        window.location.reload();
      }
      throw error;
    }),
  );
}

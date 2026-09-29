import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/**
 * useUrlState (T032). See contracts/design-system.md §3:
 * "useUrlState<T>(key, default, {parse, serialize}) reads and writes path or
 * query without remounting layouts."
 *
 * Implemented over the query string (`useSearchParams`) with `replace: true`
 * navigation, so the URL updates without pushing a history entry and without
 * remounting the route's layout — only components that read the changed
 * search param re-render. This is what the "move tabs into the URL" recipe
 * step (plan.md) uses in place of a page's local `useState` tab value.
 */
export interface UrlStateCodec<T> {
  parse: (raw: string) => T;
  /** Return null/undefined to remove the param from the URL (e.g. default value). */
  serialize: (value: T) => string | null | undefined;
}

const stringCodec: UrlStateCodec<string> = {
  parse: (raw) => raw,
  serialize: (value) => (value === "" ? null : value),
};

/**
 * react-router's functional `setSearchParams(prev => …)` is not queued: `prev`
 * is the params seen at render time, so two setters called in one handler
 * would each start from the same base and the second would overwrite the
 * first. Updates made in the same tick therefore compose through this
 * pending value (cleared in a microtask, i.e. once the handler has returned
 * and the router has re-rendered from the URL). The pending value is keyed
 * by pathname: a setter running on a different path (a `navigate()` to
 * another route in the same tick) starts from its own params instead of
 * inheriting keys from the previous route.
 */
let pending: { path: string; params: URLSearchParams } | null = null;

export function useUrlState(
  key: string,
  defaultValue: string,
  codec?: UrlStateCodec<string>,
): [string, (next: string) => void];
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  codec: UrlStateCodec<T>,
): [T, (next: T) => void];
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  codec: UrlStateCodec<T> = stringCodec as unknown as UrlStateCodec<T>,
): [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const raw = searchParams.get(key);

  const value = useMemo(() => {
    if (raw === null) return defaultValue;
    try {
      return codec.parse(raw);
    } catch {
      return defaultValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, key]);

  const setValue = useCallback(
    (next: T) => {
      setSearchParams(
        (prev) => {
          const base = pending && pending.path === pathname ? pending.params : prev;
          const params = new URLSearchParams(base);
          const serialized = codec.serialize(next);
          if (serialized === null || serialized === undefined) {
            params.delete(key);
          } else {
            params.set(key, serialized);
          }
          if (pending === null) queueMicrotask(() => (pending = null));
          pending = { path: pathname, params };
          return params;
        },
        { replace: true },
      );
    },
    [key, pathname, setSearchParams, codec],
  );

  return [value, setValue];
}

export default useUrlState;

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

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
          const params = new URLSearchParams(prev);
          const serialized = codec.serialize(next);
          if (serialized === null || serialized === undefined) {
            params.delete(key);
          } else {
            params.set(key, serialized);
          }
          return params;
        },
        { replace: true },
      );
    },
    [key, setSearchParams, codec],
  );

  return [value, setValue];
}

export default useUrlState;

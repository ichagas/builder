/**
 * P4 (NV-06): helpers that make the Artifacts page read-only on a released
 * version. With `readOnly` false both return their argument unchanged, so the
 * legacy behaviour (and `v/current`) is untouched.
 */

/** Wraps a write so it does nothing while `readOnly`. */
export function readOnlyWrite<A extends unknown[], R>(readOnly: boolean, fn: (...args: A) => R): (...args: A) => R {
  if (!readOnly) return fn;
  return (() => Promise.resolve(undefined)) as unknown as (...args: A) => R;
}

/** Wraps a state setter so it cannot be *opened* (set to a truthy value) while `readOnly`; closing still works. */
export function gateOpener<T>(readOnly: boolean, set: (value: T) => void): (value: T) => void {
  if (!readOnly) return set;
  return (value: T) => {
    if (!value) set(value);
  };
}

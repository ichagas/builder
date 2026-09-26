import "@testing-library/jest-dom/vitest";
// Initializes i18next with the app's English resources (T038) so
// components using useTranslation() render real copy in tests, not raw
// translation keys.
import "@/i18n";

// jsdom 28 does not expose a usable Web Storage implementation in this Vitest
// environment (`localStorage.clear` is missing), so provide a minimal,
// spec-compatible in-memory Storage mock for both localStorage and
// sessionStorage. Test-only; never bundled into production.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

for (const prop of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(window, prop, {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });
}

// jsdom does not implement window.matchMedia — provide a minimal mock
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom does not implement ResizeObserver — cmdk (the CommandPalette's,
// T036, underlying library) observes element size. A no-op stub is enough
// for tests, which don't assert on layout.
if (typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement Element.scrollIntoView (used by cmdk and by
// TimelineStrip, T026, to keep the selection in view).
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

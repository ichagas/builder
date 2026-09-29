import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PrimaryActionProvider } from "./PrimaryActionContext";
import { PrimaryActionSlot } from "./PrimaryActionSlot";

/**
 * AppShell (T024). Layout route element. See contracts/design-system.md §2:
 * "Renders GlobalBar, Rail, optional TimelineStrip, <Outlet/>, StatusCenter,
 * UndoBar, PrimaryActionSlot (mobile) and MobileTabBar. Mounted once per
 * layout."
 *
 * AppShell itself is purely structural: it takes its chrome as slots (so
 * `ProjectLayout`, `AssuranceLayout`, `LibraryLayout` and `RootLayout` can
 * each pass their own GlobalBar/Rail/MobileTabBar configuration) and wraps
 * the routed content in a `PrimaryActionProvider` so a page's `PageHeader`
 * can mirror its primary action into the mobile `PrimaryActionSlot` without
 * either one needing to know about the other directly.
 *
 * Being "mounted once per layout" is what the remount test in T037 checks:
 * navigating between tools inside a project must not remount this component
 * (only `<Outlet/>`'s content changes), so `useUiPrefs`/`useLongTask` state
 * that lives above the outlet survives tool switches.
 *
 * The `timeline` slot (T024/T026, landmark fix T024 WP-F3b) is wrapped in
 * `<nav aria-label="Versions">` when present: `TimelineStrip` (role=
 * "tablist") otherwise sits directly between `rail` and `<main>` with no
 * enclosing landmark, which axe flags as `region` (moderate) on every
 * project page (the rail and `<main>` are already landmarks; the timeline
 * strip wasn't).
 */
export interface AppShellProps {
  globalBar: React.ReactNode;
  rail?: React.ReactNode;
  timeline?: React.ReactNode;
  mobileTabBar?: React.ReactNode;
  statusCenter?: React.ReactNode;
  undoBar?: React.ReactNode;
  className?: string;
  /** Overrides `<Outlet/>` — used in tests and Storybook-style previews. */
  children?: React.ReactNode;
}

export function AppShell({
  globalBar,
  rail,
  timeline,
  mobileTabBar,
  statusCenter,
  undoBar,
  className,
  children,
}: AppShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  // T033: move keyboard/screen-reader focus to the main content landmark on
  // every route change, but not on the initial page load (the browser
  // already focuses <body> then, and stealing focus on first paint is more
  // disorienting than helpful). AppShell is mounted once per layout and its
  // Outlet content changes underneath it (see the remount test above), so
  // this pathname-change effect is the one place that sees every navigation
  // without re-running on first mount.
  const initialPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (pathname === initialPathnameRef.current) return;
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <PrimaryActionProvider>
      <div
        className={cn(
          "flex min-h-dvh flex-col bg-bg text-ink",
          // Total bottom inset covered by the fixed mobile chrome (contracts/design-system.md §2.1).
          mobileTabBar && "[--shell-bottom-inset:calc(var(--tabbar-h)+env(safe-area-inset-bottom))]",
          "max-md:has-[#mobile-primary-action]:[--shell-bottom-inset:calc(var(--tabbar-h)+var(--action-bar-h)+env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <a
          href="#page"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-xs focus:bg-surface focus:px-3 focus:py-2 focus:text-ink focus:shadow"
        >
          {t("shell.skipToContent")}
        </a>
        {globalBar}
        <div className="flex min-h-0 flex-1">
          {rail}
          <div className="flex min-w-0 flex-1 flex-col">
            {timeline ? <nav aria-label={t("shell.nav.versions")}>{timeline}</nav> : null}
            <main ref={mainRef} id="page" tabIndex={-1} className={cn(
                // `max-md:isolate` contains page z-indices below the fixed bars (§2.1).
                "min-h-0 flex-1 overflow-y-auto focus:outline-none max-md:isolate",
                // Fixed MobileTabBar / PrimaryActionSlot overlay the bottom of this scroller.
                "max-md:pb-[var(--shell-bottom-inset,0px)]",
              )}>
              {children ?? <Outlet />}
            </main>
          </div>
        </div>
        <PrimaryActionSlot />
        {mobileTabBar}
        {statusCenter}
        {undoBar}
      </div>
    </PrimaryActionProvider>
  );
}

export default AppShell;

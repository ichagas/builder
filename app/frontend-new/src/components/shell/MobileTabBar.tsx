import * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * MobileTabBar (T027). See contracts/design-system.md §2:
 * "4-5 items. Project: Versions + 4 phases. Assurance: Portfolio, Onboard,
 * Packs, Policy." Hidden at >=768px (`Rail` takes over there — see the
 * layout contract in the constitution and `contracts/design-system.md` §2
 * "Rail ... Hidden <=768px").
 */
export interface MobileTabBarItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface MobileTabBarProps {
  items: MobileTabBarItem[];
  ariaLabel?: string;
}

export function MobileTabBar({ items, ariaLabel }: MobileTabBarProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={ariaLabel ?? t("shell.nav.project")}
      className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] items-stretch border-t border-rail-line bg-rail-bg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.id}
          to={item.href}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-rail-muted",
              isActive && "text-rail-ink",
            )
          }
        >
          {item.icon}
          <span className="truncate px-1">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default MobileTabBar;

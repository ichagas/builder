import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * CommandPalette (T036). "projects, tools, library" — the ⌘K search that
 * `GlobalBar` triggers. Global keyboard shortcut (⌘K / Ctrl+K) is bound
 * once here rather than per-layout, so it works regardless of which layout
 * is mounted.
 */
export interface CommandPaletteItem {
  id: string;
  label: string;
  group: "projects" | "tools" | "library";
  href: string;
  hint?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
}

const GROUP_ORDER: CommandPaletteItem["group"][] = ["projects", "tools", "library"];

export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const select = (item: CommandPaletteItem) => {
    onOpenChange(false);
    navigate(item.href);
  };

  const byGroup = React.useMemo(() => {
    const map = new Map<CommandPaletteItem["group"], CommandPaletteItem[]>();
    items.forEach((item) => map.set(item.group, [...(map.get(item.group) ?? []), item]));
    return map;
  }, [items]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">{t("a11y.commandPalette.title")}</DialogTitle>
      <DialogDescription className="sr-only">{t("a11y.commandPalette.description")}</DialogDescription>
      <CommandInput placeholder={t("commandPalette.placeholder")} aria-label={t("a11y.commandPalette.title")} />
      <CommandList>
        <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>
        {GROUP_ORDER.map((group) => {
          const groupItems = byGroup.get(group);
          if (!groupItems || groupItems.length === 0) return null;
          return (
            <CommandGroup key={group} heading={t(`commandPalette.groups.${group}`)}>
              {groupItems.map((item) => (
                <CommandItem key={item.id} value={`${item.label} ${item.hint ?? ""}`} onSelect={() => select(item)}>
                  <span className="flex-1">{item.label}</span>
                  {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;

import * as React from "react";

/**
 * Controls that only navigate or reveal, never change data: Radix tab
 * triggers, disclosure summaries / anything with `aria-expanded`, and
 * anything a tool marks with `data-readonly-allow`. A Radix Select trigger
 * also carries `aria-expanded` but it is a form control (role "combobox"),
 * so it is NOT navigation and gets disabled (P4).
 */
const NAVIGATION = '[role="tab"], [aria-expanded]:not([role="combobox"]), summary, [data-readonly-allow]';
const CONTROLS = "button, input, select, textarea";

/**
 * ReadOnlyGuard: the `<fieldset disabled>` behaviour for a released version,
 * minus the collateral damage. A disabled fieldset also disables tab
 * triggers, so the user could not even browse a released tool. This wrapper
 * disables every native form control inside it except navigation controls
 * (`NAVIGATION`), and keeps doing so as the tool renders more DOM. The
 * wrapper element is always rendered (with `display: contents`), so `active`
 * flipping never remounts the children.
 */
export function ReadOnlyGuard({ active, children, ...rest }: { active: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = ref.current;
    if (!root || !active) return;
    const touched = new Set<HTMLElement>();
    const apply = () => {
      root.querySelectorAll<HTMLElement & { disabled: boolean }>(CONTROLS).forEach((el) => {
        if (el.disabled || el.matches(NAVIGATION)) return;
        el.disabled = true;
        touched.add(el);
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      touched.forEach((el) => {
        (el as HTMLElement & { disabled: boolean }).disabled = false;
      });
    };
  }, [active]);

  return (
    <div ref={ref} className="contents" data-readonly={active ? "true" : undefined} {...rest}>
      {children}
    </div>
  );
}

export default ReadOnlyGuard;

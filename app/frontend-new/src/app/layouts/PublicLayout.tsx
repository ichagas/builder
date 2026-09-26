import { Outlet } from "react-router-dom";

/**
 * PublicLayout (T033). See contracts/routes.md §1, "Layout: Public": the
 * marketing/auth pages (`/welcome`, `/auth*`, `/terms`, `/privacy`,
 * `/license`) keep their own bespoke look, not the app shell — they render
 * standalone, same as before the router split.
 */
export function PublicLayout() {
  return <Outlet />;
}

export default PublicLayout;

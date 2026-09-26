import { Outlet } from "react-router-dom";

/**
 * AssuranceLayout (T033 scaffold). Per plan.md's folder listing
 * (`app/layouts/{RootLayout,ProjectLayout,AssuranceLayout,LibraryLayout,PublicLayout}`)
 * and contracts/routes.md §1 ("Layout: Assurance" for
 * `/assurance/t/:teamId`, `/apps/:appId`, `/onboard/:step`, `/all`,
 * `/packs`, `/policy`). Not wired into the router yet — those routes and
 * their TeamSwitcher/portfolio content are WP-A1…A6 (US5/US6, built new,
 * depends on BE3). This is only the placeholder so a later work package
 * has a documented slot instead of inventing its own layout shape.
 */
export function AssuranceLayout() {
  return <Outlet />;
}

export default AssuranceLayout;

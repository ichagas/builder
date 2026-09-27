import * as React from "react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * NotFound (T033). See contracts/routes.md §1: "`*` | NotFound with search
 * and links to Projects and Assurance | Root | WP-F3." Renders inside
 * RootLayout's AppShell, so it already has the GlobalBar's ⌘K search — this
 * page adds an inline search field for people who land here without a
 * keyboard shortcut in mind, plus a direct link to Projects.
 *
 * The Assurance link from that routes.md row is dropped for now: none of
 * `/assurance/*` (WP-A1…A6, US5/US6) is wired into the router yet
 * (AssuranceLayout is only a scaffold — see app/layouts/AssuranceLayout.tsx),
 * so linking to it here would be a second dead link on the 404 page. Add it
 * back once an assurance route actually exists to land on.
 */
export function NotFound() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");

  useEffect(() => {
    console.warn("404: no route matches", location.pathname);
  }, [location.pathname]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      navigate(`/projects?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-ink">{t("shell.notFound.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("shell.notFound.body")}</p>
      <form onSubmit={onSubmit} className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xs border border-line bg-surface px-3">
        <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("shell.notFound.searchPlaceholder")}
          className="flex-1 bg-transparent text-sm text-ink outline-none"
        />
      </form>
      <div className="flex gap-4 text-sm font-semibold">
        <a href="/projects" className="text-primary underline-offset-2 hover:underline">
          {t("shell.notFound.projectsLink")}
        </a>
      </div>
    </div>
  );
}

export default NotFound;

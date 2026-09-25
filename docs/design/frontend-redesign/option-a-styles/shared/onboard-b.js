/*
 * Onboarding · Option B · Assurance console (chosen)
 *
 * Structure: Teams → Applications → Repositories.
 * A user belongs to one or more teams and sees their team's portfolio: every
 * application, and inside it every repository, against the Standards pack and
 * the four Assurance Mesh agents. Built to stay readable at 15+ repositories:
 *   portfolio   = apps as expandable rows with totals, filters, bulk actions
 *   app page    = Standards adoption bar, repo grid grouped by part or stack
 *   timeline    = merges to main grouped by day (worst verdict shown)
 *   onboarding  = Team & app → Connect repos → Sandbox → Review → Open PRs
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, btn, banner, more, header, tabs, runButton, notify, afterUndo, store } = PK;
  const { MESH, PACKS, PROFILES, generated, meshDots, legend, latestPack, verdictWord } = OB;
  PK.shell();
  $(".demo-switch").hidden = true;
  document.body.classList.add("is-connected");

  const LATEST = latestPack();

  /* ------------------------------------------------------------------ data */
  const STACK = { dotnet: ".NET 8 · ASP.NET Core", node: "Node 20 · Angular 17", java: "Java 17 · Spring Batch", python: "Python 3.12 · FastAPI" };
  const BUILD = { dotnet: "dotnet build && dotnet test", node: "npm ci && npm test", java: "mvn verify", python: "pytest" };
  function repo(name, profile, group, o = {}) {
    return Object.assign({ name, profile, group, stack: STACK[profile], build: BUILD[profile], sync: LATEST, pr: null, mesh: { green: "pass", yellow: "pass", red: group === "Batch & integration" ? "skip" : "pass", blue: "pass" }, asvs: 276, baseline: 12, newFindings: 0 }, o);
  }
  function inspectionsHub() {
    const repos = [
      repo("inspections-api", "dotnet", "APIs", { asvs: 281, baseline: 18 }),
      repo("scheduling-api", "dotnet", "APIs", { sync: "2026.2", asvs: 270, baseline: 22 }),
      repo("findings-api", "dotnet", "APIs", { asvs: 279, baseline: 9 }),
      repo("notifications-api", "dotnet", "APIs", { asvs: 283, baseline: 4 }),
      repo("documents-api", "dotnet", "APIs", { asvs: 274, baseline: 15 }),
      repo("identity-adapter", "dotnet", "APIs", { mesh: { green: "pass", yellow: "pass", red: "pass", blue: "warn" }, asvs: 262, baseline: 27 }),
      repo("inspector-portal", "node", "Front ends", { asvs: 280, baseline: 31 }),
      repo("public-lookup", "node", "Front ends", { stack: "Node 20 · React", mesh: { green: "pass", yellow: "fail", red: "pass", blue: "pass" }, newFindings: 2, asvs: 277, baseline: 19 }),
      repo("admin-console", "node", "Front ends", { sync: "2026.2", pr: { n: 612, state: "open" }, asvs: 268, baseline: 24 }),
      repo("mobile-inspector", "node", "Front ends", { stack: "Node 20 · React Native", asvs: 272, baseline: 16 }),
      repo("nightly-sync", "java", "Batch & integration", { asvs: 284, baseline: 3 }),
      repo("gis-importer", "java", "Batch & integration", { asvs: 280, baseline: 6 }),
      repo("reports-engine", "java", "Batch & integration", { stack: "Java 17 · Spring Boot", mesh: { green: "pass", yellow: "pass", red: "pass", blue: "pass" }, asvs: 278, baseline: 8 }),
      repo("legacy-bridge", "java", "Batch & integration", { sync: "2026.1", mesh: { green: "warn", yellow: "pass", red: "skip", blue: "warn" }, asvs: 255, baseline: 41 }),
      repo("archive-job", "java", "Batch & integration", { sync: "2026.2", asvs: 282, baseline: 5 }),
    ];
    const V = (r, v, note) => ({ repo: r, verdict: v, note });
    const days = [
      ["Today", [V("public-lookup", "fail", "Yellow: 2 new findings in public text"), V("inspections-api", "pass"), V("findings-api", "pass"), V("inspector-portal", "pass")]],
      ["Yesterday", [V("scheduling-api", "pass"), V("identity-adapter", "warn", "Blue: 1 ASVS requirement weakened"), V("gis-importer", "pass")]],
      ["Mon", [V("documents-api", "pass"), V("mobile-inspector", "pass"), V("legacy-bridge", "warn", "Green: outdated dependency")]],
      ["Fri", [V("notifications-api", "pass"), V("reports-engine", "pass")]],
      ["Thu", [V("inspector-portal", "pass"), V("nightly-sync", "pass"), V("admin-console", "pass")]],
    ];
    let pr = 900;
    const merges = days.flatMap(([day, list]) => list.map((m) => ({ ...m, day, pr: pr-- })));
    return { id: "hub", name: "Inspections Hub", owner: "Permits & Inspections", repos, merges,
      exceptions: [{ repo: "nightly-sync", rule: "Red recon", why: "Batch job, no public endpoint", until: "Mar 2027" }, { repo: "gis-importer", rule: "Red recon", why: "Batch job, no public endpoint", until: "Mar 2027" }, { repo: "archive-job", rule: "Red recon", why: "Batch job, no public endpoint", until: "Mar 2027" }, { repo: "legacy-bridge", rule: "Red recon", why: "Internal network only", until: "Dec 2026" }] };
  }
  function fromOB(a, group) {
    const days = ["Today", "Yesterday", "Mon"];
    return { ...a, repos: a.repos.map((r) => ({ ...r, group: group(r) })), merges: a.merges.map((m, k) => ({ ...m, day: days[k % days.length] })) };
  }
  function teams() {
    const ob = OB.apps();
    const part = (r) => ({ dotnet: "APIs", node: "Front ends", java: "Batch & integration", python: "APIs" }[r.profile]);
    return [
      { id: "permits", name: "Permits & Inspections", members: 14, mine: true, apps: [inspectionsHub(), fromOB(ob[0], part), fromOB(ob[1], part)] },
      { id: "grants", name: "Grants & Funding", members: 6, mine: true, apps: [fromOB(ob[2], part)] },
      { id: "frontdoor", name: "Digital Front Door", members: 9, mine: false, apps: [{ id: "frontdoor", name: "MyAlberta Front Door", owner: "Digital Front Door", exceptions: [], merges: [{ pr: 77, repo: "frontdoor-web", day: "Today", verdict: "pass" }],
        repos: [repo("frontdoor-web", "node", "Front ends", { stack: "Node 20 · Next.js" }), repo("frontdoor-bff", "node", "APIs", { stack: "Node 20 · Express" }), repo("profile-service", "java", "APIs", { stack: "Java 17 · Spring Boot", sync: "2026.2" }), repo("search-indexer", "python", "Batch & integration", { sync: "2026.2" })] }] },
    ];
  }
  const S = { teams: teams(), wiz: null };
  function freshWizard(teamId) {
    const cand = [
      ["inspections-scheduler", "dotnet", "APIs", true], ["inspections-web", "node", "Front ends", true], ["inspections-mobile", "node", "Front ends", true],
      ["inspections-etl", "java", "Batch & integration", true], ["inspections-reports", "python", "Batch & integration", true], ["inspections-prototype-2019", "node", "Front ends", false],
    ].map(([n, p, g, on]) => ({ ...repo(n, p, g), picked: on, review: [`${{ dotnet: "Controllers, services, EF Core", node: "Components, services, API client", java: "Readers, processors, writers", python: "Routers, jobs, data access" }[p]}`, `${3 + n.length % 5} findings to record as baseline`] }));
    return { team: teamId, name: "Food Safety Inspections", step: "team", running: false, ran: false, log: [], prs: null, repos: cand };
  }

  /* --------------------------------------------------------------- routing */
  function P() { const h = PK.hashParams(); return { tm: h.tm || store("team") || "permits", v: h.v || "portfolio", a: h.a || "", s: h.s || "", f: h.f || "all", g: h.g || "part", t: h.t || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  const team = (p) => S.teams.find((t) => t.id === p.tm) || S.teams[0];
  const allApps = () => S.teams.flatMap((t) => t.apps);
  const isBehind = (r) => r.sync !== LATEST;
  const needsAttention = (r) => isBehind(r) || r.newFindings > 0 || Object.values(r.mesh || {}).some((v) => v === "fail" || v === "warn");
  const FILTERS = { all: () => true, attention: needsAttention, behind: isBehind, new: (r) => r.newFindings > 0 };
  function totals(repos) {
    const t = { repos: repos.length, onLatest: repos.filter((r) => !isBehind(r)).length, behind: repos.filter(isBehind).length, fresh: repos.filter((r) => r.newFindings).length, newFindings: repos.reduce((s, r) => s + r.newFindings, 0), warn: repos.filter((r) => Object.values(r.mesh || {}).includes("warn")).length, prOpen: repos.filter((r) => r.pr && r.pr.state === "open").length };
    t.worst = t.fresh ? "fail" : t.warn || t.behind ? "warn" : "pass"; return t;
  }
  const dotFor = (v) => `<span class="md md-${v === "fail" ? "red" : v === "warn" ? "yellow" : "green"}" style="display:inline-block;vertical-align:-1px;width:12px;height:12px;flex:none" title="${verdictWord[v]}"></span>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ------------------------------------------------------------------ chrome */
  function chrome(p) {
    const tm = p.tm === "all" ? null : team(p);
    $(".switcher").setAttribute("aria-haspopup", "menu"); $(".switcher").id = "teamSwitch";
    $(".sw-name").innerHTML = tm ? `${esc(tm.name)}<span class="kind-tag">Team</span>` : `All teams<span class="kind-tag">Assurance</span>`;
    $("#modeBadge").innerHTML = `<span class="dot"></span><span class="mb-long">Standards </span><b>${LATEST}</b>`;
    $("#pillA").innerHTML = S.wiz && S.wiz.running ? `<span class="dot run"></span>Sandbox running` : `<span class="dot ok"></span>Mesh reporting`;

    const showStrip = p.v === "portfolio" || p.v === "app";
    document.body.classList.toggle("has-ctx", showStrip && !!tm); document.body.classList.toggle("has-timeline", showStrip && !!tm);
    $("#strip").hidden = !(showStrip && tm);
    if (!showStrip || !tm) return;
    const app = p.v === "app" ? tm.apps.find((a) => a.id === p.a) : null;
    const merges = (app ? [app] : tm.apps).flatMap((a) => a.merges.map((m) => ({ ...m, app: a.id })));
    const order = ["Thu", "Fri", "Mon", "Yesterday", "Today"];
    const days = order.map((d) => [d, merges.filter((m) => m.day === d)]).filter(([, l]) => l.length);
    $("#strip").className = "ctxbar strip timeline";
    $("#strip").innerHTML = `<div class="tl" role="navigation" aria-label="Merges to main by day">
      <span class="tl-node hist"><span class="tl-dot"></span><span class="tl-v">Merges</span><span class="tl-s">${app ? esc(app.name) : "whole team"}</span></span>
      ${days.map(([d, l]) => { const w = l.some((m) => m.verdict === "fail") ? "fail" : l.some((m) => m.verdict === "warn") ? "warn" : "pass"; const bad = l.filter((m) => m.verdict !== "pass").length; return `<button class="tl-node verdict-${w}" data-day="${d}" ${p.s === "day:" + d ? 'aria-current="true"' : ""}><span class="tl-dot"></span><span class="tl-v">${d}</span><span class="tl-s">${l.length} ${l.length === 1 ? "merge" : "merges"}${bad ? ` · ${bad} flagged` : ""}</span></button>`; }).join("")}
      <span class="tl-sep"></span><span class="tl-node planned"><span class="tl-dot"></span><span class="tl-v">Next merge</span><span class="tl-s">runs the mesh</span></span></div>`;
    const cur = $("#strip [aria-current='true']"); if (cur) $("#strip").scrollLeft = cur.offsetLeft - 40;
  }

  function rail(p) {
    const tm = p.tm === "all" ? null : team(p);
    const item = (v, icon, label, extra, a) => `<button class="rail-item" data-nav="${v}" ${a ? `data-app="${a}"` : ""} ${(p.v === v && (!a || p.a === a)) ? 'aria-current="page"' : ""}>${svg(icon)}<span class="ri-t">${label}</span>${extra || ""}</button>`;
    $("#rail").innerHTML = `
      <div class="rail-group">${item("portfolio", "grid", "Portfolio")}${tm ? item("onboard", "plus", "Onboard an app") : ""}</div>
      ${tm ? `<div class="rail-group"><div class="rail-label">Applications · ${tm.apps.length}</div>${tm.apps.map((a) => { const t = totals(a.repos); return item("app", "branch", esc(a.name), `<small style="margin-left:auto">${a.repos.length}</small>${dotFor(t.worst)}`, a.id); }).join("")}</div>` : ""}
      <div class="rail-group"><div class="rail-label">Organization</div>${item("packs", "tag", "Standards packs", `<small>${LATEST}</small>`)}${item("policy", "gear", "Mesh policy")}</div>`;
    $("#tabbar").style.gridTemplateColumns = "repeat(4, 1fr)";
    $("#tabbar").innerHTML = [["portfolio", "grid", "Portfolio"], ["onboard", "plus", "Onboard"], ["packs", "tag", "Packs"], ["policy", "gear", "Policy"]].map(([v, ic, l]) => `<button data-nav="${v}" ${p.v === v ? 'aria-current="page"' : ""}>${svg(ic, 22)}<span>${l}</span></button>`).join("");
  }

  function teamMenu(p) {
    const old = $("#teamMenu"); if (old) { old.remove(); return; }
    const mine = S.teams.filter((t) => t.mine), others = S.teams.filter((t) => !t.mine);
    const row = (t) => { const tt = totals(t.apps.flatMap((a) => a.repos)); return `<button role="menuitem" data-team="${t.id}" ${p.tm === t.id ? 'aria-current="true"' : ""}>${dotFor(tt.worst)}<span><b>${esc(t.name)}</b><br><span class="muted">${plural(t.apps.length, "app", "apps")} · ${plural(tt.repos, "repo", "repos")}</span></span></button>`; };
    document.body.insertAdjacentHTML("beforeend", `<div class="team-menu" id="teamMenu" role="menu">
      <div class="tm-l">Your teams</div>${mine.map(row).join("")}
      <div class="tm-l">Assurance</div><button role="menuitem" data-team="all" ${p.tm === "all" ? 'aria-current="true"' : ""}>${svg("grid", 16)}<span><b>All teams</b><br><span class="muted">For assurance leads</span></span></button>
      ${others.length ? `<div class="tm-l">Other teams</div>${others.map(row).join("")}` : ""}</div>`);
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    const p = P(); store("team", p.tm);
    $("#teamMenu") && $("#teamMenu").remove();
    chrome(p); rail(p);
    document.body.dataset.view = "work";
    let html, primary;
    if (p.tm === "all" && p.v !== "packs" && p.v !== "policy") [html, primary] = allTeamsView();
    else if (p.v === "app") [html, primary] = appView(p);
    else if (p.v === "onboard") [html, primary] = onboardView(p);
    else if (p.v === "packs") [html, primary] = packsView();
    else if (p.v === "policy") [html, primary] = policyView();
    else [html, primary] = portfolioView(p);
    $("#page").innerHTML = html; $("#mAction").innerHTML = btn(primary); document.body.classList.toggle("has-maction", !!primary);
    const lg = $(".log"); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  const filterChips = (p, repos) => `<div class="filters" role="tablist" aria-label="Filter repositories">${[["all", "All"], ["attention", "Needs attention"], ["behind", "Behind " + LATEST], ["new", "New findings"]].map(([k, l]) => `<button class="chip" role="tab" aria-selected="${p.f === k}" data-filter="${k}">${l}<span class="n">${repos.filter(FILTERS[k]).length}</span></button>`).join("")}</div>`;
  const repoRow = (r) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">${r.group} · Standards ${r.sync}${isBehind(r) ? " · behind" : ""}</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">baseline ${r.baseline} · new ${r.newFindings}</span>${meshDots(r.mesh)}${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n} · ${r.pr.state}</span>` : `<span class="pr-chip none">${isBehind(r) ? "Behind" : "In sync"}</span>`}</div>`;
  const dayCard = (p, apps) => {
    if (!p.s.startsWith("day:")) return "";
    const d = p.s.slice(4), list = apps.flatMap((a) => a.merges.filter((m) => m.day === d).map((m) => ({ ...m, app: a })));
    return `<section class="card"><div class="card-h"><h2>Merges to main · ${d}</h2><span class="meta">${list.length}</span><button class="icon-btn" data-clear aria-label="Close">${svg("x", 16)}</button></div><div class="rows">${list.map((m) => `<div class="lrow"><span class="pr-chip">#${m.pr}</span><span class="lr-t"><b>${m.repo}</b><span>${esc(m.app.name)}${m.note ? " · " + m.note : ""}</span></span><span class="delta ${m.verdict === "pass" ? "delta-new" : m.verdict === "fail" ? "delta-regression" : "delta-changed"}">${verdictWord[m.verdict]}</span><button class="btn" data-evidence="${m.app.id}:${m.pr}"><span class="lbl">Evidence</span></button></div>`).join("")}</div></section>`;
  };

  /* -------------------------------------------------------------- portfolio */
  function portfolioView(p) {
    const tm = team(p), repos = tm.apps.flatMap((a) => a.repos), T = totals(repos);
    const primary = { label: "Onboard an app", act: "nav", arg: "onboard" };
    const next = T.fresh ? { title: `${T.fresh} ${T.fresh > 1 ? "repositories have" : "repository has"} new findings after a merge`, body: `${T.behind} of ${T.repos} repositories are behind Standards ${LATEST}. ${T.prOpen} update ${T.prOpen === 1 ? "PR is" : "PRs are"} open.`, cta: "Show them", act: "filter", arg: "new", icon: "alert", tone: "warn" } : { title: `${T.onLatest} of ${T.repos} repositories are on Standards ${LATEST}`, body: "No new findings after the latest merges.", icon: "check", tone: "ok" };
    const f = FILTERS[p.f] || FILTERS.all;
    const rows = tm.apps.map((a) => {
      const t = totals(a.repos), shown = a.repos.filter(f), key = "exp." + a.id, stored = store(key);
      const open = p.f !== "all" ? shown.length > 0 : stored === null ? a.repos.length <= 3 : stored === "1";
      if (p.f !== "all" && !shown.length) return "";
      const waiting = a.repos.filter((r) => isBehind(r) && !(r.pr && r.pr.state === "open")).length;
      return `<tr class="app-row"><td colspan="2"><button class="expander" data-expand="${a.id}" aria-expanded="${open}">${svg(open ? "down" : "chev", 14)}</button> <button data-open-app="${a.id}">${esc(a.name)}</button> <span class="muted" style="font-weight:400">· ${a.repos.length} ${a.repos.length === 1 ? "repo" : "repos"}</span></td>
        <td>${t.onLatest}/${t.repos} on ${LATEST}</td><td>${t.fresh ? `<span class="delta delta-regression">${t.fresh} with new findings</span>` : t.warn ? `<span class="delta delta-changed">${t.warn} with warnings</span>` : `<span class="delta delta-new">All pass</span>`}</td><td>${t.newFindings || 0}</td>
        <td>${waiting ? `<button class="btn" data-act="sendUpdate" data-arg="${a.id}"><span class="lbl">Send update PRs (${waiting})</span><span class="progress"></span></button>` : `<span class="muted" style="font-weight:400">${t.prOpen ? t.prOpen + " PR open" : "Up to date"}</span>`}</td></tr>
        ${open ? shown.map((r) => `<tr><td><code>${r.name}</code></td><td><span class="stack p-${r.profile}">${r.stack}</span></td><td class="${isBehind(r) ? "behind" : ""}">${r.sync}${isBehind(r) ? " · behind" : ""}</td><td>${meshDots(r.mesh)}</td><td>${r.newFindings ? `<span class="delta delta-regression">${r.newFindings} new</span>` : `<span class="muted">0 · baseline ${r.baseline}</span>`}</td><td>${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n}</span>` : ""}</td></tr>`).join("") : ""}`;
    }).join("");
    const body = `${dayCard(p, tm.apps)}${filterChips(p, repos)}
      <section class="card"><div class="card-h"><h2>Applications and repositories</h2><span class="meta">${tm.apps.length} apps · ${T.repos} repos</span><button class="btn quiet" data-act="expandAll"><span class="lbl">Expand all</span></button></div><div class="tbl-scroll"><table class="matrix">
        <tr><th>APPLICATION / REPOSITORY</th><th>STACK</th><th>STANDARDS</th><th>MESH ON MAIN</th><th>NEW FINDINGS</th><th></th></tr>${rows || `<tr><td colspan="6" class="muted">No repositories match this filter.</td></tr>`}
      </table></div>${legend()}</section>`;
    return [`${header(`Team · ${esc(tm.name)} · ${tm.members} members`, "Portfolio", primary)}${banner(next)}${body}`, primary];
  }

  /* -------------------------------------------------------------- all teams */
  function allTeamsView() {
    const body = `<section class="card"><div class="card-h"><h2>Teams</h2><span class="meta">${S.teams.length}</span></div><div class="tbl-scroll"><table class="matrix"><tr><th>TEAM</th><th>APPS</th><th>REPOS</th><th>ON ${LATEST}</th><th>NEW FINDINGS</th><th>EXCEPTIONS</th></tr>
      ${S.teams.map((t) => { const T = totals(t.apps.flatMap((a) => a.repos)); return `<tr><td>${dotFor(T.worst)} <button class="linkish" data-team="${t.id}">${esc(t.name)}</button></td><td>${t.apps.length}</td><td>${T.repos}</td><td class="${T.behind ? "behind" : ""}">${T.onLatest}/${T.repos}</td><td>${T.newFindings ? `<span class="delta delta-regression">${T.newFindings}</span>` : "0"}</td><td>${t.apps.reduce((s, a) => s + a.exceptions.length, 0)}</td></tr>`; }).join("")}</table></div></section>`;
    return [`${header("Organization · Assurance Mesh", "All teams", null)}${banner({ title: "Assurance view across every team", body: "Select a team to see its applications and repositories. Policy and Standards packs are set here for everyone.", icon: "grid" })}${body}`, null];
  }

  /* -------------------------------------------------------------- app */
  function appView(p) {
    const tm = team(p), a = tm.apps.find((x) => x.id === p.a) || tm.apps[0], T = totals(a.repos);
    const waiting = a.repos.filter((r) => isBehind(r) && !(r.pr && r.pr.state === "open"));
    const primary = waiting.length ? { label: `Send update PRs (${waiting.length})`, act: "sendUpdate", arg: a.id } : { label: "Run mesh on main", act: "noop" };
    const m = p.s.includes(":") && !p.s.startsWith("day:") ? a.merges.find((x) => String(x.pr) === p.s.split(":")[1]) : null;
    const evidence = m ? `<section class="card"><div class="card-h"><h2>Evidence · merge #${m.pr} into ${m.repo}</h2><span class="meta">${m.day}</span><button class="btn" data-act="noop"><span class="lbl">Download report</span><span class="progress"></span></button><button class="icon-btn" data-clear aria-label="Close">${svg("x", 16)}</button></div><div class="rows">${MESH.map((ag) => { const v = m.verdict === "fail" && ag.id === "yellow" ? "fail" : m.verdict === "warn" && m.note && m.note.startsWith(ag.name) ? "warn" : "pass"; return `<div class="mesh-agent"><span class="md md-${ag.id} ${v}">${ag.name[0]}</span><span><b>${ag.name} · ${verdictWord[v]}</b><small>${v !== "pass" ? m.note : ag.checks}</small></span><span class="muted">${ag.kind}</span></div>`; }).join("")}</div></section>` : "";
    // Standards adoption bar
    const byPack = PACKS.map((k) => [k.v, a.repos.filter((r) => r.sync === k.v).length]).filter(([, n]) => n);
    const adoption = `<section class="card"><div class="card-h"><h2>Standards adoption</h2><span class="meta">${T.onLatest}/${T.repos} on ${LATEST}</span></div>
      <div class="adopt-bar" role="img" aria-label="${byPack.map(([v, n]) => `${n} on ${v}`).join(", ")}">${byPack.slice().reverse().map(([v, n]) => `<span class="ab ab-${v === LATEST ? "latest" : "old"}" style="flex:${n}" title="${n} on ${v}">${v} · ${n}</span>`).join("")}</div>
      <div class="kv-grid"><div><span>New findings</span><b>${T.newFindings}</b></div><div><span>Repos with warnings</span><b>${T.warn}</b></div><div><span>Update PRs open</span><b>${T.prOpen}</b></div><div><span>Exceptions</span><b>${a.exceptions.length}</b></div></div></section>`;
    // repo grid, grouped
    const groupBy = p.g === "stack" ? (r) => PROFILES[r.profile] : (r) => r.group;
    const f = FILTERS[p.f] || FILTERS.all, shown = a.repos.filter(f);
    const groups = [...new Set(shown.map(groupBy))];
    const grid = `<section class="card"><div class="card-h"><h2>Repositories</h2><span class="meta">${shown.length} of ${a.repos.length}</span>
        <div class="grp-toggle" role="group" aria-label="Group by"><button data-group="part" aria-pressed="${p.g !== "stack"}">By part</button><button data-group="stack" aria-pressed="${p.g === "stack"}">By stack</button></div></div>
      ${groups.map((g) => { const list = shown.filter((r) => groupBy(r) === g), gw = list.filter((r) => isBehind(r) && !(r.pr && r.pr.state === "open")); return `<div class="sub-h grp-h"><span>${g} · ${list.length}</span>${gw.length ? `<button class="btn quiet" data-act="sendUpdateGroup" data-arg="${a.id}|${g}"><span class="lbl">Send update PRs (${gw.length})</span><span class="progress"></span></button>` : ""}</div><div class="rows">${list.map(repoRow).join("")}</div>`; }).join("") || `<div class="empty small">No repositories match this filter.</div>`}
      ${legend()}</section>`;
    const next = T.fresh ? { title: `${T.fresh} ${T.fresh > 1 ? "repositories have" : "repository has"} new findings`, body: "Select a day on the timeline to see which merge caused them.", cta: "Show them", act: "filter", arg: "new", icon: "alert", tone: "warn" } : null;
    const exc = a.exceptions.length ? more("exc-" + a.id, `Exceptions · ${a.exceptions.length}`, `<div class="rows">${a.exceptions.map((e) => `<div class="lrow"><code>${e.repo}</code><span class="lr-t"><b>${e.rule}</b><span>${e.why}</span></span><span class="muted">until ${e.until}</span></div>`).join("")}</div>`) : "";
    return [`${header(`${esc(tm.name)} / Applications`, esc(a.name), primary)}${banner(next)}${evidence}${dayCard(p, [a])}${adoption}${filterChips(p, a.repos)}${grid}${exc ? `<section class="card">${exc}</section>` : ""}`, primary];
  }

  /* -------------------------------------------------------------- onboard wizard */
  const WSTEPS = [["team", "Team & app"], ["connect", "Connect repos"], ["sandbox", "Run in sandbox"], ["output", "Review output"], ["prs", "Open pull requests"]];
  function onboardView(p) {
    if (!S.wiz || S.wiz.team !== p.tm) S.wiz = freshWizard(p.tm);
    const W = S.wiz, tm = team(p), cur = WSTEPS.some((x) => x[0] === p.t) ? p.t : W.step, picked = W.repos.filter((r) => r.picked);
    const idx = (k) => WSTEPS.findIndex((x) => x[0] === k);
    const state = (k) => idx(k) < idx(W.step) ? "done" : k === W.step ? "active" : "todo";
    const PH = ["define", "design", "build", "ship", "ship"];
    const stepper = `<nav class="stepper wiz5" aria-label="Onboarding steps">${WSTEPS.map(([k, l], i) => `<button class="step ph-${PH[i]} st-${state(k)}" data-wstep="${k}" ${k === cur ? 'aria-current="step"' : ""} ${state(k) === "todo" ? "disabled" : ""}><span class="node"></span><span><b>${l}</b><small>${{ done: "Done", active: "Current", todo: "Next" }[state(k)]}</small></span></button>`).join("")}</nav>`;
    const cont = (to) => (W.step === cur ? { label: "Continue", act: "wiz", arg: to } : null);
    let primary = null, next = null, body = "";
    if (cur === "team") {
      primary = cont("connect");
      next = { title: "Applications belong to a team", body: "Everyone in the team sees the application in their portfolio. Assurance leads see it in All teams.", icon: "grid" };
      body = `<section class="card"><div class="pad form"><label class="f">Team<select id="wTeam">${S.teams.filter((t) => t.mine).map((t) => `<option value="${t.id}" ${t.id === W.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label><label class="f">Application name<input id="wName" value="${esc(W.name)}"></label></div></section>`;
    } else if (cur === "connect") {
      primary = cont("sandbox"); if (primary) primary.disabled = !picked.length;
      next = { title: "Pick every repository that belongs to the app", body: "Imported from the GitHub organization. Stack and part of the system are detected. Leave out archived or experimental repos.", icon: "branch" };
      body = `<section class="card"><div class="card-h"><h2>github.com/goa · matching "inspections"</h2><span class="meta">${picked.length} of ${W.repos.length} selected</span><button class="btn quiet" data-act="pickAll"><span class="lbl">Select all</span></button></div><div class="rows">${W.repos.map((r) => `<label class="lrow" style="cursor:pointer"><input type="checkbox" data-pick="${r.name}" ${r.picked ? "checked" : ""} style="width:18px;height:18px"><span class="lr-t"><b><code>${r.name}</code></b><span>${r.group}</span></span><span class="stack p-${r.profile}">${PROFILES[r.profile]}</span></label>`).join("")}</div></section>`;
    } else if (cur === "sandbox") {
      primary = W.ran ? cont("output") : { label: W.running ? "Running…" : `Run in sandbox (${picked.length} repos)`, act: "wizRun", disabled: W.running };
      next = { title: "Read-only sandbox, one run for all repositories", body: "Review the code, generate agents from the standard template, configure the Assurance Mesh and record a baseline per repository.", icon: "lock" };
      body = `<section class="card"><div class="card-h"><h2>Sandbox log</h2><span class="meta">${W.ran ? "finished" : W.running ? "running" : "not started"}</span></div><pre class="log" aria-live="polite">${W.log.join("\n") || '<span class="dim">Press Run in sandbox.</span>'}</pre></section>`;
    } else if (cur === "output") {
      primary = cont("prs");
      next = { title: "Review by part of the system", body: "Each group lists its repositories, what the review found and what each pull request will contain.", icon: "code" };
      const groups = [...new Set(picked.map((r) => r.group))];
      body = groups.map((g) => { const list = picked.filter((r) => r.group === g); return `<section class="card"><div class="card-h"><h2>${g}</h2><span class="meta">${list.length} ${list.length === 1 ? "repo" : "repos"} · ${list.length * 8} files</span></div><div class="rows">${list.map((r) => `<div class="lrow"><code>${r.name}</code><span class="lr-t"><span>${r.review.join(" · ")}</span></span><span class="stack p-${r.profile}">${PROFILES[r.profile]}</span></div>`).join("")}</div>${more("wo-" + g, "Files in each pull request", `<div class="rows">${generated(list[0]).map(([f, , d]) => `<div class="tree-file"><span class="tag-new">NEW</span><code>${f}</code><span></span><span class="muted">${d}</span></div>`).join("")}</div>`)}</section>`; }).join("");
    } else {
      primary = W.prs ? { label: "Simulate: teams merge the PRs", act: "wizDone" } : { label: `Open ${picked.length} pull requests`, act: "wizPrs" };
      next = W.prs ? { title: "Pull requests are open", body: `${esc(W.name)} joins ${esc(tm.name)}'s portfolio when they're merged and the first mesh runs report back.`, icon: "branch" } : { title: "One pull request per repository", body: `Title: "Adopt GoA Standards ${LATEST} and the Assurance Mesh".`, icon: "branch" };
      body = `<section class="card"><div class="rows">${picked.map((r, k) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">${r.group}</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">8 files · mesh on merge to main</span><span></span>${W.prs ? `<span class="pr-chip open">PR #${W.prs[k]} · open</span>` : `<span class="pr-chip none">Not opened</span>`}</div>`).join("")}</div></section>`;
    }
    return [`${header(`${esc(tm.name)} / Onboard an app`, esc(W.name), primary)}${stepper}${banner(next)}${body}`, primary];
  }

  /* -------------------------------------------------------------- packs, policy */
  function packsView() {
    const repos = allApps().flatMap((a) => a.repos);
    const body = PACKS.slice().reverse().map((k) => { const n = repos.filter((r) => r.sync === k.v).length; return `<section class="card"><div class="card-h"><span class="ver">${k.v}</span><h2>${k.latest ? "Latest pack" : "Standards pack"}</h2><span class="meta">${k.when} · ${n} ${n === 1 ? "repo" : "repos"} across all teams</span></div><div class="pad muted">${k.notes}</div>${k.changes ? `<div class="rows">${k.changes.map(([c, d]) => `<div class="lrow"><span class="delta delta-${c === "New" ? "new" : "changed"}">${c}</span><span class="lr-t"><b>${d}</b></span></div>`).join("")}</div>` : ""}</section>`; }).join("");
    return [`${header("Organization", "Standards packs", null)}${banner({ title: "Packs are edited in the Standards Library", body: "Publishing a pack lets every team send update pull requests to its repositories.", icon: "doc" })}${body}`, null];
  }
  function policyView() {
    const body = `<section class="card"><div class="card-h"><h2>Default mesh policy</h2><span class="meta">teams can tighten, not loosen</span></div><div class="rows">${MESH.map((a) => `<div class="mesh-agent"><span class="md md-${a.id}">${a.name[0]}</span><span><b>${a.name} · ${a.role}</b><small>${a.checks}</small></span><select class="inline-select" aria-label="${a.name} policy"><option ${a.id === "green" || a.id === "yellow" ? "selected" : ""}>Block new findings</option><option ${a.id === "red" || a.id === "blue" ? "selected" : ""}>Warn</option><option>Off</option></select></div>`).join("")}</div>
      ${more("pol-trigger", "Trigger and evidence", `<p class="muted">Runs when a pull request is merged into main and reports to Pronghorn. Reporting is required: a repository that stops reporting shows as "not reporting" in its team's portfolio. Existing findings are the baseline. Only new findings count.</p>`, true)}</section>`;
    return [`${header("Organization", "Mesh policy", null)}${body}`, null];
  }

  /* -------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target, p = P();
    if (t.closest("#teamSwitch")) return teamMenu(p);
    const tmb = t.closest("[data-team]"); if (tmb) { $("#teamMenu") && $("#teamMenu").remove(); return go({ tm: tmb.dataset.team, v: "portfolio", a: "", s: "", f: "all" }); }
    if (!t.closest("#teamMenu") && $("#teamMenu")) $("#teamMenu").remove();
    const day = t.closest("[data-day]"); if (day) return go({ s: p.s === "day:" + day.dataset.day ? "" : "day:" + day.dataset.day });
    const ev = t.closest("[data-evidence]"); if (ev) { const [a, pr] = ev.dataset.evidence.split(":"); return go({ v: "app", a, s: "m:" + pr }); }
    if (t.closest("[data-clear]")) return go({ s: "" });
    const ex = t.closest("[data-expand]"); if (ex) { const k = "exp." + ex.dataset.expand; store(k, ex.getAttribute("aria-expanded") === "true" ? "0" : "1"); return render(); }
    const oa = t.closest("[data-open-app]"); if (oa) return go({ v: "app", a: oa.dataset.openApp, s: "", f: "all" });
    const fl = t.closest("[data-filter]"); if (fl) return go({ f: fl.dataset.filter });
    const gr = t.closest("[data-group]"); if (gr) return go({ g: gr.dataset.group });
    const nav = t.closest("[data-nav]"); if (nav) return go({ v: nav.dataset.nav, a: nav.dataset.app || "", s: "", t: "", f: "all", tm: p.tm === "all" && nav.dataset.nav !== "packs" && nav.dataset.nav !== "policy" ? (store("lastTeam") || "permits") : p.tm });
    const ws = t.closest("[data-wstep]"); if (ws && !ws.disabled) return go({ t: ws.dataset.wstep });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });
  document.addEventListener("change", (e) => {
    const pk = e.target.closest("[data-pick]"); if (pk && S.wiz) { S.wiz.repos.find((r) => r.name === pk.dataset.pick).picked = pk.checked; return render(); }
    if (e.target.id === "wTeam" && S.wiz) { S.wiz.team = e.target.value; return go({ tm: e.target.value }); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "wName" && S.wiz) S.wiz.name = e.target.value; });

  function sendUpdates(app, pred, el) {
    runButton(el, 800, "Sent", () => { let n = 700; const opened = []; app.repos.forEach((r) => { if (isBehind(r) && !(r.pr && r.pr.state === "open") && pred(r)) { r.pr = { n: n++, state: "open" }; opened.push(r); } }); notify(`Opened ${opened.length} update PRs for Standards ${LATEST}`, () => opened.forEach((r) => (r.pr = null))); render(); });
  }
  function act(name, arg, el) {
    const p = P(), W = S.wiz, tm = team(p);
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "nav": return go({ v: arg, a: "", s: "", t: "" });
      case "filter": return go({ f: arg });
      case "expandAll": tm.apps.forEach((a) => store("exp." + a.id, "1")); return render();
      case "sendUpdate": return sendUpdates(tm.apps.find((x) => x.id === arg), () => true, el);
      case "sendUpdateGroup": { const [id, g] = arg.split("|"), app = tm.apps.find((x) => x.id === id); return sendUpdates(app, (r) => (p.g === "stack" ? PROFILES[r.profile] : r.group) === g, el); }
      case "pickAll": W.repos.forEach((r) => (r.picked = true)); return render();
      case "wiz": W.step = arg; return go({ t: arg });
      case "wizRun": {
        W.running = true; W.log = []; render();
        const picked = W.repos.filter((r) => r.picked);
        const lines = [`<span class="dim">$</span> sandbox create --read-only --network=egress-deny`, ...picked.map((r) => `review ${r.name} (${PROFILES[r.profile]}) · ${r.group} <span class="ok">ok</span>`), `match goa-standards@${LATEST} · profiles ${[...new Set(picked.map((r) => PROFILES[r.profile]))].join(", ")}`, `generate agents, skills, tools and mesh workflow for ${picked.length} repositories <span class="ok">ok</span>`, ...picked.map((r) => `baseline ${r.name}: ${r.review[1].split(" ")[0]} findings${r.group === "Batch & integration" ? ` <span class="warn">red skipped: no public endpoint</span>` : ""}`), `<span class="ok">done</span> · nothing written to the repositories`];
        let k = 0; const tick = () => { if (k >= lines.length) { W.running = false; W.ran = true; notify("Sandbox run finished", null); return render(); } W.log.push(lines[k++]); const lg = $(".log"); if (lg) { lg.innerHTML = W.log.join("\n"); lg.scrollTop = lg.scrollHeight; } chrome(P()); setTimeout(tick, 320); };
        return tick();
      }
      case "wizPrs": { const picked = W.repos.filter((r) => r.picked); return runButton(el, 800, "Opened", () => { W.prs = picked.map((r, k) => 40 + k); notify(`Opened ${W.prs.length} pull requests`, () => { W.prs = null; }); render(); }); }
      case "wizDone": return runButton(el, 1000, "Merged", () => {
        const picked = W.repos.filter((r) => r.picked), id = "app" + Date.now();
        tm.apps.push({ id, name: W.name, owner: tm.name, repos: picked.map((r) => ({ ...r, newFindings: 0, baseline: +r.review[1].split(" ")[0], mesh: { green: "pass", yellow: "warn", red: r.group === "Batch & integration" ? "skip" : "pass", blue: "warn" } })), merges: picked.slice(0, 3).map((r, k) => ({ pr: W.prs[k], repo: r.name, day: "Today", verdict: "warn", note: "Yellow: baseline recorded" })), exceptions: picked.filter((r) => r.group === "Batch & integration").map((r) => ({ repo: r.name, rule: "Red recon", why: "Batch job, no public endpoint", until: "Sep 2027" })) });
        const name = W.name; S.wiz = null; notify(`${name} joined ${tm.name}'s portfolio`, null); go({ v: "app", a: id, s: "", t: "", f: "all" });
      });
    }
  }

  // remember the last real team so returning from All teams lands somewhere sensible
  window.addEventListener("hashchange", () => { const tm = P().tm; if (tm !== "all") store("lastTeam", tm); });
  render();
})();

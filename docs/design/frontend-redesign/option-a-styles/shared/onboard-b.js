/*
 * Onboarding · Option B · Assurance console
 *
 * Connected apps are not projects. They live in one organization-level console
 * next to the Standards Library. The console is built for the people who own
 * assurance across many teams:
 *   portfolio = every app and repository against every mesh agent
 *   timeline  = merges to main with their mesh verdict (the evidence stream)
 *   onboarding = a four-step wizard that ends with pull requests
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, btn, banner, more, header, runButton, notify, afterUndo } = PK;
  const { MESH, PACKS, PROFILES, generated, meshDots, legend, latestPack, verdictWord } = OB;
  PK.shell();
  $(".demo-switch").hidden = true;
  document.body.classList.add("is-connected");
  $(".sw-name").textContent = "Organization · Assurance";

  const S = { apps: OB.apps(), wiz: null };
  function freshWizard() { return { app: OB.candidate(), step: "connect", running: false, ran: false, log: [], prs: null }; }

  function P() { const h = PK.hashParams(); return { v: h.v || "portfolio", a: h.a || "", s: h.s || "", t: h.t || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  const LATEST = latestPack();
  const worst = (app) => { const all = app.repos.flatMap((r) => Object.values(r.mesh)); return all.includes("fail") ? "fail" : all.includes("warn") ? "warn" : "pass"; };
  const allMerges = () => S.apps.flatMap((a) => a.merges.map((m) => ({ ...m, app: a.id }))).slice(-8);

  /* ------------------------------------------------------------------ chrome */
  function chrome(p) {
    $("#modeBadge").innerHTML = `<span class="dot"></span><span class="mb-long">Assurance console · latest pack </span><b>${LATEST}</b>`;
    $("#pillA").innerHTML = S.wiz && S.wiz.running ? `<span class="dot run"></span>Sandbox running` : `<span class="dot ok"></span>${S.apps.length} apps connected`;
    const showStrip = p.v === "portfolio" || p.v === "app";
    document.body.classList.toggle("has-ctx", showStrip); document.body.classList.toggle("has-timeline", showStrip);
    $("#strip").hidden = !showStrip;
    if (!showStrip) return;
    const app = S.apps.find((a) => a.id === p.a);
    const list = p.v === "app" && app ? app.merges.map((m) => ({ ...m, app: app.id })) : allMerges();
    $("#strip").className = "ctxbar strip timeline";
    $("#strip").innerHTML = `<div class="tl" role="navigation" aria-label="Merges to main">
      <span class="tl-node hist"><span class="tl-dot"></span><span class="tl-v">${p.v === "app" ? "Onboarded" : "Merges"}</span><span class="tl-s">${p.v === "app" ? "Jan 2026" : "across all apps"}</span></span>
      ${list.map((m) => `<button class="tl-node verdict-${m.verdict}" data-merge="${m.app}:${m.pr}" ${p.s === String(m.pr) && p.a === m.app ? 'aria-current="true"' : ""}><span class="tl-dot"></span><span class="tl-v">#${m.pr}</span><span class="tl-s">${m.repo} · ${verdictWord[m.verdict]}</span></button>`).join("")}
      <span class="tl-sep"></span><span class="tl-node planned"><span class="tl-dot"></span><span class="tl-v">Next merge</span><span class="tl-s">runs the mesh</span></span></div>`;
  }

  function rail(p) {
    const item = (v, icon, label, extra, a) => `<button class="rail-item" data-nav="${v}" ${a ? `data-app="${a}"` : ""} ${(p.v === v && (!a || p.a === a)) ? 'aria-current="page"' : ""}>${svg(icon)}<span class="ri-t">${label}</span>${extra || ""}</button>`;
    $("#rail").innerHTML = `
      <div class="rail-group">${item("portfolio", "grid", "Portfolio")}${item("onboard", "plus", "Onboard an app")}${item("packs", "tag", "Standards packs", `<small>${LATEST}</small>`)}</div>
      <div class="rail-group"><div class="rail-label">Connected apps · ${S.apps.length}</div>
        ${S.apps.map((a) => item("app", "branch", esc(a.name), `<span class="md md-${worst(a) === "fail" ? "red" : worst(a) === "warn" ? "yellow" : "green"}" style="width:14px;height:14px;margin-left:auto" title="${verdictWord[worst(a)]}"></span>`, a.id)).join("")}</div>
      <div class="rail-foot"><button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Mesh policy</span></button></div>`;
    $("#tabbar").style.gridTemplateColumns = "repeat(4, 1fr)";
    $("#tabbar").innerHTML = [["portfolio", "grid", "Portfolio"], ["onboard", "plus", "Onboard"], ["packs", "tag", "Packs"], ["settings", "gear", "Policy"]].map(([v, ic, l]) => `<button data-nav="${v}" ${p.v === v ? 'aria-current="page"' : ""}>${svg(ic, 22)}<span>${l}</span></button>`).join("");
  }

  function render() {
    const p = P();
    chrome(p); rail(p);
    document.body.dataset.view = "work";
    let html, primary;
    if (p.v === "app") [html, primary] = appView(p);
    else if (p.v === "onboard") [html, primary] = onboardView(p);
    else if (p.v === "packs") [html, primary] = packsView();
    else if (p.v === "settings") [html, primary] = policyView();
    else [html, primary] = portfolioView();
    $("#page").innerHTML = html; $("#mAction").innerHTML = btn(primary); document.body.classList.toggle("has-maction", !!primary);
    const lg = $(".log"); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  /* -------------------------------------------------------------- portfolio */
  function portfolioView() {
    const repos = S.apps.flatMap((a) => a.repos), behind = repos.filter((r) => r.sync !== LATEST).length, fresh = repos.filter((r) => r.newFindings).length;
    const primary = { label: "Onboard an app", act: "nav", arg: "onboard" };
    const next = fresh ? { title: `${fresh} ${fresh > 1 ? "repositories have" : "repository has"} new findings after a merge`, body: `${behind} of ${repos.length} repositories are behind Standards ${LATEST}.`, icon: "alert", tone: "warn" } : { title: "No new findings", body: `${behind} of ${repos.length} repositories are behind Standards ${LATEST}.`, icon: "check", tone: "ok" };
    const body = `<section class="card"><div class="card-h"><h2>Apps and repositories</h2><span class="meta">${S.apps.length} apps · ${repos.length} repos</span></div><div class="tbl-scroll"><table class="matrix">
      <tr><th>APP / REPOSITORY</th><th>STACK</th><th>STANDARDS</th><th>MESH ON MAIN</th><th>NEW FINDINGS</th><th>ASVS L2</th></tr>
      ${S.apps.map((a) => `<tr class="app-row"><td colspan="6"><button data-open-app="${a.id}">${esc(a.name)}</button> <span class="muted" style="font-weight:400">· ${a.owner}</span></td></tr>
        ${a.repos.map((r) => `<tr><td><code>${r.name}</code></td><td><span class="stack p-${r.profile}">${r.stack}</span></td><td class="${r.sync !== LATEST ? "behind" : ""}">${r.sync}${r.sync !== LATEST ? " · behind" : ""}</td><td>${meshDots(r.mesh)}</td><td>${r.newFindings ? `<span class="delta delta-regression">${r.newFindings} new</span>` : `<span class="muted">0 · baseline ${r.baseline}</span>`}</td><td>${r.asvs}/285</td></tr>`).join("")}`).join("")}
    </table></div>${legend()}</section>`;
    return [`${header("Organization · Assurance Mesh", "Portfolio", primary)}${banner(next)}${body}`, primary];
  }

  /* -------------------------------------------------------------- app */
  function appView(p) {
    const a = S.apps.find((x) => x.id === p.a) || S.apps[0];
    const behind = a.repos.filter((r) => r.sync !== LATEST && !(r.pr && r.pr.state === "open"));
    const primary = behind.length ? { label: `Send Standards ${LATEST} to ${behind.length} ${behind.length > 1 ? "repos" : "repo"}`, act: "sendUpdate", arg: a.id } : { label: "Run mesh on main", act: "runMesh", arg: a.id };
    const m = a.merges.find((x) => String(x.pr) === p.s);
    const evidence = m ? `<section class="card"><div class="card-h"><h2>Evidence · merge #${m.pr} into ${m.repo}</h2><span class="meta">${m.when}</span><button class="btn" data-act="noop"><span class="lbl">Download report</span><span class="progress"></span></button></div><div class="rows">${MESH.map((ag) => { const v = ag.id === "yellow" && m.verdict === "fail" ? "fail" : m.verdict === "warn" && ag.id === "green" ? "warn" : "pass"; return `<div class="mesh-agent"><span class="md md-${ag.id} ${v}">${ag.name[0]}</span><span><b>${ag.name} · ${verdictWord[v]}</b><small>${v === "fail" ? m.note : ag.checks}</small></span><span class="muted">${ag.kind}</span></div>`; }).join("")}</div></section>` : "";
    const next = m ? null : a.repos.some((r) => r.newFindings) ? { title: "New findings after the last merge", body: "Select a merge on the timeline to see its evidence.", icon: "alert", tone: "warn" } : { title: "Select a merge on the timeline to see its evidence", icon: "check" };
    const body = `${evidence}
      <section class="card"><div class="kv-grid"><div><span>Owner</span><b>${a.owner}</b></div><div><span>Repositories</span><b>${a.repos.length}</b></div><div><span>Standards</span><b>${[...new Set(a.repos.map((r) => r.sync))].join(", ")}</b></div><div><span>Exceptions</span><b>${a.exceptions.length}</b></div></div></section>
      <section class="card"><div class="card-h"><h2>Repositories</h2></div><div class="rows">${a.repos.map((r) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">Standards ${r.sync}</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">baseline ${r.baseline} · new ${r.newFindings}</span>${meshDots(r.mesh)}${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n} · ${r.pr.state}</span>` : `<span class="pr-chip none">${r.sync === LATEST ? "In sync" : "Behind"}</span>`}</div>`).join("")}</div>${legend()}</section>
      ${a.exceptions.length ? `<section class="card"><div class="card-h"><h2>Exceptions</h2></div><div class="rows">${a.exceptions.map((e) => `<div class="lrow"><code>${e.repo}</code><span class="lr-t"><b>${e.rule}</b><span>${e.why}</span></span><span class="muted">until ${e.until}</span></div>`).join("")}</div></section>` : ""}`;
    return [`${header("Connected apps", esc(a.name), primary)}${banner(next)}${body}`, primary];
  }

  /* -------------------------------------------------------------- onboard wizard */
  const WSTEPS = [["connect", "Connect repositories"], ["sandbox", "Run in sandbox"], ["output", "Review output"], ["prs", "Open pull requests"]];
  function onboardView(p) {
    if (!S.wiz) S.wiz = freshWizard();
    const W = S.wiz, A = W.app, cur = WSTEPS.some((x) => x[0] === p.t) ? p.t : W.step;
    const idx = (k) => WSTEPS.findIndex((x) => x[0] === k);
    const state = (k) => idx(k) < idx(W.step) ? "done" : k === W.step ? "active" : "todo";
    const PH = ["define", "design", "build", "ship"];
    const stepper = `<nav class="stepper" aria-label="Onboarding steps">${WSTEPS.map(([k, l], i) => `<button class="step ph-${PH[i]} st-${state(k)}" data-wstep="${k}" ${k === cur ? 'aria-current="step"' : ""}><span class="node"></span><span><b>${l}</b><small>${{ done: "Done", active: "Current", todo: "Next" }[state(k)]}</small></span></button>`).join("")}</nav>`;
    let primary = null, next = null, body = "";
    if (cur === "connect") {
      primary = W.step === "connect" ? { label: "Continue", act: "wiz", arg: "sandbox" } : null;
      next = { title: "Add every repository that belongs to the app", body: "Each can use a different stack. Pronghorn needs read access and permission to open pull requests.", icon: "branch" };
      body = `<section class="card"><div class="card-h"><h2>${esc(A.name)}</h2><span class="meta">${A.owner}</span></div><div class="rows">${A.repos.map((r) => `<div class="repo-row"><span><code>github.com/goa/${r.name}</code></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">${r.build}</span><span class="muted">${r.ci}</span><span class="linkchip ok">${svg("check", 14)}Access OK</span></div>`).join("")}</div><div class="pad form"><label class="f">Add another repository<input placeholder="github.com/goa/inspections-mobile"></label></div></section>`;
    } else if (cur === "sandbox") {
      primary = W.ran ? (W.step === "sandbox" ? { label: "Continue", act: "wiz", arg: "output" } : null) : { label: W.running ? "Running…" : "Run in sandbox", act: "wizRun", disabled: W.running };
      next = { title: "Read-only sandbox, one run", body: "Review the code, generate agents from the standard template, configure the Assurance Mesh and record a baseline.", icon: "lock" };
      body = `<section class="card"><div class="card-h"><h2>Sandbox log</h2><span class="meta">${W.ran ? "finished" : W.running ? "running" : "not started"}</span></div><pre class="log" aria-live="polite">${W.log.join("\n") || '<span class="dim">Press Run in sandbox.</span>'}</pre></section>`;
    } else if (cur === "output") {
      primary = W.step === "output" ? { label: "Continue", act: "wiz", arg: "prs" } : null;
      next = { title: "Check what each pull request will contain", body: "Review findings, generated files and the baseline, per repository.", icon: "code" };
      body = A.repos.map((r) => `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2><span class="stack p-${r.profile}">${r.stack}</span></div>
        <div class="sub-h">Code review</div><div class="rows">${r.review.map((x) => `<div class="lrow"><span class="lr-t"><b>${x}</b></span></div>`).join("")}</div>
        ${more("bo-" + r.name, `8 generated files`, `<div class="rows">${generated(r).map(([f, , d]) => `<div class="tree-file"><span class="tag-new">NEW</span><code>${f}</code><span></span><span class="muted">${d}</span></div>`).join("")}</div>`)}
        <div class="ratchet"><div><span>Baseline findings</span><b>${r.baseline.green + r.baseline.yellow + r.baseline.blue}</b></div><div><span>Green · Yellow · Blue</span><b>${r.baseline.green} · ${r.baseline.yellow} · ${r.baseline.blue}</b></div><div><span>New findings allowed</span><b class="ok">0</b></div></div></section>`).join("");
    } else {
      primary = W.prs ? { label: "Simulate: teams merge the PRs", act: "wizDone" } : { label: `Open ${A.repos.length} pull requests`, act: "wizPrs" };
      next = W.prs ? { title: "Pull requests are open", body: "The app joins the portfolio when both are merged and the first mesh run reports back.", icon: "branch" } : { title: "One pull request per repository", body: `Title: "Adopt GoA Standards ${LATEST} and the Assurance Mesh".`, icon: "branch" };
      body = `<section class="card"><div class="rows">${A.repos.map((r, k) => `<div class="repo-row"><span><code>${r.name}</code></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">8 files · mesh workflow on merge to main</span><span></span>${W.prs ? `<span class="pr-chip open">PR #${W.prs[k]} · open</span>` : `<span class="pr-chip none">Not opened</span>`}</div>`).join("")}</div></section>`;
    }
    return [`${header("Onboard an app", `${esc(A.name)}`, primary)}${stepper}${banner(next)}${body}`, primary];
  }

  /* -------------------------------------------------------------- packs, policy */
  function packsView() {
    const repos = S.apps.flatMap((a) => a.repos);
    const body = PACKS.slice().reverse().map((k) => { const n = repos.filter((r) => r.sync === k.v).length; return `<section class="card"><div class="card-h"><span class="ver">${k.v}</span><h2>${k.latest ? "Latest pack" : "Standards pack"}</h2><span class="meta">${k.when} · ${n} ${n === 1 ? "repo" : "repos"}</span></div><div class="pad muted">${k.notes}</div>${k.changes ? `<div class="rows">${k.changes.map(([c, d]) => `<div class="lrow"><span class="delta delta-${c === "New" ? "new" : "changed"}">${c}</span><span class="lr-t"><b>${d}</b></span></div>`).join("")}</div>` : ""}</section>`; }).join("");
    return [`${header("Organization", "Standards packs", null)}${banner({ title: "Packs are edited in the Standards Library", body: "Publishing a pack sends update pull requests to every connected repository that follows it.", icon: "doc" })}${body}`, null];
  }
  function policyView() {
    const body = `<section class="card"><div class="card-h"><h2>Default mesh policy</h2><span class="meta">apps can tighten, not loosen</span></div><div class="rows">${MESH.map((a) => `<div class="mesh-agent"><span class="md md-${a.id}">${a.name[0]}</span><span><b>${a.name} · ${a.role}</b><small>${a.checks}</small></span><select class="inline-select" aria-label="${a.name} policy"><option ${a.id === "green" || a.id === "yellow" ? "selected" : ""}>Block new findings</option><option ${a.id === "red" || a.id === "blue" ? "selected" : ""}>Warn</option><option>Off</option></select></div>`).join("")}</div>
      ${more("pol-trigger", "Trigger and evidence", `<p class="muted">Runs when a pull request is merged into main. Reports go to Pronghorn as evidence. Existing findings are the baseline. Only new findings count.</p>`, true)}</section>`;
    return [`${header("Organization", "Mesh policy", null)}${body}`, null];
  }

  /* -------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const mg = t.closest("[data-merge]"); if (mg) { const [a, pr] = mg.dataset.merge.split(":"); return go({ v: "app", a, s: pr }); }
    const oa = t.closest("[data-open-app]"); if (oa) return go({ v: "app", a: oa.dataset.openApp, s: "" });
    const nav = t.closest("[data-nav]"); if (nav) return go({ v: nav.dataset.nav, a: nav.dataset.app || "", s: "", t: "" });
    const ws = t.closest("[data-wstep]"); if (ws) return go({ t: ws.dataset.wstep });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });

  function act(name, arg, el) {
    const W = S.wiz;
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "nav": return go({ v: arg, a: "", s: "", t: "" });
      case "wiz": W.step = arg; return go({ t: arg });
      case "wizRun": {
        if (W.step === "connect") W.step = "sandbox";
        W.running = true; W.log = []; render();
        const lines = [`<span class="dim">$</span> sandbox create --read-only`, ...W.app.repos.map((r) => `review ${r.name} (${r.stack}) · ${r.review.length} notes <span class="ok">ok</span>`), `match goa-standards@${LATEST} · profiles ${W.app.repos.map((r) => PROFILES[r.profile]).join(", ")}`, ...W.app.repos.map((r) => `generate agents, skills, tools and mesh workflow for ${r.name} <span class="ok">ok</span>`), ...W.app.repos.map((r) => `baseline mesh ${r.name}: ${r.baseline.green + r.baseline.yellow + r.baseline.blue} findings <span class="warn">red skipped: no Test URL</span>`), `<span class="ok">done</span>`];
        let k = 0; const tick = () => { if (k >= lines.length) { W.running = false; W.ran = true; notify("Sandbox run finished", null); return render(); } W.log.push(lines[k++]); const lg = $(".log"); if (lg) { lg.innerHTML = W.log.join("\n"); lg.scrollTop = lg.scrollHeight; } chrome(P()); setTimeout(tick, 420); };
        return tick();
      }
      case "wizPrs": return runButton(el, 800, "Opened", () => { W.prs = W.app.repos.map((r, k) => 40 + k * 3); notify(`Opened ${W.prs.length} pull requests`, () => { W.prs = null; }); render(); });
      case "wizDone": return runButton(el, 1000, "Merged", () => {
        const c = W.app;
        S.apps.push({ ...c, pack: LATEST, repos: c.repos.map((r) => ({ ...r, sync: LATEST, pr: null, mesh: { green: r.baseline.green ? "warn" : "pass", yellow: r.baseline.yellow ? "warn" : "pass", red: "skip", blue: "warn" }, asvs: 285 - Math.round(r.baseline.blue / 3), baseline: r.baseline.green + r.baseline.yellow + r.baseline.blue, newFindings: 0 })), merges: c.repos.map((r, k) => ({ pr: W.prs[k], repo: r.name, when: "just now", verdict: "warn" })), exceptions: [{ repo: c.repos[0].name, rule: "Red recon", why: "No Test URL yet", until: "Dec 2026" }] });
        S.wiz = null; notify(`${c.name} joined the portfolio`, null); go({ v: "app", a: c.id, s: "", t: "" });
      });
      case "sendUpdate": { const app = S.apps.find((x) => x.id === arg); return runButton(el, 800, "Sent", () => { let n = 500; const opened = []; app.repos.forEach((r) => { if (r.sync !== LATEST && !(r.pr && r.pr.state === "open")) { r.pr = { n: n++, state: "open" }; opened.push(r); } }); notify(`Opened ${opened.length} update PRs`, () => opened.forEach((r) => (r.pr = null))); render(); }); }
      case "runMesh": return runButton(el, 1200, "Finished", () => render());
    }
  }

  render();
})();

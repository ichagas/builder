/*
 * Onboarding · Option C · Standards subscriptions
 *
 * Pronghorn works like a package registry for Standards. A repository
 * "subscribes" once: a sandbox run generates one pull request with the agents,
 * skills, tools, the Assurance Mesh workflow and pronghorn.standards.yml, which
 * pins a pack version. After that the repository is self-sufficient. New packs
 * arrive as update pull requests, like dependency updates.
 *   timeline  = Standards pack releases, with how many repos pin each one
 *   4 phases  = what a pack contains: Standards → Agents → Skills & tools → Mesh
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, btn, banner, more, header, tabs, runButton, notify, afterUndo, openSheet, closeSheet } = PK;
  const { MESH, PACKS, PROFILES, generated, meshDots, legend, latestPack, verdictWord } = OB;
  PK.shell();
  $(".demo-switch").hidden = true;
  document.body.classList.add("is-connected", "has-ctx", "has-timeline");
  $(".sw-name").textContent = "Organization · Standards";

  const LATEST = latestPack();
  const S = { apps: OB.apps() };
  const repos = () => S.apps.flatMap((a) => a.repos.map((r) => ({ ...r, app: a })));

  const SECTIONS = [["standards", "Standards", "define"], ["agents", "Agents", "design"], ["skills", "Skills & tools", "build"], ["mesh", "Mesh", "ship"]];

  function P() { const h = PK.hashParams(); return { r: h.r || LATEST, v: h.v || "pack", t: h.t || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  /* ------------------------------------------------------------------ chrome */
  function chrome(p) {
    $("#modeBadge").innerHTML = `<span class="dot"></span><span class="mb-long">Standards registry · latest </span><b>${LATEST}</b>`;
    const behind = repos().filter((r) => r.sync !== LATEST).length;
    $("#pillA").innerHTML = `<span class="dot ${behind ? "warn" : "ok"}"></span>${behind} repos behind`;
    $("#strip").className = "ctxbar strip timeline"; $("#strip").hidden = false;
    $("#strip").innerHTML = `<div class="tl" role="navigation" aria-label="Standards packs">
      ${PACKS.map((k) => { const n = repos().filter((r) => r.sync === k.v).length; return `<button class="tl-node ${k.latest ? "live" : "hist"}" data-ver="${k.v}" ${k.v === p.r && p.v !== "apps" ? 'aria-current="true"' : ""}><span class="tl-dot"></span><span class="tl-v">${k.v}</span><span class="tl-s">${k.latest ? "Latest · " : ""}<span class="adopt">${n} ${n === 1 ? "repo" : "repos"}</span></span></button>`; }).join("")}
      <span class="tl-sep"></span><span class="tl-node planned"><span class="tl-dot"></span><span class="tl-v">2026.4</span><span class="tl-s">Drafting</span></span></div>`;
  }

  function rail(p) {
    const pk = PACKS.find((k) => k.v === p.r), n = repos().filter((r) => r.sync === p.r).length;
    const counts = { standards: "4 sources · 359 checks", agents: "3 agents × 4 profiles", skills: "5 skills · 3 tools", mesh: "Workflow v3" };
    $("#rail").innerHTML = `
      <div class="rail-group">
        <button class="rail-item" data-nav="apps" ${p.v === "apps" ? 'aria-current="page"' : ""}>${svg("grid")}<span class="ri-t">Repositories</span><span class="n">${repos().length}</span></button>
        <button class="rail-item" data-act="subscribe">${svg("plus")}<span class="ri-t">Subscribe a repository</span></button>
      </div>
      <div class="rail-ctx"><div class="rail-label">Pack</div><button class="mode-card" data-nav="pack"><span class="mc-l">${svg("tag", 14)}${pk.latest ? "LATEST PACK" : "EARLIER PACK"}</span><span class="mc-v">Standards ${pk.v}</span><span class="mc-s">${pk.when} · pinned by ${n} ${n === 1 ? "repo" : "repos"}</span></button></div>
      <div class="journey">${SECTIONS.map(([id, name, ph]) => `<button class="phase ph-${ph} st-base" data-nav="${id}" ${p.v === id ? 'aria-current="page"' : ""}><span class="node"></span><span class="ph-txt"><span class="ph-name">${name}</span><span class="ph-note">${counts[id]}</span></span></button>`).join("")}</div>
      <div class="rail-foot"><button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Registry settings</span></button></div>`;
    $("#tabbar").innerHTML = `<button data-nav="apps" ${p.v === "apps" ? 'aria-current="page"' : ""}>${svg("grid", 22)}<span>Repos</span></button>` + SECTIONS.map(([id, name, ph]) => `<button class="ph-${ph} st-base" data-nav="${id}" ${p.v === id ? 'aria-current="page"' : ""}><span class="node"></span><span>${name.split(" ")[0]}</span></button>`).join("");
  }

  function render() {
    const p = P(); chrome(p); rail(p);
    document.body.dataset.view = { standards: "define", agents: "design", skills: "build", mesh: "ship" }[p.v] || "work";
    const fn = { pack: packView, apps: appsView, standards: standardsView, agents: agentsView, skills: skillsView, mesh: meshView, settings: settingsView }[p.v] || packView;
    const [html, primary] = fn(p);
    $("#page").innerHTML = html; $("#mAction").innerHTML = btn(primary); document.body.classList.toggle("has-maction", !!primary);
  }

  const profileTabs = (t) => tabs(Object.entries(PROFILES).map(([k, v]) => [k, v]), PROFILES[t] ? t : "dotnet", "Stack profiles");

  /* ------------------------------------------------------------------ pack */
  function packView(p) {
    const pk = PACKS.find((k) => k.v === p.r), all = repos(), here = all.filter((r) => r.sync === pk.v), behind = all.filter((r) => r.sync < pk.v);
    const waiting = behind.filter((r) => !(r.pr && r.pr.state === "open"));
    const primary = pk.latest && waiting.length ? { label: `Send update PRs to ${waiting.length} repos`, act: "sendAll" } : pk.latest ? null : { label: `Compare with ${LATEST}`, act: "noop" };
    const next = pk.latest ? { title: `${behind.length} repositories are on an earlier pack`, body: "Update pull requests carry the new agents, skills and mesh workflow. Teams merge them in their own flow. Local edits to generated files are kept.", icon: "tag" } : { title: `Standards ${pk.v} is an earlier pack`, body: `${here.length} ${here.length === 1 ? "repository still pins" : "repositories still pin"} it.`, icon: "lock", tone: "lock" };
    const body = `<section class="card"><div class="card-h"><h2>What's in ${pk.v}</h2><span class="meta">${pk.when}</span></div><div class="pad muted">${pk.notes}</div>${pk.changes ? `<div class="rows">${pk.changes.map(([c, d]) => `<div class="lrow"><span class="delta delta-${c === "New" ? "new" : "changed"}">${c}</span><span class="lr-t"><b>${d}</b></span></div>`).join("")}</div>` : ""}</section>
      <section class="card"><div class="card-h"><h2>Repositories on this pack</h2><span class="meta">${here.length}</span></div><div class="rows">${here.map((r) => repoRow(r)).join("") || `<div class="empty small">No repository pins ${pk.v}.</div>`}</div></section>
      ${pk.latest ? `<section class="card"><div class="card-h"><h2>Behind</h2><span class="meta">${behind.length}</span></div><div class="rows">${behind.map((r) => repoRow(r)).join("")}</div>${legend()}</section>` : ""}`;
    return [`${header("Standards registry", `Standards ${pk.v}`, primary)}${banner(next)}${body}`, primary];
  }
  function repoRow(r) {
    return `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">${esc(r.app.name)} · pins ${r.sync}</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">${r.build}</span>${meshDots(r.mesh)}${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n} · ${r.pr.state}</span>` : `<span class="pr-chip none">${r.sync === LATEST ? "Up to date" : "No update PR"}</span>`}</div>`;
  }

  /* ------------------------------------------------------------------ subscribed repositories */
  function appsView() {
    const primary = { label: "Subscribe a repository", act: "subscribe" };
    const r0 = S.apps[0].repos[0];
    const body = S.apps.map((a) => `<section class="card"><div class="card-h"><h2>${esc(a.name)}</h2><span class="meta">${a.owner}</span></div><div class="rows">${a.repos.map((r) => repoRow({ ...r, app: a })).join("")}</div></section>`).join("")
      + `<section class="card"><div class="card-h"><h2>The subscription lives in the repository</h2><span class="meta">${r0.name}/pronghorn.standards.yml</span></div><pre class="code"><span class="c"># The repo owns this file. Pronghorn only proposes changes to it.</span>
<span class="k">standards</span>: <span class="s">goa-standards@${r0.sync}</span>      <span class="c"># bumped by update PRs</span>
<span class="k">profile</span>: <span class="s">${r0.profile}</span>
<span class="k">build</span>: <span class="s">"${r0.build}"</span>
<span class="k">assurance_mesh</span>:
  <span class="k">workflow</span>: <span class="s">goa-standards/assurance-mesh@v3</span>
  <span class="k">trigger</span>: <span class="s">merge-to-main</span>
  <span class="k">block_on</span>: [<span class="s">green</span>, <span class="s">yellow</span>]
  <span class="k">warn_on</span>: [<span class="s">red</span>, <span class="s">blue</span>]
  <span class="k">report_to</span>: <span class="s">https://pronghorn.blue/api/v1/mesh</span>   <span class="c"># optional</span></pre></section>`;
    return [`${header("Standards registry", "Subscribed repositories", primary)}${banner({ title: "Subscribed repositories don't depend on Pronghorn to work", body: "Agents, skills and the mesh workflow live in each repository. Pronghorn publishes packs, opens update pull requests and collects mesh reports if the repository sends them.", icon: "branch" })}${body}`, primary];
  }

  /* ------------------------------------------------------------------ pack contents */
  function standardsView(p) {
    const rows = [["OWASP ASVS 5.0 · Level 2", "285 requirements", "blue"], ["Alberta cybersecurity rules", "62 rules", "blue"], ["Plain language for public services", "12 writing rules", "yellow"], ["Secure coding and hygiene", "Dependencies, secrets, patterns, coverage", "green"], ["WCAG 2.2 AA", "Accessibility skill for web profiles", null]];
    return [`${header(`Standards ${p.r}`, "Standards", null)}${banner({ title: "Ground truth the agents apply", body: "Each source is written as a skill that the agents follow while working and that the mesh checks on merge.", icon: "doc" })}
      <section class="card"><div class="rows">${rows.map(([n, d, a]) => `<div class="lrow">${a ? `<span class="md md-${a}">${a[0].toUpperCase()}</span>` : `<span class="md none">·</span>`}<span class="lr-t"><b>${n}</b><span>${d}</span></span></div>`).join("")}</div></section>`, null];
  }
  function agentsView(p) {
    const prof = PROFILES[p.t] ? p.t : "dotnet", r = { name: "your-repo", profile: prof, build: { dotnet: "dotnet build && dotnet test", node: "npm ci && npm test", java: "mvn verify", python: "pytest" }[prof], test: { dotnet: "xUnit", node: "Vitest or Jest", java: "JUnit 5", python: "pytest" }[prof] };
    return [`${header(`Standards ${p.r}`, "Agents", null)}${profileTabs(prof)}${banner({ title: `What a ${PROFILES[prof]} repository receives`, body: "Templates are filled with the repository's own context during the sandbox run.", icon: "code" })}
      <section class="card"><div class="rows">${generated(r).filter(([f]) => f.includes("agents") || f.includes("instructions") || f.includes("copilot")).map(([f, , d]) => `<div class="tree-file"><span class="tag-same">TEMPLATE</span><code>${f}</code><span></span><span class="muted">${d}</span></div>`).join("")}</div></section>`, null];
  }
  function skillsView(p) {
    const prof = PROFILES[p.t] ? p.t : "dotnet";
    const skills = [["build-and-test", { dotnet: "dotnet build && dotnet test", node: "npm ci && npm test", java: "mvn verify", python: "pytest" }[prof]], ["dependency-audit", { dotnet: "dotnet list package --vulnerable", node: "npm audit", java: "OWASP dependency-check", python: "pip-audit" }[prof]], ["alberta-rules", "Checks code and config against the 62 rules"], ["plain-language", "Applies the 12 Yellow rules to UI text and docs"], ["release-notes", "Drafts notes from merged pull requests"]];
    const tools = [["GitHub MCP", "Issues, pull requests, code security"], ["Context7", "Library documentation lookup"], ["Azure MCP", "Only for repositories that deploy to Azure"]];
    return [`${header(`Standards ${p.r}`, "Skills & tools", null)}${profileTabs(prof)}
      <section class="card"><div class="card-h"><h2>Skills</h2><span class="meta">.github/skills</span></div><div class="rows">${skills.map(([n, d]) => `<div class="lrow"><code>${n}</code><span class="lr-t"><span>${d}</span></span></div>`).join("")}</div></section>
      <section class="card"><div class="card-h"><h2>Tools</h2><span class="meta">MCP servers</span></div><div class="rows">${tools.map(([n, d]) => `<div class="lrow"><b>${n}</b><span class="lr-t"><span>${d}</span></span></div>`).join("")}</div></section>`, null];
  }
  function meshView(p) {
    return [`${header(`Standards ${p.r}`, "Assurance Mesh", null)}${banner({ title: "One reusable workflow for every stack", body: "Repositories call it when a pull request is merged into main. It builds with the repository's own command, then runs the four agents.", icon: "check" })}
      <section class="card"><div class="rows">${MESH.map((a) => `<div class="mesh-agent"><span class="md md-${a.id}">${a.name[0]}</span><span><b>${a.name} · ${a.role}</b><small>${a.kind}. ${a.checks}.</small></span><span class="muted">${a.id === "green" || a.id === "yellow" ? "Blocks new findings" : "Warns"}</span></div>`).join("")}</div>
      <pre class="code"><span class="c"># .github/workflows/assurance-mesh.yml (generated)</span>
<span class="k">on</span>:
  <span class="k">push</span>:
    <span class="k">branches</span>: [<span class="s">main</span>]          <span class="c"># runs after a PR is merged</span>
<span class="k">jobs</span>:
  <span class="k">mesh</span>:
    <span class="k">uses</span>: <span class="s">goa-standards/assurance-mesh/.github/workflows/mesh.yml@v3</span>
    <span class="k">with</span>:
      <span class="k">manifest</span>: <span class="s">pronghorn.standards.yml</span></pre></section>`, null];
  }
  function settingsView() {
    return [`${header("Standards registry", "Registry settings", null)}<section class="card">${more("rs", "Update pull requests", `<label class="check"><input type="checkbox" checked> Open update PRs when a pack is published</label><label class="check"><input type="checkbox" checked> Group all files in one PR per repository</label><label class="check"><input type="checkbox"> Auto-merge when the mesh passes</label>`, true)}</section>`, null];
  }

  /* ------------------------------------------------------------------ subscribe */
  function subscribe() {
    const cand = OB.candidate();
    const body = `<p class="muted" style="margin:0">Pick the repositories. Pronghorn detects each stack, runs the sandbox once and opens one pull request per repository pinned to <b>${LATEST}</b>.</p>
      <div class="rows" style="border:1px solid var(--line);border-radius:4px">${cand.repos.map((r) => `<label class="lrow" style="cursor:pointer"><input type="checkbox" checked data-sub="${r.name}" style="width:18px;height:18px"><span class="lr-t"><b><code>${r.name}</code></b><span>Detected ${r.stack} · ${PROFILES[r.profile]} profile</span></span><span class="stack p-${r.profile}">${PROFILES[r.profile]}</span></label>`).join("")}</div>
      <label class="f">App name<input id="subApp" value="${cand.name}"></label>
      <div id="subProgress"></div>`;
    openSheet("Subscribe a repository", body, `<button class="btn quiet" data-close><span class="lbl">Cancel</span></button><button class="btn primary" id="subGo"><span class="lbl">Run sandbox and open PRs</span><span class="progress"></span></button>`);
    $("#subGo").onclick = () => {
      const picked = cand.repos.filter((r) => $(`[data-sub="${r.name}"]`).checked);
      if (!picked.length) return;
      const steps = ["Review code", "Generate agents, skills and tools", "Configure the mesh and record a baseline", "Open pull requests"];
      $("#subProgress").innerHTML = `<div class="rows" style="border:1px solid var(--line);border-radius:4px">${steps.map((s, k) => `<div class="chk todo" id="sp-${k}"><span class="st"></span><span class="lr-t"><b>${s}</b></span></div>`).join("")}</div>`;
      runButton($("#subGo"), 2600, "Done", () => {
        S.apps.push({ ...cand, name: $("#subApp") ? $("#subApp").value : cand.name, repos: picked.map((r, k) => ({ ...r, sync: LATEST, pr: { n: 60 + k, state: "open" }, mesh: null, asvs: 0, baseline: r.baseline.green + r.baseline.yellow + r.baseline.blue, newFindings: 0 })), merges: [], exceptions: [] });
        closeSheet(); notify(`Opened ${picked.length} subscription PRs pinned to ${LATEST}`, () => { S.apps.pop(); });
        go({ v: "apps" });
      });
      let k = 0; const tick = () => { if (k > 0) { const pr = $("#sp-" + (k - 1)); if (pr) { pr.className = "chk pass"; pr.querySelector(".st").innerHTML = svg("check", 14); } } if (k < steps.length) { const c = $("#sp-" + k); if (c) c.className = "chk run"; k++; setTimeout(tick, 600); } }; tick();
    };
  }

  /* ------------------------------------------------------------------ events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const vb = t.closest("[data-ver]"); if (vb) return go({ r: vb.dataset.ver, v: P().v === "apps" ? "pack" : P().v });
    const nav = t.closest("[data-nav]"); if (nav) return go({ v: nav.dataset.nav, t: "" });
    const tl = t.closest("[data-tool]"); if (tl) return go({ t: tl.dataset.tool });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });
  function act(name, arg, el) {
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "subscribe": return subscribe();
      case "sendAll": return runButton(el, 900, "Sent", () => { let n = 700; const opened = []; S.apps.forEach((a) => a.repos.forEach((r) => { if (r.sync !== LATEST && !(r.pr && r.pr.state === "open")) { r.pr = { n: n++, state: "open" }; opened.push(r); } })); notify(`Opened ${opened.length} update PRs for Standards ${LATEST}`, () => opened.forEach((r) => (r.pr = null))); render(); });
    }
  }

  render();
})();

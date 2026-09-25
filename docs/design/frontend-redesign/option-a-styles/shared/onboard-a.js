/*
 * Onboarding · Option A · Connected project
 *
 * An existing application becomes a "connected" project that uses the same
 * shell as Approach 3. What changes is the meaning of the parts:
 *   timeline  = Standards packs the app has adopted (not app versions)
 *   flag      = "Onboarded" (not "First release")
 *   4 phases  = Review → Standards → Agents → Mesh (the onboarding steps,
 *               repeated for every Standards update)
 * The team keeps building in its own repos and tools. Pronghorn only reviews,
 * generates the .github agents and the Assurance Mesh, and opens PRs.
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, btn, banner, more, header, tabs, confirmStep, runButton, notify, afterUndo } = PK;
  const { MESH, PACKS, PROFILES, generated } = OB;
  PK.shell();
  document.body.classList.add("has-ctx", "has-timeline");
  $$("[data-demo]").forEach((b) => { b.textContent = b.dataset.demo === "building" ? "Onboarding" : "Connected"; });

  const STEPS = [
    { id: "review", name: "Review", icon: "search" },
    { id: "standards", name: "Standards", icon: "doc" },
    { id: "agents", name: "Agents", icon: "code" },
    { id: "mesh", name: "Mesh", icon: "check" },
  ];
  // reuse the phase colours of the lifecycle rail
  const PC = { review: "define", standards: "design", agents: "build", mesh: "ship" };

  /* ------------------------------------------------------------------ state */
  function onboardingState() {
    const app = OB.candidate();
    return { app, pack: "2026.3", ran: false, running: false, st: { review: "todo", standards: "todo", agents: "todo", mesh: "todo" }, log: [], prs: null, merged: false, redUrl: "" };
  }
  function connectedState(fromOnboarding) {
    if (fromOnboarding) {
      const c = OB.candidate();
      return {
        app: { ...c, pack: "2026.3", repos: c.repos.map((r) => ({ ...r, sync: "2026.3", pr: { n: 1, state: "merged" }, mesh: { green: r.baseline.green ? "warn" : "pass", yellow: r.baseline.yellow ? "warn" : "pass", red: "pass", blue: "warn" }, asvs: 285 - Math.round(r.baseline.blue / 3), baseline: r.baseline.green + r.baseline.yellow + r.baseline.blue, newFindings: 0 })), merges: [], exceptions: [] },
        versions: [{ v: "onboard", kind: "hist", label: "Onboarding", sub: "Today" }, { v: "2026.3", kind: "current", sub: "Adopted", first: true }],
      };
    }
    const app = OB.apps()[0];
    return {
      app,
      versions: [
        { v: "onboard", kind: "hist", label: "Onboarding", sub: "Jan 2026" },
        { v: "2026.1", kind: "hist", sub: "Adopted Jan 2026", first: true },
        { v: "2026.2", kind: "current", sub: "Adopted Jun 2026" },
        { v: "2026.3", kind: "building", sub: "Update" },
      ],
    };
  }
  let S = { on: onboardingState(), cn: connectedState(false) };

  function P() { const h = PK.hashParams(); return { p: h.p === "onboarding" ? "onboarding" : "connected", r: h.r || "", v: h.v || "", t: h.t || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  const isOpen = (x) => x && (x.kind === "building" || x.kind === "planned");
  function selected(p) {
    if (p.p === "onboarding") return "onboard";
    const vs = S.cn.versions; return (vs.find((x) => x.v === p.r) || vs.find((x) => x.kind === "building") || vs.find((x) => x.kind === "current")).v;
  }
  const repoCount = (v) => S.cn.app.repos.filter((r) => r.sync === v).length;

  /* ------------------------------------------------------------------ chrome */
  function chrome(p, sel) {
    const on = p.p === "onboarding";
    document.body.classList.toggle("is-building", on); document.body.classList.toggle("is-connected", !on); document.body.classList.remove("is-live");
    $$("[data-demo]").forEach((b) => b.setAttribute("aria-pressed", String(on ? b.dataset.demo === "building" : b.dataset.demo === "evolve")));
    const app = on ? S.on.app : S.cn.app;
    $(".sw-name").innerHTML = `${esc(app.name)}<span class="kind-tag">Connected</span>`;
    const cur = S.cn.versions.find((x) => x.kind === "current");
    $("#modeBadge").innerHTML = on ? `<span class="dot"></span><span class="mb-long">Onboarding · sandbox</span><span class="mb-short">Onboarding</span>` : `<span class="dot"></span><span class="mb-long">Standards </span><b>${cur.v}</b>`;
    $("#pillA").innerHTML = on && S.on.running ? `<span class="dot run"></span>Sandbox running` : `<span class="dot ok"></span>${on ? "Sandbox idle" : "Agents idle"}`;

    let html = "";
    if (on) {
      html = `<span class="tl-node hist"><span class="tl-dot"></span><span class="tl-v">Connect</span><span class="tl-s">${S.on.app.repos.length} repositories</span></span>
        <button class="tl-node building" aria-current="true"><span class="tl-dot"></span><span class="tl-v">${S.on.pack}</span><span class="tl-s">Onboarding</span></button>
        <span class="tl-flag onboard pending">${svg("flag", 18)}<b>Onboarded</b><span>${S.on.prs ? "PRs waiting" : "Not yet"}</span></span>
        <span class="tl-sep"></span><span class="tl-node planned"><span class="tl-dot"></span><span class="tl-v">Next pack</span><span class="tl-s">Delivered as PRs</span></span>`;
    } else {
      S.cn.versions.forEach((x) => {
        const n = repoCount(x.v), total = S.cn.app.repos.length;
        if (x.first) html += `<span class="tl-flag onboard">${svg("flag", 18)}<b>Onboarded</b><span>${S.cn.versions[0].sub}</span></span>`;
        html += `<button class="tl-node ${x.kind === "current" ? "live" : x.kind}" data-ver="${x.v}" ${x.v === sel ? 'aria-current="true"' : ""}><span class="tl-dot"></span><span class="tl-v">${x.label || x.v}</span><span class="tl-s">${x.kind === "building" ? `Update · ${n}/${total} repos` : x.sub}</span></button>`;
      });
      const latest = PACKS.find((x) => x.latest);
      if (!S.cn.versions.find((x) => x.v === latest.v)) html += `<span class="tl-sep"></span><span class="tl-node planned"><span class="tl-dot"></span><span class="tl-v">Next pack</span><span class="tl-s">Not published yet</span></span>`;
    }
    $("#strip").className = "ctxbar strip timeline"; $("#strip").hidden = false;
    $("#strip").innerHTML = `<div class="tl" role="navigation" aria-label="Standards versions">${html}</div>`;
    const curNode = $("#strip [aria-current='true']"), strip = $("#strip");
    if (curNode) { const l = curNode.offsetLeft, r = l + curNode.offsetWidth; if (l < strip.scrollLeft || r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = l - strip.clientWidth / 2 + curNode.offsetWidth / 2; }
  }

  function stepState(p, sel) {
    if (p.p === "onboarding") { const s = S.on.st; return { review: [s.review, { todo: "Not run", active: "Reviewing…", done: `${S.on.app.repos.length} repos reviewed` }[s.review]], standards: [s.standards, { todo: "Not run", active: "Matching…", done: `Pack ${S.on.pack} · 2 profiles` }[s.standards]], agents: [s.agents, { todo: "Not run", active: "Generating…", done: "16 files ready" }[s.agents]], mesh: [s.mesh, { todo: "Not run", active: "Baseline run…", done: S.on.merged ? "First run passed" : S.on.prs ? "PRs open" : "Baseline recorded" }[s.mesh]] }; }
    const x = S.cn.versions.find((v) => v.v === sel), A = S.cn.app, total = A.repos.length;
    if (x.v === "onboard") return { review: ["base", "Initial review"], standards: ["base", "Pack 2026.1"], agents: ["base", "Generated"], mesh: ["base", "Baseline recorded"] };
    if (!isOpen(x)) return { review: ["base", "Reviewed"], standards: ["base", `Pack ${x.v}`], agents: ["base", `${total} repos in sync`], mesh: ["base", "Running on merge"] };
    const n = repoCount(x.v), prs = A.repos.filter((r) => r.pr && r.pr.state === "open").length;
    return { review: ["done", "Changes reviewed"], standards: ["done", `${PACKS.find((k) => k.v === x.v).changes.length} rule changes`], agents: [n === total ? "done" : "active", `${n}/${total} merged · ${prs} PR open`], mesh: [n === total ? "done" : "active", `${A.repos.filter((r) => Object.values(r.mesh).includes("fail")).length} repo with new findings`] };
  }

  function rail(p, sel, view) {
    const st = stepState(p, sel), on = p.p === "onboarding", x = on ? null : S.cn.versions.find((v) => v.v === sel);
    const label = on ? "ONBOARDING · SANDBOX" : x.v === "onboard" ? "ONBOARDING · DONE" : x.kind === "current" ? "ADOPTED · LOCKED" : isOpen(x) ? "STANDARDS UPDATE" : "ADOPTED EARLIER";
    const cardV = on ? `Standards ${S.on.pack}` : x.v === "onboard" ? "Onboarding report" : `Standards ${x.v}`;
    const cardS = on ? `${S.on.app.repos.length} repos · nothing is written until you open PRs` : isOpen(x) ? `${repoCount(x.v)} of ${S.cn.app.repos.length} repos updated` : "Read-only. Updates arrive as a newer pack.";
    $("#rail").innerHTML = `
      <div class="rail-group"><button class="rail-item" data-nav="overview" ${view === "overview" ? 'aria-current="page"' : ""}>${svg("grid")}<span class="ri-t">Overview</span></button></div>
      <div class="rail-ctx"><div class="rail-label">Working on</div><button class="mode-card" data-nav="overview"><span class="mc-l">${svg(on || isOpen(x) ? "branch" : "lock", 14)}${label}</span><span class="mc-v">${cardV}</span><span class="mc-s">${cardS}</span></button></div>
      <div class="journey">${STEPS.map((s) => `<button class="phase ph-${PC[s.id]} st-${st[s.id][0]}" data-nav="${s.id}" ${view === s.id ? 'aria-current="page"' : ""}><span class="node"></span><span class="ph-txt"><span class="ph-name">${s.name}</span><span class="ph-note">${st[s.id][1]}</span></span></button>`).join("")}</div>
      <div class="rail-foot"><button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Project settings</span></button></div>`;
    $("#tabbar").innerHTML = `<button data-nav="overview" ${view === "overview" ? 'aria-current="page"' : ""}>${svg("grid", 22)}<span>Overview</span></button>` + STEPS.map((s) => `<button class="ph-${PC[s.id]} st-${st[s.id][0]}" data-nav="${s.id}" ${view === s.id ? 'aria-current="page"' : ""}><span class="node"></span><span>${s.name}</span></button>`).join("");
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    const p = P(), sel = selected(p), view = p.v || "overview";
    chrome(p, sel); rail(p, sel, view);
    document.body.dataset.view = { review: "define", standards: "design", agents: "build", mesh: "ship" }[view] || "work";
    let html, primary;
    if (view === "settings") [html, primary] = [`${header("Project settings", "Connected project", null)}<section class="card">${more("cset", "Sync rules", `<label class="check"><input type="checkbox" checked> Open update PRs when a new Standards pack is published</label><label class="check"><input type="checkbox" checked> Keep local edits to generated files (merge, never overwrite)</label><label class="check"><input type="checkbox" checked> Block merges only on new findings (baseline ratchet)</label>`, true)}${more("cdisconnect", "Disconnect", `<p class="muted">Removes the link to Pronghorn. The agents and workflow stay in the repos and keep working.</p>`)}</section>`, null];
    else if (p.p === "onboarding") [html, primary] = onboardingView(view, p.t);
    else if (view === "overview") [html, primary] = overviewView(sel);
    else [html, primary] = stepView(view, p.t, sel);
    $("#page").innerHTML = html; $("#mAction").innerHTML = btn(primary); document.body.classList.toggle("has-maction", !!primary);
    const lg = $(".log"); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  const meshDots = (m) => `<span class="mesh-dots" aria-label="Assurance Mesh: ${MESH.map((a) => `${a.name} ${m ? OB.verdictWord[m[a.id]] : "not run"}`).join(", ")}">${MESH.map((a) => `<span class="md md-${a.id} ${m ? m[a.id] : "none"}" title="${a.name}: ${m ? OB.verdictWord[m[a.id]] : "Not run"}">${a.name[0]}</span>`).join("")}</span>`;
  const legend = `<div class="mesh-legend">${MESH.map((a) => `<span><span class="md md-${a.id}">${a.name[0]}</span>${a.name}: ${a.role}</span>`).join("")}</div>`;
  const repoTabs = (repos, t) => tabs([["all", "All repos"], ...repos.map((r) => [r.name, r.name])], repos.some((r) => r.name === t) ? t : "all", "Repositories");
  const filt = (repos, t) => repos.filter((r) => t === "all" || !t || r.name === t || !repos.some((x) => x.name === t));

  /* ------------------------------------------------------------ onboarding */
  function onboardingView(view, t) {
    const O = S.on, A = O.app, done = O.ran;
    let primary = null, next = null, body = "";
    if (view === "overview") {
      primary = !done ? { label: O.running ? "Running in sandbox…" : "Run onboarding in sandbox", act: "run", disabled: O.running } : !O.prs ? { label: `Open ${A.repos.length} pull requests`, act: "openPrs" } : !O.merged ? { label: "Simulate: teams merge the PRs", act: "merge" } : null;
      next = !done ? { title: "Onboarding runs once, in a sandbox", body: "Pronghorn clones the repositories read-only, reviews the code, generates the agents and the Assurance Mesh, and records a baseline. Nothing is written to your repos until you open the pull requests.", icon: "lock" }
        : !O.prs ? { title: "Ready to open pull requests", body: "Each repository gets one PR with the .github agents, skills, the Assurance Mesh workflow and pronghorn.standards.yml. Review the Agents and Mesh steps first if you want.", icon: "branch", tone: "ok" }
        : !O.merged ? { title: "Waiting for the teams to merge", body: "Teams review and merge in their own workflow. The first mesh run on main completes onboarding.", icon: "branch" } : null;
      body = `<section class="card"><div class="card-h"><h2>Repositories</h2><span class="meta">${A.repos.length} connected</span><button class="btn" data-act="noop"><span class="lbl">Add repository</span><span class="progress"></span></button></div>
        <div class="rows">${A.repos.map((r, k) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">${r.ci} today</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">${r.build}</span>${meshDots(O.st.mesh === "done" ? { green: r.baseline.green ? "warn" : "pass", yellow: r.baseline.yellow ? "warn" : "pass", red: "skip", blue: "warn" } : null)}${O.prs ? `<span class="pr-chip ${O.merged ? "merged" : "open"}">PR #${O.prs[k]} · ${O.merged ? "merged" : "open"}</span>` : `<span class="pr-chip none">No PR yet</span>`}</div>`).join("")}</div>${legend}</section>
        <section class="card"><div class="card-h"><h2>Sandbox run</h2><span class="meta">${done ? "finished" : O.running ? "running" : "not started"}</span></div>
          <div class="sandbox"><div class="steps rows">${[["review", "Review the code base"], ["standards", "Match Standards and stack profiles"], ["agents", "Generate agents, skills and tools"], ["mesh", "Configure the Assurance Mesh and run a baseline"]].map(([id, t]) => `<div class="chk ${O.st[id] === "done" ? "pass" : O.st[id] === "active" ? "run" : "todo"}"><span class="st">${O.st[id] === "done" ? svg("check", 14) : ""}</span><span class="lr-t"><b>${t}</b></span><button class="btn quiet" data-nav="${id}"><span class="lbl">View</span></button></div>`).join("")}</div>
          <pre class="log" aria-live="polite">${O.log.join("\n") || '<span class="dim">The log appears here when the run starts.</span>'}</pre></div></section>`;
    } else if (view === "review") {
      next = done ? { title: "Code review finished", body: "Findings feed the generated instructions and the mesh baseline. Nothing is changed in the code.", icon: "check", tone: "ok" } : { title: "Not run yet", body: "Run onboarding from the Overview." };
      body = repoTabs(A.repos, t) + filt(A.repos, t).map((r) => `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2><span class="stack p-${r.profile}">${r.stack}</span></div>
        <div class="kv-grid"><div><span>Build</span><b>${r.build}</b></div><div><span>Tests</span><b>${r.test}</b></div><div><span>CI today</span><b>${r.ci}</b></div><div><span>Profile</span><b>${PROFILES[r.profile]}</b></div></div>
        <div class="rows">${done ? r.review.map((x) => `<div class="lrow"><span class="lr-t"><b>${x}</b></span></div>`).join("") : `<div class="empty small">Findings appear after the sandbox run.</div>`}</div></section>`).join("");
    } else if (view === "standards") {
      next = { title: `Standards pack ${O.pack}`, body: "The latest pack. Each repository is matched to a stack profile. You can record exceptions now or later.", icon: "doc" };
      body = `<section class="card"><div class="card-h"><h2>Stack profiles</h2></div><div class="rows">${A.repos.map((r) => `<div class="lrow"><code>${r.name}</code><span class="lr-t"><span>Detected ${r.stack}</span></span><span class="stack p-${r.profile}">${PROFILES[r.profile]} profile</span></div>`).join("")}</div></section>
        <section class="card"><div class="card-h"><h2>Assurance Mesh agents</h2><span class="meta">Velocity White Paper No. 07</span></div><div class="rows">${MESH.map((a) => `<div class="mesh-agent"><span class="md md-${a.id}">${a.name[0]}</span><span><b>${a.name} · ${a.role}</b><small>${a.kind}. ${a.checks}.</small></span><span class="muted">${a.id === "red" || a.id === "blue" ? "Warn" : "Block"}</span></div>`).join("")}</div>
          <div class="pad form"><label class="f">Test environment URL for Red recon<input id="redUrl" placeholder="https://inspections-test.alberta.ca" value="${esc(O.redUrl)}"></label><p class="muted" style="margin:0">Red scans a running Test environment, never production. Without a URL, Red is skipped and recorded as an exception.</p></div></section>`;
    } else if (view === "agents") {
      next = done ? { title: "Generated from the standard template and each repo's code", body: "Nothing is committed. Files are proposed in one pull request per repository.", icon: "code" } : { title: "Not generated yet", body: "Run onboarding from the Overview." };
      body = repoTabs(A.repos, t) + filt(A.repos, t).map((r) => `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2><span class="meta">${done ? "8 files" : "pending"}</span></div><div class="rows">${done ? generated(r).map(([f, s, d]) => `<div class="tree-file"><span class="tag-new">NEW</span><code>${f}</code><span></span><span class="muted">${d}</span></div>`).join("") : `<div class="empty small">Not generated yet.</div>`}</div>
        ${done ? more("mf-" + r.name, "Preview pronghorn.standards.yml", `<pre class="code">${manifest(r, O.pack)}</pre>`) : ""}</section>`).join("");
    } else {
      next = done ? { title: "Baseline recorded. The mesh blocks only new findings", body: "Existing issues are listed as the baseline so onboarding doesn't stop the team. Each merge to main must not add new ones.", icon: "check", tone: "ok" } : { title: "Not configured yet", body: "Run onboarding from the Overview." };
      body = `<section class="card"><div class="card-h"><h2>When it runs</h2></div><div class="kv-grid"><div><span>Trigger</span><b>Pull request merged into main</b></div><div><span>Workflow</span><b>goa-standards/assurance-mesh@v3</b></div><div><span>Evidence</span><b>Report sent back to Pronghorn</b></div></div></section>`
        + A.repos.map((r) => { const b = r.baseline, tot = b.green + b.yellow + b.blue; return `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2>${done ? meshDots({ green: b.green ? "warn" : "pass", yellow: b.yellow ? "warn" : "pass", red: O.redUrl ? "pass" : "skip", blue: "warn" }) : ""}</div>${done ? `<div class="ratchet"><div><span>Baseline findings</span><b>${tot}</b></div><div><span>Green · Yellow · Blue</span><b>${b.green} · ${b.yellow} · ${b.blue}</b></div><div><span>New findings allowed</span><b class="ok">0</b></div></div>` : `<div class="empty small">No baseline yet.</div>`}</section>`; }).join("");
    }
    return [`${header(`${esc(A.name)} · onboarding`, { overview: "Onboard existing app", review: "Review", standards: "Standards", agents: "Agents", mesh: "Assurance Mesh" }[view], primary)}${banner(next)}${body}`, primary];
  }
  function manifest(r, pack) {
    return `<span class="c"># Managed by Pronghorn. Edit to change policy; Pronghorn opens PRs for new packs.</span>
<span class="k">standards</span>: <span class="s">goa-standards@${pack}</span>
<span class="k">profile</span>: <span class="s">${r.profile}</span>            <span class="c"># ${PROFILES[r.profile]}</span>
<span class="k">build</span>: <span class="s">"${r.build}"</span>
<span class="k">assurance_mesh</span>:
  <span class="k">trigger</span>: <span class="s">merge-to-main</span>
  <span class="k">block_on</span>: [<span class="s">green</span>, <span class="s">yellow</span>]     <span class="c"># new findings only</span>
  <span class="k">warn_on</span>: [<span class="s">red</span>, <span class="s">blue</span>]
  <span class="k">baseline</span>: <span class="s">.pronghorn/baseline.json</span>
  <span class="k">report_to</span>: <span class="s">https://pronghorn.blue/api/v1/mesh</span>`;
  }

  /* -------------------------------------------------------------- connected */
  function overviewView(sel) {
    const A = S.cn.app, latest = S.cn.versions.find((x) => x.kind === "building"), behind = latest ? A.repos.filter((r) => r.sync !== latest.v) : [];
    const failing = A.repos.filter((r) => Object.values(r.mesh).includes("fail"));
    const primary = behind.some((r) => !r.pr) ? { label: `Open update PRs (${behind.filter((r) => !r.pr).length})`, act: "updatePrs" } : { label: "Run mesh on main", act: "runMesh" };
    const next = failing.length ? { title: `${failing[0].name}: new findings after the last merge`, body: A.merges.find((m) => m.verdict === "fail")?.note || "", cta: "Open Mesh", act: "nav", arg: "mesh", icon: "alert", tone: "warn" }
      : latest ? { title: `Standards ${latest.v} is available`, body: `${repoCount(latest.v)} of ${A.repos.length} repositories have merged the update.`, icon: "doc" } : { title: `All repositories follow Standards ${S.cn.versions.find((x) => x.kind === "current").v}`, icon: "check", tone: "ok" };
    const body = `<section class="card"><div class="card-h"><h2>Repositories</h2><span class="meta">${A.owner}</span></div>
      <div class="rows">${A.repos.map((r) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">Standards ${r.sync}</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">${r.build}</span>${meshDots(r.mesh)}${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n} · ${r.pr.state}</span>` : `<span class="pr-chip none">${latest && r.sync !== latest.v ? "Update not opened" : "In sync"}</span>`}</div>`).join("")}</div>${legend}</section>
      <section class="card"><div class="card-h"><h2>Recent merges to main</h2><span class="meta">mesh runs</span></div><div class="rows">${A.merges.slice().reverse().map((m) => `<div class="lrow"><span class="pr-chip">#${m.pr}</span><span class="lr-t"><b>${m.repo}</b><span>${m.when}${m.note ? " · " + m.note : ""}</span></span><span class="delta ${m.verdict === "pass" ? "delta-new" : m.verdict === "fail" ? "delta-regression" : "delta-changed"}">${OB.verdictWord[m.verdict]}</span></div>`).join("") || `<div class="empty small">The first merge to main will show here.</div>`}</div></section>`;
    return [`${header(`${esc(A.name)} · connected`, "Overview", primary)}${banner(next)}${body}`, primary];
  }

  function stepView(view, t, sel) {
    const A = S.cn.app, x = S.cn.versions.find((v) => v.v === sel), open = isOpen(x), pack = PACKS.find((k) => k.v === sel);
    let primary = null, next = open ? null : { title: x.v === "onboard" ? "Onboarding report" : `Standards ${sel} is adopted and read-only`, body: x.v === "onboard" ? "What the first sandbox run found and generated." : "Select the update on the timeline to work on the next pack.", icon: "lock", tone: "lock" };
    let body = "";
    if (view === "review") {
      if (open) { primary = { label: "Re-run review in sandbox", act: "noop" }; next = { title: `What changed in the code since ${S.cn.versions.find((v) => v.kind === "current").v}`, body: "A short review before regenerating agents, so instructions match the code as it is now.", icon: "search" }; }
      body = repoTabs(A.repos, t) + filt(A.repos, t).map((r) => `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2><span class="stack p-${r.profile}">${r.stack}</span></div><div class="rows">${(open ? { "permits-api": ["2 new endpoints in InspectionController", "EF Core 8.0.8 → 8.0.10"], "permits-web": ["4 new screens", "New dependency: axios 1.7"], "permits-batch": ["No changes since last review"] }[r.name] || ["Reviewed"] : ["3 layers detected", `${r.baseline} findings recorded as baseline`]).map((s) => `<div class="lrow"><span class="lr-t"><b>${s}</b></span></div>`).join("")}</div></section>`).join("");
    } else if (view === "standards") {
      if (open) { primary = { label: "Request exception", act: "noop" }; next = { title: `What's new in Standards ${sel}`, body: pack.notes, icon: "doc" }; }
      body = (pack && pack.changes ? `<section class="card"><div class="card-h"><h2>Changes in ${sel}</h2></div><div class="rows">${pack.changes.map(([k, d, a]) => `<div class="lrow"><span class="delta delta-${k === "New" ? "new" : "changed"}">${k}</span><span class="lr-t"><b>${d}</b></span>${MESH.find((m) => m.id === a) ? `<span class="md md-${a}">${a[0].toUpperCase()}</span>` : ""}</div>`).join("")}</div></section>` : `<section class="card"><div class="card-h"><h2>Standards ${sel}</h2></div><div class="pad muted">${pack ? pack.notes : ""}</div></section>`)
        + `<section class="card"><div class="card-h"><h2>Exceptions</h2><span class="meta">${A.exceptions.length}</span></div><div class="rows">${A.exceptions.map((e) => `<div class="lrow"><code>${e.repo}</code><span class="lr-t"><b>${e.rule}</b><span>${e.why}</span></span><span class="muted">until ${e.until}</span></div>`).join("") || `<div class="empty small">No exceptions.</div>`}</div></section>`;
    } else if (view === "agents") {
      const repos = filt(A.repos, t);
      if (open) { const pending = A.repos.filter((r) => r.sync !== sel && !r.pr); primary = pending.length ? { label: `Open update PRs (${pending.length})`, act: "updatePrs" } : null; next = { title: "Updates are merged with local edits, never overwritten", body: "If a team changed a generated file, the PR keeps their edit and shows the standard change next to it.", icon: "code" }; }
      body = repoTabs(A.repos, t) + repos.map((r) => `<section class="card"><div class="card-h"><h2><code>${r.name}</code></h2>${r.pr ? `<span class="pr-chip ${r.pr.state}">PR #${r.pr.n} · ${r.pr.state}</span>` : ""}</div><div class="rows">${generated(r).map(([f, , d], k) => { const tag = open ? (k === 3 || k === 6 ? "upd" : "same") : "new"; return `<div class="tree-file"><span class="tag-${tag}">${{ upd: "UPDATED", same: "SAME", new: "NEW" }[tag]}</span><code>${f}</code><span></span><span class="muted">${tag === "upd" ? (k === 3 ? "Testing agent v2" : "Mesh workflow uses the 2026 Alberta rules") : d}</span></div>`; }).join("")}</div></section>`).join("");
    } else {
      if (open) { primary = { label: "Run mesh on main", act: "runMesh" }; next = { title: "The mesh runs after every merge into main", body: "Green and Yellow block on new findings. Red and Blue report warnings. Results are kept as evidence for each merge.", icon: "check" }; }
      body = `<section class="card"><div class="card-h"><h2>Latest result on main</h2></div><div class="rows">${A.repos.map((r) => `<div class="repo-row"><span><code>${r.name}</code><br><span class="muted">ASVS L2: ${r.asvs}/285</span></span><span class="stack p-${r.profile}">${r.stack}</span><span class="muted">baseline ${r.baseline} · new ${r.newFindings}</span>${meshDots(r.mesh)}<span class="delta ${r.newFindings ? "delta-regression" : "delta-new"}">${r.newFindings ? r.newFindings + " new" : "No new findings"}</span></div>`).join("")}</div>${legend}</section>
        <section class="card"><div class="card-h"><h2>Mesh agents</h2></div><div class="rows">${MESH.map((a) => `<div class="mesh-agent"><span class="md md-${a.id}">${a.name[0]}</span><span><b>${a.name} · ${a.role}</b><small>${a.checks}</small></span><span class="muted">${a.id === "green" || a.id === "yellow" ? "Blocks" : "Warns"}</span></div>`).join("")}</div></section>`;
    }
    const title = { review: "Review", standards: "Standards", agents: "Agents", mesh: "Assurance Mesh" }[view];
    return [`${header(`${esc(A.name)} · ${x.v === "onboard" ? "onboarding" : "Standards " + sel}`, title, primary)}${banner(next)}${body}`, primary];
  }

  /* ----------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const demo = t.closest("[data-demo]"); if (demo) { if (demo.dataset.demo === "building") S.on = onboardingState(); else S.cn = connectedState(false); return go({ p: demo.dataset.demo === "building" ? "onboarding" : "connected", r: "", v: "", t: "" }); }
    const vb = t.closest("[data-ver]"); if (vb) return go({ r: vb.dataset.ver });
    const nav = t.closest("[data-nav]"); if (nav) return go({ v: nav.dataset.nav, t: "" });
    const tl = t.closest("[data-tool]"); if (tl) return go({ t: tl.dataset.tool });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });
  document.addEventListener("input", (e) => { if (e.target.id === "redUrl") S.on.redUrl = e.target.value; });

  function act(name, arg, el) {
    const O = S.on, A = S.cn.app;
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "nav": return go({ v: arg });
      case "run": {
        O.running = true; O.log = []; render();
        const L = (s) => { O.log.push(s); const lg = $(".log"); if (lg) { lg.innerHTML = O.log.join("\n"); lg.scrollTop = lg.scrollHeight; } };
        const script = [
          ["review", `<span class="dim">$</span> sandbox create --read-only --network=egress-deny`],
          ["review", ...O.app.repos.map((r) => `clone ${r.name} <span class="ok">ok</span> · detected ${r.stack} · build: ${r.build}`)],
          ["review", `review: ${O.app.repos.map((r) => r.review.length + " notes on " + r.name).join(", ")}`],
          ["standards", `match pack goa-standards@${O.pack} · profiles: ${O.app.repos.map((r) => PROFILES[r.profile]).join(", ")}`],
          ["agents", ...O.app.repos.map((r) => `generate .github for ${r.name}: 3 agents, 1 instructions file, 1 skill, mesh workflow, manifest <span class="ok">ok</span>`)],
          ["mesh", ...O.app.repos.map((r) => `baseline mesh on ${r.name}: green ${r.baseline.green}, yellow ${r.baseline.yellow}, blue ${r.baseline.blue}${O.redUrl ? ", red ok" : ` <span class="warn">red skipped (no Test URL)</span>`}`)],
          ["mesh", `<span class="ok">done</span> · nothing written to the repositories`],
        ].flatMap(([ph, ...lines]) => lines.map((l) => [ph, l]));
        let k = 0;
        const tick = () => {
          if (k >= script.length) { STEPS.forEach((s) => (O.st[s.id] = "done")); O.running = false; O.ran = true; notify("Onboarding run finished in the sandbox", null); return render(); }
          const [ph, line] = script[k++];
          STEPS.forEach((s) => { if (s.id === ph) O.st[s.id] = "active"; else if (STEPS.findIndex((x) => x.id === s.id) < STEPS.findIndex((x) => x.id === ph)) O.st[s.id] = "done"; });
          L(line); rail(P(), "onboard", P().v || "overview"); chrome(P(), "onboard");
          setTimeout(tick, 450);
        };
        return tick();
      }
      case "openPrs": return runButton(el, 900, "Opened", () => { O.prs = O.app.repos.map((r, k) => 120 + k * 7); notify(`Opened ${O.prs.length} pull requests`, () => { O.prs = null; }); render(); });
      case "merge": return runButton(el, 1200, "Merged", () => { O.merged = true; render(); setTimeout(() => { S.cn = connectedState(true); notify(`${O.app.name} is onboarded. The first mesh run on main finished`, null); go({ p: "connected", r: "", v: "overview" }); }, 700); });
      case "updatePrs": return runButton(el, 800, "Opened", () => { let n = 300; const opened = []; A.repos.forEach((r) => { if (r.sync !== "2026.3" && !r.pr) { r.pr = { n: n++, state: "open" }; opened.push(r); } }); notify(`Opened ${opened.length} update PRs`, () => opened.forEach((r) => (r.pr = null))); render(); });
      case "runMesh": return runButton(el, 1400, "Finished", () => { A.merges.push({ pr: "manual", repo: "all repos", when: "just now", verdict: A.repos.some((r) => r.newFindings) ? "fail" : "pass", note: "Run on demand" }); render(); });
    }
  }

  render();
})();

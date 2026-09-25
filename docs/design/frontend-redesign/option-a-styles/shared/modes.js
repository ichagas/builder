/*
 * Approach 2 · Two modes: Build mode → Evolve mode
 *
 * Before the first release the project IS the build: the rail is the four
 * phases with progress, and the agent commits straight to main.
 * The first release is an explicit milestone. After it the project switches
 * to Evolve mode: the rail becomes Changes / Releases / Baseline, the system
 * is locked as the released baseline, and the four phases move inside each
 * change (bug, enhancement, feature) as a stepper.
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, PHASES, TYPES, btn, typeChip, track, banner, more, header, tabs, confirmStep, runButton, notify, afterUndo, openSheet, closeSheet } = PK;
  PK.shell();

  /* ------------------------------------------------------------------ data */
  function buildState() {
    return {
      target: "v1.0.0",
      reqs: [
        { epic: "Applicant can apply online", stories: [["Answer 5 screening questions", true], ["See why I'm not eligible", true], ["Upload ID from my phone", false], ["Get a confirmation email", true]] },
        { epic: "Caseworker triage queue", stories: [["Queue ordered by priority score", true], ["Assign an application", false], ["Request more documents", false]] },
        { epic: "Bilingual service", stories: [["Switch the interface to French", true], ["Receive emails in my language", true]] },
      ],
      agent: { live: true, pct: 34, detail: "Generating the caseworker queue page" },
      staged: [{ p: "src/pages/Queue.tsx", op: "a", s: "+188" }, { p: "src/api/queue.ts", op: "a", s: "+64" }, { p: "db/migrations/003_queue.sql", op: "a", s: "+19" }],
      commits: 42,
      checks: [
        { id: "criteria", t: "Every story has acceptance criteria", d: "3 stories are missing criteria", ok: false, fix: "Draft with AI" },
        { id: "audit", t: "Audit covers at least 90% of requirements", d: "Coverage is 84%", ok: false, fix: "Run audit" },
        { id: "tests", t: "All tests pass on main", d: "212 passing", ok: true },
        { id: "security", t: "Security scan has no high findings", d: "0 high, 2 low", ok: true },
        { id: "test-env", t: "The Test environment runs the latest build", d: "a3f91c2 deployed 2h ago", ok: true },
        { id: "signoff", t: "Product owner signs off", d: "Waiting for Igor", ok: false, fix: "Sign off" },
      ],
    };
  }
  function evolveState(fresh) {
    if (fresh) return { version: "v1.0.0", next: "v1.1.0", released: "just now", seq: 1, items: [], history: [{ v: "v1.0.0", when: "just now", n: "First release" }] };
    return {
      version: "v1.4.2", next: "v1.5.0", released: "6 days ago", seq: 48,
      items: [
        { id: "WI-47", type: "bug", title: "Confirmation email shows the wrong submission date", status: "triage", source: "Reported by the test team", evidence: "Dates are shown in UTC. Applicants in Alberta see tomorrow's date after 5 pm." },
        { id: "WI-45", type: "enhancement", title: "Show the eligibility result faster", status: "triage", source: "Requested by the caseworker lead", evidence: "Applicants wait about 3 seconds for the result. The target in the spec is under 1 second." },
        { id: "WI-42", type: "bug", title: "Photo upload fails for iPhone HEIC images", sev: "High", status: "active", source: "Reported by the help desk",
          ph: { define: "done", design: "skipped", build: "active", ship: "todo" }, note: { define: "Reproduced", design: "Skipped for bug", build: "Agent fixing", ship: "Not started" },
          branch: "fix/wi-42-heic", reqs: [["S3", "As an applicant I upload ID from my phone", "Regression", "HEIC photos convert to JPEG and upload"]], comps: ["docs", "api"],
          staged: [{ p: "src/api/upload.ts", op: "m", s: "+24 −3" }], tests: [["converts HEIC photos to JPEG", "pending"], ["rejects files over 10 MB", "pass"]],
          run: { pct: 48, live: true, detail: "Adding HEIC conversion to the upload handler" },
          bug: { steps: ["Open Apply on an iPhone", "Choose a photo from the library", "Select Upload"], expected: "The photo uploads and shows a preview", actual: "“File type not supported”" } },
        { id: "WI-40", type: "bug", title: "Caseworker queue sorts by name, not priority", sev: "Medium", status: "active", source: "Reported by the caseworker team",
          ph: { define: "done", design: "skipped", build: "done", ship: "active" }, note: { define: "Done", design: "Skipped for bug", build: "Reviewed", ship: "Preview ready" },
          branch: "fix/wi-40-queue-sort", reqs: [["F3", "Priority scoring", "Regression", "Queue is ordered by priority score, then date"]], comps: ["case"], staged: [], tests: [["queue orders by priority score", "pass"]] },
        { id: "WI-38", type: "feature", title: "Applicants can save a draft and return later", status: "active", source: "Requested by the program area",
          ph: { define: "done", design: "active", build: "todo", ship: "todo" }, note: { define: "3 new stories", design: "1 component to add", build: "Waiting on design", ship: "Not started" },
          branch: "feat/wi-38-drafts", reqs: [["S5", "As an applicant I save my application as a draft", "New"], ["S6", "As an applicant I resume a draft from a link in my email", "New"], ["S7", "Drafts are deleted after 30 days", "New"], ["S1", "As an applicant I answer 5 screening questions", "Changed"]],
          comps: ["web", "api", "drafts"], newComp: "drafts", staged: [], tests: [] },
        { id: "WI-36", type: "feature", title: "French language support", status: "shipped", shippedIn: "v1.4.2", source: "Ministry request", ph: { define: "done", design: "done", build: "done", ship: "done" }, note: {} },
      ],
      history: [{ v: "v1.4.2", when: "6 days ago", n: "French language support, 2 fixes" }, { v: "v1.4.1", when: "3 weeks ago", n: "3 fixes" }, { v: "v1.4.0", when: "5 weeks ago", n: "Document upload" }, { v: "v1.0.0", when: "4 months ago", n: "First release" }],
    };
  }
  const NODES = [
    { id: "web", name: "Applicant web", kind: "React", x: 4, y: 10, mx: 3, my: 5 }, { id: "case", name: "Caseworker app", kind: "React", x: 64, y: 10, mx: 52, my: 5 },
    { id: "api", name: "Intake API", kind: "Express", x: 34, y: 42, mx: 27, my: 36 }, { id: "db", name: "Applicants DB", kind: "Postgres", x: 6, y: 76, mx: 3, my: 66 },
    { id: "docs", name: "Document store", kind: "Azure Blob", x: 62, y: 76, mx: 52, my: 66 }, { id: "drafts", name: "Draft store", kind: "Postgres table", x: 36, y: 80, mx: 27, my: 84, proposed: true },
  ];
  const EDGES = [["web", "api"], ["case", "api"], ["api", "db"], ["api", "docs"], ["api", "drafts"]];
  const S = { build: buildState(), evolve: evolveState(false) };

  /* --------------------------------------------------------------- routing */
  function P() { const h = PK.hashParams(); return { p: h.p === "building" ? "building" : "evolve", v: h.v || "", t: h.t || "", w: h.w || "", s: h.s || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  /* ----------------------------------------------------------------- shell */
  function renderChrome(p) {
    const building = p.p === "building";
    document.body.classList.toggle("is-building", building);
    document.body.classList.toggle("is-live", !building);
    $$("[data-demo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.demo === (building ? "building" : "evolve"))));
    const B = S.build, E = S.evolve;
    $("#modeBadge").innerHTML = building
      ? `<span class="dot"></span><span class="mb-long">Build mode · before first release</span><span class="mb-short">Building</span>`
      : `<span class="dot"></span><span class="mb-long">Evolve mode · released </span><b>${E.version}</b>`;
    const run = building ? (B.agent.live ? B.agent : null) : (E.items.find((i) => i.run && i.run.live) || {}).run;
    $("#pillA").innerHTML = run ? `<span class="dot run"></span>${building ? "Agent" : E.items.find((i) => i.run && i.run.live).id + " agent"} · ${run.pct}%` : `<span class="dot ok"></span>Agents idle`;
    $("#pillA").dataset.go = building ? "build" : run ? "item:" + E.items.find((i) => i.run && i.run.live).id : "";
  }

  function renderRail(p, view) {
    const building = p.p === "building";
    const foot = `<div class="rail-foot"><button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Project settings</span></button></div>`;
    if (building) {
      const B = S.build, ready = B.checks.filter((c) => c.ok).length, st = buildPhases();
      $("#rail").innerHTML = `
        <button class="mode-card" data-nav="ship" data-tool="release"><span class="mc-l">${svg("flag", 14)}BUILD MODE</span><span class="mc-v">Building ${B.target}</span><span class="mc-s">Ready to release: ${ready} of ${B.checks.length} checks</span><span class="meter"><i style="width:${(ready / B.checks.length) * 100}%"></i></span></button>
        <div class="journey">${PHASES.map((ph) => `<button class="phase ph-${ph.id} st-${st[ph.id][0]}" data-nav="${ph.id}" ${view === ph.id ? 'aria-current="page"' : ""}><span class="node"></span><span class="ph-txt"><span class="ph-name">${ph.name}</span><span class="ph-note">${st[ph.id][1]}</span></span></button>`).join("")}</div>${foot}`;
      $("#tabbar").innerHTML = PHASES.map((ph) => `<button class="ph-${ph.id} st-${st[ph.id][0]}" data-nav="${ph.id}" ${view === ph.id ? 'aria-current="page"' : ""}><span class="node"></span><span>${ph.name}</span></button>`).join("") + `<button data-nav="settings" ${view === "settings" ? 'aria-current="page"' : ""}>${svg("gear", 22)}<span>More</span></button>`;
      return;
    }
    const E = S.evolve, open = E.items.filter((i) => i.status !== "shipped").length, triage = E.items.filter((i) => i.status === "triage").length;
    const item = (id, icon, label, extra) => `<button class="rail-item" data-nav="${id}" ${view === id ? 'aria-current="page"' : ""}>${svg(icon)}<span class="ri-t">${label}</span>${extra || ""}</button>`;
    $("#rail").innerHTML = `
      <button class="mode-card" data-nav="changes"><span class="mc-l">${svg("branch", 14)}EVOLVE MODE</span><span class="mc-v">${E.version} released</span><span class="mc-s">${E.released} · next is ${E.next}</span></button>
      <div class="rail-group">
        ${item("changes", "work", "Changes", open ? `<span class="n ${triage ? "warn" : ""}">${open}</span>` : "")}
        ${item("releases", "tag", "Releases", `<small>${E.next}</small>`)}
      </div>
      <div class="rail-group">
        <div class="rail-label">Baseline · ${E.version} · locked</div>
        ${[["requirements", "doc", "Requirements"], ["architecture", "canvas", "Architecture"], ["code", "code", "Code"], ["data", "db", "Data"]].map(([t, ic, l]) => `<button class="rail-item" data-nav="baseline" data-tool="${t}" ${view === "baseline" && (p.t || "requirements") === t ? 'aria-current="page"' : ""}>${svg(ic)}<span class="ri-t">${l}</span><span class="lk">${svg("lock", 14)}</span></button>`).join("")}
      </div>${foot}`;
    $("#tabbar").innerHTML = [["changes", "work", "Changes"], ["releases", "tag", "Releases"], ["baseline", "lock", "Baseline"], ["settings", "gear", "More"]].map(([id, ic, l]) => `<button data-nav="${id}" ${view === id ? 'aria-current="page"' : ""}>${svg(ic, 22)}<span>${l}</span></button>`).join("");
    $("#tabbar").style.gridTemplateColumns = "repeat(4, 1fr)";
  }

  function buildPhases() {
    const B = S.build, missing = B.reqs.flatMap((e) => e.stories).filter((s) => !s[1]).length, total = B.reqs.flatMap((e) => e.stories).length;
    const ready = B.checks.filter((c) => c.ok).length;
    return {
      define: [missing ? "active" : "done", `${total - missing}/${total} have criteria`],
      design: ["done", "5 components"],
      build: [B.agent.live || B.staged.length ? "active" : "done", B.agent.live ? `Agent ${B.agent.pct}%` : B.staged.length ? `${B.staged.length} files staged` : `${B.commits} commits on main`],
      ship: [ready === B.checks.length ? "active" : "todo", `${ready}/${B.checks.length} release checks`],
    };
  }

  /* ----------------------------------------------------------------- render */
  function render() {
    const p = P();
    const building = p.p === "building";
    let view = p.v || (building ? "build" : "changes");
    if (!building && p.w && !S.evolve.items.find((i) => i.id === p.w)) return go({ w: "" });
    renderChrome(p); renderRail(p, p.w ? "changes" : view);
    if (building) { $("#tabbar").style.gridTemplateColumns = ""; }
    document.body.dataset.view = building ? view : ({ changes: "work", releases: "ship", baseline: "define" }[view] || "work");
    let html, primary;
    if (view === "settings") [html, primary] = settingsView(building);
    else if (building) [html, primary] = buildView(view, p.t);
    else if (p.w) [html, primary] = itemView(S.evolve.items.find((i) => i.id === p.w), p.t);
    else [html, primary] = ({ changes: changesView, releases: releasesView, baseline: baselineView }[view] || changesView)(p);
    $("#page").innerHTML = html;
    $("#mAction").innerHTML = btn(primary);
    document.body.classList.toggle("has-maction", !!primary);
    drawEdges();
  }

  /* ----------------------------------------------------- Build mode pages */
  const BUILD_TOOLS = {
    define: [["requirements", "Requirements"], ["standards", "Standards"], ["artifacts", "Artifacts"], ["chat", "Chat"]],
    design: [["canvas", "Canvas"], ["specifications", "Specifications"]],
    build: [["agent", "Agent"], ["repository", "Repository"], ["database", "Database"]],
    ship: [["release", "First release"], ["environments", "Environments"], ["audit", "Audit"]],
  };
  function buildView(view, tool) {
    const B = S.build, list = BUILD_TOOLS[view] || BUILD_TOOLS.build, t = list.some((x) => x[0] === tool) ? tool : list[0][0];
    const name = list.find((x) => x[0] === t)[1], phase = PHASES.find((x) => x.id === view).name;
    const missing = B.reqs.flatMap((e) => e.stories).filter((s) => !s[1]).length;
    const ready = B.checks.every((c) => c.ok);
    let primary = null, next = null, body = "";
    if (t === "requirements") {
      primary = { label: "Add requirement", act: "noop" };
      next = missing ? { title: `${missing} stories need acceptance criteria`, body: "The agent turns criteria into tests. Stories without criteria get generic tests.", cta: "Draft with AI", act: "fixCheck", arg: "criteria" } : { title: "Every story has acceptance criteria", body: "Requirements are ready for the first release.", icon: "check", tone: "ok" };
      body = `<section class="card"><div class="card-h"><h2>Requirement tree</h2><span class="meta">${B.reqs.flatMap((e) => e.stories).length} stories</span></div>${B.reqs.map((e, k) => more("b-epic-" + k, `<span class="kind">Epic</span><b>${e.epic}</b><span class="meta">${e.stories.length}</span>`, `<div class="rows">${e.stories.map(([s, ok]) => `<div class="lrow"><span class="lr-t"><b>${s}</b></span><span class="delta ${ok ? "delta-new" : "delta-changed"}">${ok ? "Criteria set" : "Needs criteria"}</span></div>`).join("")}</div>`, k === 0)).join("")}</section>`;
    } else if (t === "canvas") {
      primary = { label: "Regenerate with AI", act: "noop" };
      next = { title: "Everything here is editable", body: "Before the first release there is no locked baseline. You change the design directly." };
      body = canvas(null);
    } else if (t === "agent") {
      primary = { label: "Commit to main", act: "commitMain", disabled: !B.staged.length, why: "Nothing staged" };
      next = { title: "Before the first release, the agent works on main", body: "Once you release, main is locked as the baseline and every change gets its own branch.", icon: "branch" };
      body = `<section class="card"><div class="card-h"><h2>${svg("branch", 16)} main</h2><span class="meta">${B.commits} commits · unprotected until release</span></div>
        ${B.agent.live ? `<div class="agent-run"><span class="dot run"></span><span class="lr-t"><b>Build agent</b><span id="runDetail">${B.agent.detail}</span></span><span class="run-pct" id="runPct">${B.agent.pct}%</span><span class="meter"><i id="runMeter" style="width:${B.agent.pct}%"></i></span></div>` : ""}
        <div class="sub-h">Staged changes</div><div class="rows">${B.staged.length ? B.staged.map((f) => `<div class="file"><span class="op op-${f.op}">${f.op.toUpperCase()}</span><code>${f.p}</code><span class="diffstat">${f.s}</span></div>`).join("") : `<div class="empty small">Nothing staged.</div>`}</div></section>`;
    } else if (t === "release") {
      primary = { label: `Release ${B.target}`, act: "firstRelease", icon: "flag", disabled: !ready, why: "Complete every release check first" };
      next = ready ? { title: `${B.target} is ready`, body: "Releasing tags the version, deploys it with your deployment settings, locks the baseline and switches the project to Evolve mode.", icon: "flag", tone: "ok" } : { title: "Complete the release checks", body: "The first release turns this build into a baseline. Everything after it is a change.", icon: "flag" };
      body = `<section class="card" id="releaseCard"><div class="card-h"><h2>Release checks for ${B.target}</h2><span class="meta">${B.checks.filter((c) => c.ok).length}/${B.checks.length}</span></div>
        <div class="rows">${B.checks.map((c) => `<div class="chk ${c.ok ? "pass" : "fail"}" id="chk-${c.id}"><span class="st">${c.ok ? svg("check", 14) : "!"}</span><span class="lr-t"><b>${c.t}</b><span>${c.d}</span></span>${c.ok ? "" : `<button class="btn" data-act="fixCheck" data-arg="${c.id}"><span class="lbl">${c.fix}</span><span class="progress"></span></button>`}</div>`).join("")}</div>
        ${more("what-release", "What happens when you release", `<ol class="plain"><li>main is merged and tagged <b>${B.target}</b>.</li><li>The Deploy settings you already configured publish it.</li><li>Requirements, architecture, code and data are locked as the <b>baseline</b>.</li><li>The project switches to Evolve mode. Bugs, enhancements and features each get a branch.</li></ol>`, true)}</section>`;
    } else {
      body = `<section class="card empty"><b>${name} goes here</b><span>The existing page mounts inside the shell unchanged.</span></section>`;
    }
    return [`${header(`Build mode · ${phase}`, name, primary)}${tabs(list, t, phase + " tools")}${banner(next)}${body}`, primary];
  }

  /* ---------------------------------------------------- Evolve mode pages */
  function changesView(p) {
    const E = S.evolve;
    const groups = [["Needs triage", "triage"], ["In progress", "active"], [`In release ${E.next}`, "release"], ["Shipped", "shipped"]].map(([n, k]) => [n, E.items.filter((i) => k === "release" ? i.status === "active" && i.release === E.next : k === "active" ? i.status === "active" && i.release !== E.next : i.status === k)]);
    const triage = groups[0][1];
    const next = E.items.length === 0 ? { title: `${E.version} is released. What's next?`, body: "From now on every change is a bug fix, an enhancement or a feature, with its own branch and preview.", cta: "New change", act: "newChange", icon: "branch", tone: "ok" }
      : triage.length ? { title: `${triage.length} requests need triage`, body: "Accepting a request creates its branch and starts it in Define.", cta: "Review the first", act: "openTriage", arg: triage[0].id } : null;
    const html = `${header(`Evolve mode · ${E.version} released`, "Changes", null)}${banner(next)}
      ${groups.filter((g) => g[1].length).map(([n, list]) => `<section class="card"><div class="card-h"><h2>${n}</h2><span class="meta">${list.length}</span></div><div class="rows">${list.map((i) => row(i, p)).join("")}</div></section>`).join("")}
      ${E.items.length ? "" : `<section class="card empty"><div class="empty-cta"><b>No changes yet</b><span>Report a bug or request an enhancement to start.</span></div></section>`}`;
    return [html, { label: "New change", act: "newChange" }];
  }
  function row(i, p) {
    if (i.status === "triage") {
      const open = p.s === i.id;
      return `<div class="wi wi-triage ${i.fresh ? "fresh" : ""}"><button class="wi-main" data-toggle="${i.id}" aria-expanded="${open}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="wi-t"><b>${esc(i.title)}</b><span>${esc(i.source)}</span></span>${track(null)}<span class="wi-go">${svg("down", 16)}</span></button>
        ${open ? `<div class="wi-more"><p>${esc(i.evidence)}</p><div class="wi-acts"><button class="btn primary" data-act="accept" data-arg="${i.id}"><span class="lbl">Accept as ${TYPES[i.type].label.toLowerCase()}</span><span class="progress"></span></button><button class="btn quiet" data-act="decline" data-arg="${i.id}"><span class="lbl">Decline</span></button></div></div>` : ""}</div>`;
    }
    const cur = PHASES.find((x) => i.ph[x.id] === "active");
    const status = i.status === "shipped" ? `Shipped in ${i.shippedIn}` : i.release ? `Ready · ${i.release}` : cur ? `${cur.name}: ${i.note[cur.id]}` : "";
    return `<div class="wi ${i.fresh ? "fresh" : ""}"><button class="wi-main" data-item="${i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="wi-t"><b>${esc(i.title)}</b><span>${esc(i.source)}${i.sev ? ` · ${i.sev} severity` : ""}</span></span>${track(i.ph)}<span class="wi-status">${status}</span><span class="wi-go">${svg("chev", 16)}</span></button></div>`;
  }

  function itemView(it, step) {
    const E = S.evolve;
    const cur = PHASES.find((x) => it.ph[x.id] === "active");
    const s = PHASES.some((x) => x.id === step) ? step : cur ? cur.id : "ship";
    const st = it.ph[s];
    document.body.dataset.view = s;
    const stepper = `<nav class="stepper" aria-label="Steps for ${it.id}">${PHASES.map((ph) => `<button class="step ph-${ph.id} st-${it.ph[ph.id]}" data-tool="${ph.id}" ${ph.id === s ? 'aria-current="step"' : ""}><span class="node"></span><span><b>${ph.name}</b><small>${it.note[ph.id] || ""}</small></span></button>`).join("")}</nav>`;
    let primary = null, next = null, body = "";
    if (it.status === "shipped") next = { title: `Shipped in ${it.shippedIn}`, body: "It's part of the baseline now. Start a new change to alter it.", icon: "check", tone: "ok" };
    if (s === "define") {
      if (it.status !== "shipped") { primary = st === "done" ? null : { label: "Mark definition ready", act: "stepDone", arg: "define" }; next = st === "done" ? { title: "Defined. The agent will use these criteria as tests", body: "", cta: `Go to ${it.ph.design === "skipped" ? "Build" : "Design"}`, act: "step", arg: it.ph.design === "skipped" ? "build" : "design", icon: "check", tone: "ok" } : { title: "Describe what changes", body: "Only requirements this change touches are listed. The rest of the baseline stays collapsed." }; }
      body = (it.bug ? `<section class="card"><div class="card-h"><h2>Bug report</h2><span class="meta">found in ${E.version}</span></div><div class="pad"><div class="kv"><span>Steps</span><ol>${it.bug.steps.map((x) => `<li>${x}</li>`).join("")}</ol></div><div class="kv"><span>Expected</span><p>${it.bug.expected}</p></div><div class="kv"><span>Actual</span><p>${it.bug.actual}</p></div></div></section>` : "")
        + `<section class="card"><div class="card-h"><h2>${it.bug ? "Affected requirements" : "Requirement changes"}</h2><span class="meta">compared with ${E.version}</span></div><div class="rows">${(it.reqs || []).map(([id, t, d, c]) => `<div class="lrow"><span class="rid">${id}</span><span class="lr-t"><b>${esc(t)}</b>${c ? `<span>New criterion: ${c}</span>` : ""}</span><span class="delta delta-${d.toLowerCase()}">${d}</span></div>`).join("") || `<div class="empty small">The agent is drafting the requirement changes.</div>`}</div>${more("unchanged", `${18 - (it.reqs || []).filter((r) => r[2] !== "New").length} unchanged requirements`, `<p class="muted">Collapsed. Open Baseline → Requirements to browse them.</p>`)}</section>`;
    } else if (s === "design") {
      if (st === "skipped") { primary = { label: "Add a design step", act: "unskip" }; next = { title: "Bugs skip design by default", body: "Add a design step if the fix changes how components connect." }; }
      else if (st === "active") { primary = { label: "Approve design", act: "stepDone", arg: "design" }; next = { title: `${it.comps.length} components affected, 1 new`, body: "Highlighted nodes change in this item. Everything else is the locked baseline." }; }
      else if (st === "todo") next = { title: "Design starts after Define" };
      body = canvas(it);
    } else if (s === "build") {
      if (st === "active") { primary = { label: "Send for review", act: "stepDone", arg: "build", disabled: it.run && it.run.live, why: "Wait for the agent to finish" }; next = it.run && it.run.live ? { title: `The agent is working on ${it.branch}`, body: "Progress stays in the pill at the top, so you can leave this page.", icon: "branch" } : { title: "Review the changes", body: "Send for review when the tests pass. A preview environment is created.", icon: "check", tone: "ok" }; }
      else if (st === "todo") next = { title: "Build hasn't started", body: `The agent starts on ${it.branch} after ${it.ph.design === "active" ? "design is approved" : "definition is ready"}. It never commits to main.`, icon: "branch" };
      body = st === "todo" ? "" : `<section class="card"><div class="card-h"><h2>${svg("branch", 16)} ${it.branch}</h2><span class="meta">from ${E.version}</span></div>
        ${it.run && it.run.live ? `<div class="agent-run"><span class="dot run"></span><span class="lr-t"><b>Build agent</b><span id="runDetail">${it.run.detail}</span></span><span class="run-pct" id="runPct">${it.run.pct}%</span><span class="meter"><i id="runMeter" style="width:${it.run.pct}%"></i></span></div>` : ""}
        <div class="sub-h">Staged changes</div><div class="rows">${it.staged.length ? it.staged.map((f) => `<div class="file ${f.fresh ? "fresh" : ""}"><span class="op op-${f.op}">${f.op.toUpperCase()}</span><code>${f.p}</code><span class="diffstat">${f.s}</span></div>`).join("") : `<div class="empty small">Nothing staged yet.</div>`}</div>
        <div class="sub-h">Tests</div><div class="rows">${it.tests.map(([n, r]) => `<div class="chk ${r === "pass" ? "pass" : "todo"}"><span class="st">${r === "pass" ? svg("check", 14) : ""}</span><span class="lr-t"><b>${n}</b></span><span class="diffstat">${r === "pass" ? "Passing" : "Waiting for code"}</span></div>`).join("")}</div></section>`;
    } else {
      if (it.status !== "shipped") {
        primary = it.release ? { label: "Open release", act: "nav", arg: "releases" } : { label: `Add to ${E.next}`, act: "addRelease", disabled: it.ph.build !== "done", why: "Build must be reviewed first" };
        next = it.release ? { title: `Included in ${it.release}`, body: "It ships with the next release.", icon: "tag", tone: "ok" } : it.ph.build === "done" ? { title: `Preview ready at ${it.id.toLowerCase()}.preview.pronghorn.blue`, body: "Checks passed. Add it to the next release." } : { title: "Ship opens after review" };
      }
      const ok = it.ph.build === "done";
      body = `<section class="card"><div class="card-h"><h2>Release checks</h2></div><div class="rows">${[["Tests pass on the branch", ok], [`Audit finds no regressions against ${E.version}`, ok], ["Review approved", ok]].map(([t, v]) => `<div class="chk ${v ? "pass" : "todo"}"><span class="st">${v ? svg("check", 14) : ""}</span><span class="lr-t"><b>${t}</b></span></div>`).join("")}</div></section>`;
    }
    const head = `<div class="phead"><div class="phead-t"><div class="crumb"><a href="#p=evolve&v=changes" class="crumb-back" data-nav="changes">Changes</a> / ${it.id}</div><h1>${esc(it.title)}</h1></div><div class="primary-slot">${btn(primary)}</div></div>
      <div class="item-head">${typeChip(it.type)}<span class="wi-id">${it.id}</span>${it.branch ? `<span class="cb-branch">${svg("branch", 14)}${it.branch}</span>` : ""}<span class="muted">${esc(it.source)}</span></div>`;
    return [`${head}${stepper}${banner(next)}${body}`, primary];
  }

  function releasesView() {
    const E = S.evolve, ready = E.items.filter((i) => i.release === E.next && i.status === "active"), waiting = E.items.filter((i) => i.status === "active" && !i.release);
    const primary = { label: `Release ${E.next}`, act: "release", icon: "tag", disabled: !ready.length, why: "Add a reviewed change first" };
    const html = `${header(`Evolve mode · ${E.version} released`, "Releases", primary)}
      ${banner(ready.length ? { title: `${E.next} has ${ready.length} ready ${ready.length > 1 ? "changes" : "change"}`, body: "Releasing merges each branch into main, tags the version, deploys it and updates the baseline.", icon: "tag" } : { title: `Nothing is ready for ${E.next} yet`, body: "Changes join a release from their Ship step after review.", icon: "tag" })}
      <section class="card"><div class="card-h"><h2>Next · ${E.next}</h2><span class="meta">builds on ${E.version}</span></div>
        <div class="rows">${ready.map((i) => `<div class="lrow"><button class="wi-main" data-item="${i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="lr-t"><b>${esc(i.title)}</b></span><span class="linkchip ok">${svg("check", 14)}Ready</span></button></div>`).join("") || `<div class="empty small">No changes in this release yet.</div>`}</div>
        ${waiting.length ? `<div class="sub-h">Not in this release</div><div class="rows">${waiting.map((i) => `<div class="lrow"><button class="wi-main" data-item="${i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="lr-t"><b>${esc(i.title)}</b></span><span class="wi-status">${PHASES.find((x) => i.ph[x.id] === "active")?.name || ""}</span></button></div>`).join("")}</div>` : ""}
        ${more("notes", "Release notes (drafted by the agent)", `<ul class="plain">${ready.map((i) => `<li><b>${i.type === "bug" ? "Fixed" : "New"}:</b> ${esc(i.title)}</li>`).join("") || "<li class='muted'>Notes appear as changes are added.</li>"}</ul>`)}</section>
      <section class="card"><div class="card-h"><h2>History</h2></div><div class="rows">${E.history.map((h, k) => `<div class="lrow"><span class="ver">${h.v}</span><span class="lr-t"><b>${h.n}</b><span>${h.when}</span></span>${k === 0 ? `<span class="linkchip ok">Current baseline</span>` : ""}</div>`).join("")}</div></section>`;
    return [html, primary];
  }

  function baselineView(p) {
    const E = S.evolve, list = [["requirements", "Requirements"], ["architecture", "Architecture"], ["code", "Code"], ["data", "Data"]];
    const t = list.some((x) => x[0] === p.t) ? p.t : "requirements";
    const primary = { label: "Propose a change", act: "newChange", arg: "enhancement" };
    const b = S.build;
    const content = t === "requirements" ? `<section class="card"><div class="card-h"><h2>Requirements in ${E.version}</h2><span class="meta">18 stories</span></div>${b.reqs.map((e, k) => more("base-" + k, `<span class="kind">Epic</span><b>${e.epic}</b><span class="meta">${e.stories.length}</span>`, `<ul class="plain">${e.stories.map((s) => `<li>${s[0]}</li>`).join("")}</ul>`, k === 0)).join("")}</section>`
      : t === "architecture" ? canvas(null)
      : t === "code" ? `<section class="card"><div class="card-h"><h2>${svg("lock", 16)} main @ ${E.version}</h2><span class="meta">protected</span></div><div class="rows">${["src/api/eligibility.ts", "src/api/upload.ts", "src/pages/Apply.tsx", "src/pages/Queue.tsx", "db/migrations/004_documents.sql"].map((f) => `<div class="file"><code>${f}</code></div>`).join("")}</div></section>`
      : `<section class="card"><div class="card-h"><h2>Tables in ${E.version}</h2></div><div class="rows">${[["applicants", "12 columns"], ["documents", "8 columns"], ["queue_scores", "5 columns"]].map(([n, c]) => `<div class="lrow"><code>${n}</code><span class="lr-t"><span>${c}</span></span></div>`).join("")}</div></section>`;
    return [`${header(`Baseline · ${E.version} · locked`, list.find((x) => x[0] === t)[1], primary)}${tabs(list, t, "Baseline")}${banner({ title: `This is ${E.version}, the released baseline`, body: "It's read-only. To change anything here, propose a change. It gets its own branch, and the baseline updates when it's released.", icon: "lock", tone: "lock" })}${content}`, primary];
  }

  function settingsView(building) {
    return [`${header("Benefits Intake Portal", "Project settings", null)}<section class="card"><div class="pad form"><label class="f">Project name<input value="Benefits Intake Portal"></label></div>
      ${more("set-rules", "Evolve mode rules", `<label class="check"><input type="checkbox" checked> Lock main after the first release</label><label class="check"><input type="checkbox" checked> Bugs skip Design by default</label><label class="check"><input type="checkbox" checked> Every change needs a preview before it can join a release</label>`, true)}
      ${more("set-share", "Sharing and access", `<p class="muted">Owner, Editor and Viewer links.</p>`)}</section>`, null];
  }

  function canvas(it) {
    const nodes = NODES.filter((n) => !n.proposed || (it && it.newComp === n.id));
    const skipped = it && it.ph.design === "skipped";
    return `<section class="card"><div class="card-h"><h2>Architecture</h2><span class="meta">${it ? (skipped ? "read-only · design skipped" : `${it.comps.length} affected`) : "5 components"}</span></div>
      <div class="canvas ${skipped ? "is-skipped" : ""}"><svg class="edges" aria-hidden="true">${EDGES.filter((e) => nodes.find((n) => n.id === e[0]) && nodes.find((n) => n.id === e[1])).map(([a, b]) => `<line data-a="${a}" data-b="${b}" class="${it && it.comps.includes(a) && it.comps.includes(b) ? "hot" : ""} ${NODES.find((n) => n.id === b).proposed ? "prop" : ""}"/>`).join("")}</svg>
      ${nodes.map((n) => { const hit = it && it.comps.includes(n.id); return `<div id="cn-${n.id}" class="cnode ${hit ? "hit" : it ? "dim" : ""} ${n.proposed ? "proposed" : ""}" style="left:${narrow() ? n.mx : n.x}%;top:${narrow() ? n.my : n.y}%"><b>${n.name}</b><small>${n.kind}</small>${hit ? `<span class="cn-tag">${n.proposed ? "New" : "Changes"}</span>` : ""}</div>`; }).join("")}</div></section>`;
  }
  function drawEdges() {
    const c = $(".canvas"); if (!c) return; const box = c.getBoundingClientRect();
    $$(".edges line", c).forEach((l) => { const A = $("#cn-" + l.dataset.a).getBoundingClientRect(), B = $("#cn-" + l.dataset.b).getBoundingClientRect();
      l.setAttribute("x1", A.left + A.width / 2 - box.left); l.setAttribute("y1", A.top + A.height / 2 - box.top); l.setAttribute("x2", B.left + B.width / 2 - box.left); l.setAttribute("y2", B.top + B.height / 2 - box.top); });
  }
  const narrow = () => matchMedia("(max-width: 768px)").matches;
  let wasNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); render(); } else drawEdges(); });
  if (document.fonts) document.fonts.ready.then(drawEdges);

  /* ------------------------------------------------------------- new change */
  function newChange(type) {
    let t = type || null;
    const draw = () => {
      openSheet("New change", `<div class="field-l">What kind of change?</div>
        <div class="types" role="radiogroup">${Object.entries(TYPES).map(([k, x]) => `<button role="radio" aria-checked="${t === k}" class="type-opt" data-type="${k}">${typeChip(k)}<b>${x.blurb.replace("in production ", "")}</b><span>${x.path}</span></button>`).join("")}</div>
        ${t ? `<label class="f">Title<input id="ncTitle" placeholder="${t === "bug" ? "What's broken, in one line" : "What changes for people"}"></label><label class="f">Reported or requested by<input value="Igor Chagas"></label>` : ""}`,
        `<button class="btn quiet" data-close><span class="lbl">Cancel</span></button><button class="btn primary" id="ncCreate" ${t ? "" : "disabled"}><span class="lbl">Create change</span><span class="progress"></span></button>`);
      $$(".type-opt").forEach((b) => (b.onclick = () => { t = b.dataset.type; draw(); $("#ncTitle").focus(); }));
      const c = $("#ncCreate"); if (c) c.onclick = () => {
        const E = S.evolve, id = "WI-" + E.seq++, title = $("#ncTitle").value.trim() || `Untitled ${t}`;
        runButton(c, 500, "Created", () => {
          const it = { id, type: t, title, status: "active", source: "Created by you", ph: { define: "active", design: t === "bug" ? "skipped" : "todo", build: "todo", ship: "todo" }, note: { define: "Agent drafting", design: t === "bug" ? "Skipped for bug" : "Not started", build: "Not started", ship: "Not started" }, branch: `${t === "bug" ? "fix" : "feat"}/${id.toLowerCase()}`, reqs: [], comps: ["api"], staged: [], tests: [] };
          E.items.unshift(it); closeSheet(); notify(`${id} created on branch ${it.branch}`, () => { E.items = E.items.filter((x) => x !== it); });
          go({ p: "evolve", v: "changes", w: id, t: "", s: "" });
        });
      };
    };
    draw();
  }

  /* ----------------------------------------------------------------- agents */
  setInterval(() => {
    const p = P();
    if (p.p === "building") {
      const a = S.build.agent; if (!a.live) return;
      a.pct = Math.min(100, a.pct + 5);
      if (a.pct >= 100) { a.live = false; S.build.staged.push({ p: "src/pages/Queue.test.tsx", op: "a", s: "+72" }); notify("The agent finished. 4 files are staged on main", null); return render(); }
    } else {
      const it = S.evolve.items.find((i) => i.run && i.run.live); if (!it) return;
      it.run.pct = Math.min(100, it.run.pct + 4);
      if (it.run.pct === 76) it.run.detail = "Writing the regression test";
      if (it.run.pct >= 100) { it.run.live = false; it.note.build = "Review 2 files"; it.staged.push({ p: "src/api/heic.ts", op: "a", s: "+41" }); it.tests.forEach((x) => (x[1] = "pass")); notify(`${it.id}: the agent finished. 2 files are ready to review`, null); return render(); }
    }
    renderChrome(p);
    const src = p.p === "building" ? S.build.agent : (S.evolve.items.find((i) => i.run && i.run.live) || {}).run;
    if (src && $("#runMeter")) { $("#runMeter").style.width = src.pct + "%"; $("#runPct").textContent = src.pct + "%"; $("#runDetail").textContent = src.detail; }
    if (p.p === "building") { const n = $(".phase.ph-build .ph-note"); if (n) n.textContent = buildPhases().build[1]; }
  }, 1000);

  /* ----------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const demo = t.closest("[data-demo]"); if (demo) { if (demo.dataset.demo === "building") S.build = buildState(); else S.evolve = evolveState(false); return go({ p: demo.dataset.demo, v: "", t: "", w: "", s: "" }); }
    if (t.closest("#pillA")) { const g = $("#pillA").dataset.go; if (g === "build") return go({ v: "build", t: "agent", w: "" }); if (g.startsWith("item:")) return go({ v: "changes", w: g.slice(5), t: "build" }); return; }
    const nav = t.closest("[data-nav]"); if (nav) { e.preventDefault(); return go({ v: nav.dataset.nav, t: nav.dataset.tool || "", w: "", s: "" }); }
    const tl = t.closest("[data-tool]"); if (tl) return go({ t: tl.dataset.tool });
    const tg = t.closest("[data-toggle]"); if (tg) return go({ s: P().s === tg.dataset.toggle ? "" : tg.dataset.toggle });
    const itm = t.closest("[data-item]"); if (itm) return go({ v: "changes", w: itm.dataset.item, t: "", s: "" });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });

  function act(name, arg, el) {
    const p = P(), E = S.evolve, B = S.build, it = p.w ? E.items.find((i) => i.id === p.w) : null;
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "nav": return go({ v: arg, w: "", t: "" });
      case "step": return go({ t: arg });
      case "newChange": return newChange(arg);
      case "openTriage": return go({ v: "changes", s: arg });
      case "fixCheck": {
        const c = B.checks.find((x) => x.id === arg), row = $("#chk-" + arg);
        if (row) { row.className = "chk run"; row.querySelector(".st").textContent = ""; }
        return runButton(el, 1100, "Done", () => {
          c.ok = true; c.d = { criteria: "18 of 18 stories", audit: "Coverage is 93%", signoff: "Signed off by Igor just now" }[arg] || c.d;
          if (arg === "criteria") B.reqs.forEach((e) => e.stories.forEach((s) => (s[1] = true)));
          notify(`Check passed: ${c.t}`, null); render();
        });
      }
      case "commitMain": return runButton(el, 900, "Committed", () => { const n = B.staged.length, prev = B.staged; B.commits += 1; B.staged = []; notify(`Committed ${n} files to main`, () => { B.staged = prev; B.commits -= 1; }); render(); });
      case "firstRelease": {
        if (!confirmStep(el, `Confirm: release ${B.target} and switch to Evolve mode`)) return;
        const card = $("#releaseCard");
        const steps = [`Merge and tag ${B.target}`, "Deploy with your deployment settings", "Lock the baseline and protect main", "Switch to Evolve mode"];
        if (card) card.innerHTML = `<div class="card-h"><h2>Releasing ${B.target}</h2></div><div class="rows">${steps.map((s, k) => `<div class="chk todo" id="ls-${k}"><span class="st"></span><span class="lr-t"><b>${s}</b></span></div>`).join("")}</div>`;
        let k = 0;
        const tick = () => {
          if (k > 0) { const prev = $("#ls-" + (k - 1)); if (prev) { prev.className = "chk pass"; prev.querySelector(".st").innerHTML = svg("check", 14); } }
          if (k === steps.length) { S.evolve = evolveState(true); notify(`${B.target} is released. The project is now in Evolve mode`, null); return go({ p: "evolve", v: "changes", t: "", w: "", s: "" }); }
          const cur = $("#ls-" + k); if (cur) cur.className = "chk run";
          k++; setTimeout(tick, 750);
        };
        return runButton(el, 3100, "Released", null), tick();
      }
      case "accept": {
        const i = E.items.find((x) => x.id === arg);
        return runButton(el, 500, "Accepted", () => { const snap = JSON.stringify(i); Object.assign(i, { status: "active", ph: { define: "active", design: i.type === "bug" ? "skipped" : "todo", build: "todo", ship: "todo" }, note: { define: "Agent drafting", design: i.type === "bug" ? "Skipped for bug" : "Not started", build: "Not started", ship: "Not started" }, branch: `${i.type === "bug" ? "fix" : "feat"}/${i.id.toLowerCase()}`, reqs: [], comps: ["api"], staged: [], tests: [], fresh: true });
          setTimeout(() => (i.fresh = false), 1600); notify(`${i.id} accepted. Branch ${i.branch} created`, () => { Object.keys(i).forEach((k) => delete i[k]); Object.assign(i, JSON.parse(snap)); }); go({ s: "" }); });
      }
      case "decline": { const i = E.items.find((x) => x.id === arg), idx = E.items.indexOf(i); E.items.splice(idx, 1); notify(`${i.id} declined`, () => E.items.splice(idx, 0, i)); return go({ s: "" }); }
      case "stepDone": {
        const order = PHASES.map((x) => x.id);
        return runButton(el, arg === "build" ? 1000 : 600, arg === "build" ? "Sent" : "Done", () => {
          const snap = JSON.stringify({ ph: it.ph, note: it.note });
          it.ph[arg] = "done"; it.note[arg] = { define: "Ready", design: "Approved", build: "Reviewed" }[arg];
          const nxt = order.slice(order.indexOf(arg) + 1).find((x) => it.ph[x] !== "skipped");
          if (nxt) { it.ph[nxt] = "active"; it.note[nxt] = nxt === "build" ? "Agent starting" : nxt === "ship" ? "Preview ready" : "In progress"; if (nxt === "build" && !it.run) it.run = { pct: 4, live: true, detail: `Planning changes on ${it.branch}` }; }
          notify(`${it.id}: ${PHASES.find((x) => x.id === arg).name} complete`, () => { const s = JSON.parse(snap); it.ph = s.ph; it.note = s.note; if (nxt === "build") it.run = null; });
          go({ t: nxt || arg });
        });
      }
      case "unskip": it.ph.design = it.ph.define === "done" && it.ph.build !== "done" ? "active" : "todo"; it.note.design = "Added"; notify(`${it.id}: design step added`, () => { it.ph.design = "skipped"; it.note.design = "Skipped for bug"; }); return render();
      case "addRelease": return runButton(el, 500, "Added", () => { it.release = E.next; it.note.ship = `In ${E.next}`; notify(`${it.id} added to ${E.next}`, () => { it.release = null; it.note.ship = "Preview ready"; }); render(); });
      case "release": {
        if (!confirmStep(el, `Confirm: release ${E.next}`)) return;
        return runButton(el, 1600, "Released", () => {
          const snap = JSON.stringify(E), shipped = E.items.filter((i) => i.release === E.next && i.status === "active");
          shipped.forEach((i) => { i.status = "shipped"; i.shippedIn = E.next; i.ph.ship = "done"; i.release = null; });
          E.history.unshift({ v: E.next, when: "just now", n: shipped.map((i) => i.title).join(", ") });
          E.version = E.next; E.released = "just now"; E.next = E.next.replace(/\.(\d+)\.\d+$/, (m, a) => `.${+a + 1}.0`);
          notify(`${E.version} released. The baseline now includes ${shipped.length} ${shipped.length > 1 ? "changes" : "change"}`, () => { S.evolve = JSON.parse(snap); });
          render();
        });
      }
    }
  }

  render();
})();

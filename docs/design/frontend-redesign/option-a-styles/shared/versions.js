/*
 * Approach 3 · Version timeline
 *
 * The unit of work is a version. Before the first release there is one version,
 * v1.0.0, being built. After it, every bug fix, enhancement and feature is
 * scheduled into a version (a hotfix or the next release). A timeline strip is
 * always visible: versions left of the "First release" flag are the build era,
 * versions right of it are the evolve era. Selecting a version scopes the four
 * phases in the rail to that version. Released versions are read-only.
 *
 * Refinements: every change has its own page (w=ID) with a step bar, triage
 * suggests hotfix vs next release, changes can move between open versions,
 * and older releases collapse on the timeline.
 */
(function () {
  "use strict";
  const { $, $$, esc, svg, PHASES, TYPES, btn, typeChip, track, banner, more, header, tabs, confirmStep, runButton, notify, afterUndo, openSheet, closeSheet } = PK;
  PK.shell();
  document.body.classList.add("has-ctx", "has-timeline");

  /* ------------------------------------------------------------------ data */
  const REQS = [
    { epic: "Applicant can apply online", stories: [["Answer 5 screening questions", true], ["See why I'm not eligible", true], ["Upload ID from my phone", false], ["Get a confirmation email", true]] },
    { epic: "Caseworker triage queue", stories: [["Queue ordered by priority score", true], ["Assign an application", false], ["Request more documents", false]] },
    { epic: "Bilingual service", stories: [["Switch the interface to French", true], ["Receive emails in my language", true]] },
  ];
  function buildState() {
    return {
      mode: "building",
      versions: [{ v: "start", kind: "hist", label: "Start", sub: "Project created" }, { v: "v1.0.0", kind: "building", sub: "First release" }],
      reqs: JSON.parse(JSON.stringify(REQS)),
      agent: { live: true, pct: 34, detail: "Generating the caseworker queue page" },
      staged: [{ p: "src/pages/Queue.tsx", op: "a", s: "+188" }, { p: "src/api/queue.ts", op: "a", s: "+64" }, { p: "db/migrations/003_queue.sql", op: "a", s: "+19" }],
      checks: [
        { id: "criteria", t: "Every story has acceptance criteria", d: "3 stories are missing criteria", ok: false, fix: "Draft with AI" },
        { id: "audit", t: "Audit covers at least 90% of requirements", d: "Coverage is 84%", ok: false, fix: "Run audit" },
        { id: "tests", t: "All tests pass on main", d: "212 passing", ok: true },
        { id: "test-env", t: "The Test environment runs the latest build", d: "a3f91c2 deployed 2h ago", ok: true },
        { id: "signoff", t: "Product owner signs off", d: "Waiting for Igor", ok: false, fix: "Sign off" },
      ],
      items: [], seq: 1,
    };
  }
  function evolveState(fresh) {
    if (fresh) return { mode: "evolve", versions: [{ v: "v1.0.0", kind: "current", sub: "Current release", first: true }, { v: "v1.1.0", kind: "planned", sub: "Next release" }], items: [], seq: 1, current: "v1.0.0" };
    return {
      mode: "evolve", current: "v1.4.2", seq: 48,
      versions: [
        { v: "v1.0.0", kind: "hist", sub: "4 months ago", first: true },
        { v: "v1.1.0", kind: "hist", sub: "3 months ago" },
        { v: "v1.2.0", kind: "hist", sub: "10 weeks ago" },
        { v: "v1.3.0", kind: "hist", sub: "7 weeks ago" },
        { v: "v1.4.0", kind: "hist", sub: "5 weeks ago" },
        { v: "v1.4.1", kind: "hist", sub: "3 weeks ago" },
        { v: "v1.4.2", kind: "current", sub: "Current release" },
        { v: "v1.4.3", kind: "hotfix", sub: "Hotfix" },
        { v: "v1.5.0", kind: "building", sub: "Next release" },
        { v: "v1.6.0", kind: "planned", sub: "Planned" },
      ],
      items: [
        { id: "WI-47", type: "bug", sev: "High", title: "Confirmation email shows the wrong submission date", ver: null, source: "Reported by the test team", evidence: "Applicants use this date as proof they applied before the deadline. Dates are sent in UTC, so after 5 pm in Alberta the email shows tomorrow's date." },
        { id: "WI-45", type: "enhancement", title: "Show the eligibility result faster", ver: null, source: "Requested by the caseworker lead", evidence: "Applicants wait about 3 seconds for the result. The spec target is under 1 second." },
        { id: "WI-42", type: "bug", title: "Photo upload fails for iPhone HEIC images", sev: "High", ver: "v1.4.3", source: "Reported by the help desk",
          ph: { define: "done", design: "skipped", build: "active", ship: "todo" }, note: { define: "Reproduced", design: "Skipped", build: "Agent fixing", ship: "—" }, branch: "fix/wi-42-heic",
          reqs: [["S3", "As an applicant I upload ID from my phone", "Regression", "HEIC photos convert to JPEG and upload"]], comps: ["docs", "api"], run: { pct: 60, live: true, detail: "Adding HEIC conversion to the upload handler" },
          staged: [{ p: "src/api/upload.ts", op: "m", s: "+24 −3" }], tests: [["converts HEIC photos to JPEG", "pending"], ["rejects files over 10 MB", "pass"]],
          bug: { steps: ["Open Apply on an iPhone", "Choose a photo from the library", "Select Upload"], expected: "The photo uploads and shows a preview", actual: "“File type not supported”" } },
        { id: "WI-40", type: "bug", title: "Caseworker queue sorts by name, not priority", sev: "Medium", ver: "v1.5.0", source: "Reported by the caseworker team",
          ph: { define: "done", design: "skipped", build: "done", ship: "active" }, note: { define: "Done", design: "Skipped", build: "Reviewed", ship: "Ready" }, branch: "fix/wi-40-queue-sort",
          reqs: [["F3", "Priority scoring", "Regression", "Queue is ordered by priority score, then date"]], comps: ["case"],
          staged: [], tests: [["queue orders by priority score", "pass"]],
          bug: { steps: ["Open the caseworker queue", "Look at the order of applications"], expected: "Highest priority first", actual: "Sorted alphabetically by applicant name" } },
        { id: "WI-38", type: "feature", title: "Applicants can save a draft and return later", ver: "v1.5.0", source: "Requested by the program area",
          ph: { define: "done", design: "active", build: "todo", ship: "todo" }, note: { define: "3 new stories", design: "1 new component", build: "—", ship: "—" }, branch: "feat/wi-38-drafts",
          reqs: [["S5", "As an applicant I save my application as a draft", "New"], ["S6", "As an applicant I resume a draft from a link in my email", "New"], ["S7", "Drafts are deleted after 30 days", "New"], ["S1", "As an applicant I answer 5 screening questions", "Changed"]], comps: ["web", "api", "drafts"], newComp: "drafts", staged: [], tests: [] },
        { id: "WI-36", type: "feature", title: "French language support", ver: "v1.4.2", shipped: true, source: "Ministry request", ph: { define: "done", design: "done", build: "done", ship: "done" }, note: {} },
      ],
    };
  }
  const NODES = [
    { id: "web", name: "Applicant web", kind: "React", x: 4, y: 10, mx: 3, my: 5 }, { id: "case", name: "Caseworker app", kind: "React", x: 64, y: 10, mx: 52, my: 5 },
    { id: "api", name: "Intake API", kind: "Express", x: 34, y: 42, mx: 27, my: 36 }, { id: "db", name: "Applicants DB", kind: "Postgres", x: 6, y: 76, mx: 3, my: 66 },
    { id: "docs", name: "Document store", kind: "Azure Blob", x: 62, y: 76, mx: 52, my: 66 }, { id: "drafts", name: "Draft store", kind: "Postgres table", x: 36, y: 80, mx: 27, my: 84, proposed: true },
  ];
  const EDGES = [["web", "api"], ["case", "api"], ["api", "db"], ["api", "docs"], ["api", "drafts"]];
  let S = { build: buildState(), evolve: evolveState(false) };

  /* --------------------------------------------------------------- routing */
  function P() { const h = PK.hashParams(); return { p: h.p === "building" ? "building" : "evolve", r: h.r || "", v: h.v || "", t: h.t || "", s: h.s || "", w: h.w || "" }; }
  function go(patch) { PK.setHash(Object.assign(P(), patch)); }
  window.addEventListener("hashchange", render);
  afterUndo(() => render());

  const D = () => (P().p === "building" ? S.build : S.evolve);
  const ver = (v) => D().versions.find((x) => x.v === v);
  const itemsIn = (v) => D().items.filter((i) => i.ver === v && !i.shipped);
  function defaultVersion() { const d = D(); return (d.versions.find((x) => x.kind === "building" || x.kind === "hotfix") || d.versions.find((x) => x.kind === "current")).v; }
  const isOpen = (vv) => vv && (vv.kind === "building" || vv.kind === "hotfix" || vv.kind === "planned");
  const narrow = () => matchMedia("(max-width: 768px)").matches;

  /* ------------------------------------------------------------ chrome */
  function renderChrome(p, sel) {
    const building = p.p === "building";
    document.body.classList.toggle("is-building", building); document.body.classList.toggle("is-live", !building);
    $$("[data-demo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.demo === (building ? "building" : "evolve"))));
    $("#modeBadge").innerHTML = building ? `<span class="dot"></span><span class="mb-long">Before first release</span><span class="mb-short">Building</span>` : `<span class="dot"></span><span class="mb-long">Current release </span><b>${S.evolve.current}</b>`;
    const live = building ? (S.build.agent.live ? S.build.agent : null) : (S.evolve.items.find((i) => i.run && i.run.live) || {}).run;
    $("#pillA").innerHTML = live ? `<span class="dot run"></span>Agent · ${live.pct}%` : `<span class="dot ok"></span>Agents idle`;

    // timeline strip: always visible, the anchor for "where in the lifecycle am I"
    const d = D();
    const node = (x) => x.kind === "more" ? `<span class="tl-node more hist" title="${x.sub}"><span class="tl-dot"></span><span class="tl-v">${x.label}</span><span class="tl-s">${x.sub}</span></span>`
      : `<button class="tl-node ${x.kind === "current" ? "live" : x.kind}" data-ver="${x.v}" ${x.v === sel ? 'aria-current="true"' : ""} ${x.v === "start" ? "disabled" : ""}><span class="tl-dot"></span><span class="tl-v">${x.label || x.v}</span><span class="tl-s">${building && x.kind === "building" ? "Building" : isOpen(x) ? `${x.sub} · ${itemsIn(x.v).length} ${itemsIn(x.v).length === 1 ? "change" : "changes"}` : x.sub}</span></button>`;
    const flag = (pending) => `<span class="tl-flag ${pending ? "pending" : ""}">${svg("flag", 18)}<b>First release</b><span>${pending ? "Not yet" : "Build → Evolve"}</span></span>`;
    const hist = d.versions.filter((x) => x.kind === "hist" && !x.first), expanded = PK.store("tl.expanded") === "1";
    const hidden = expanded || hist.length < 3 ? [] : hist.slice(0, -1).filter((x) => x.v !== sel);
    let html = "", moreShown = false;
    d.versions.forEach((x) => {
      if (hidden.includes(x)) {
        if (!moreShown) { moreShown = true; html += `<button class="tl-node more hist" data-tl-toggle title="Show ${hidden.map((h) => h.v).join(", ")}"><span class="tl-dot"></span><span class="tl-v">${hidden.length} more</span><span class="tl-s">${hidden[0].v} – ${hidden[hidden.length - 1].v}</span></button>`; }
        return;
      }
      html += node(x); if (x.first) html += flag(false);
    });
    if (expanded && hist.length >= 3) html = html.replace(/(<span class="tl-flag [^]*?<\/span><\/span>)/, `$1<button class="tl-node more hist" data-tl-toggle title="Hide older releases"><span class="tl-dot"></span><span class="tl-v">Fewer</span><span class="tl-s">collapse</span></button>`);
    if (building) html += flag(true);
    $("#strip").className = "ctxbar strip timeline"; $("#strip").hidden = false;
    $("#strip").innerHTML = `<div class="tl" role="navigation" aria-label="Versions">${html}</div>`;
    const cur = $("#strip [aria-current='true']"), strip = $("#strip");
    if (cur) { const l = cur.offsetLeft, r = l + cur.offsetWidth; if (l < strip.scrollLeft || r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = l - strip.clientWidth / 2 + cur.offsetWidth / 2; }
  }

  function renderRail(p, sel, view) {
    const d = D(), vv = ver(sel), building = p.p === "building";
    const st = phaseState(sel);
    const inbox = building ? 0 : d.items.filter((i) => !i.ver).length;
    const kindLabel = building ? "BUILDING · FIRST RELEASE" : { current: "CURRENT RELEASE · LOCKED", hist: "RELEASED · LOCKED", building: "IN PROGRESS", hotfix: "HOTFIX · IN PROGRESS", planned: "PLANNED" }[vv.kind];
    $("#rail").innerHTML = `
      <div class="rail-group">
        <button class="rail-item" data-nav="versions" ${view === "versions" ? 'aria-current="page"' : ""}>${svg("tag")}<span class="ri-t">All versions</span>${inbox ? `<span class="n warn">${inbox}</span>` : ""}</button>
      </div>
      <div class="rail-ctx"><div class="rail-label">Working on</div>
        <button class="mode-card" data-nav="versions"><span class="mc-l">${svg(isOpen(vv) || building ? "branch" : "lock", 14)}${kindLabel}</span><span class="mc-v">${sel}</span><span class="mc-s">${building ? "Everything built now ships as " + sel : isOpen(vv) ? `${itemsIn(sel).length} ${itemsIn(sel).length === 1 ? "change" : "changes"} · branch release/${sel}` : "Read-only. Changes go into a newer version."}</span></button></div>
      <div class="journey">${PHASES.map((ph) => `<button class="phase ph-${ph.id} st-${st[ph.id][0]}" data-nav="${ph.id}" ${view === ph.id ? 'aria-current="page"' : ""}><span class="node"></span><span class="ph-txt"><span class="ph-name">${ph.name}</span><span class="ph-note">${st[ph.id][1]}</span></span></button>`).join("")}</div>
      <div class="rail-foot"><button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Project settings</span></button></div>`;
    $("#tabbar").innerHTML = `<button data-nav="versions" ${view === "versions" ? 'aria-current="page"' : ""}>${svg("tag", 22)}<span>Versions</span></button>` + PHASES.map((ph) => `<button class="ph-${ph.id} st-${st[ph.id][0]}" data-nav="${ph.id}" ${view === ph.id ? 'aria-current="page"' : ""}><span class="node"></span><span>${ph.name}</span></button>`).join("");
  }

  function phaseState(sel) {
    const p = P();
    if (p.p === "building") {
      const B = S.build, all = B.reqs.flatMap((e) => e.stories), miss = all.filter((s) => !s[1]).length, ready = B.checks.filter((c) => c.ok).length;
      return { define: [miss ? "active" : "done", `${all.length - miss}/${all.length} have criteria`], design: ["done", "5 components"], build: [B.agent.live || B.staged.length ? "active" : "done", B.agent.live ? `Agent ${B.agent.pct}%` : `${B.staged.length} files staged`], ship: [ready === B.checks.length ? "active" : "todo", `${ready}/${B.checks.length} release checks`] };
    }
    const vv = ver(sel);
    if (!isOpen(vv)) return { define: ["base", "18 requirements"], design: ["base", "5 components"], build: ["base", `tag ${sel}`], ship: ["base", vv.kind === "current" ? "Released · current" : "Released"] };
    const list = itemsIn(sel);
    if (!list.length) return { define: ["todo", "No changes yet"], design: ["todo", "—"], build: ["todo", "—"], ship: ["todo", "—"] };
    const count = (ph, s) => list.filter((i) => i.ph[ph] === s).length;
    const out = {};
    PHASES.forEach((ph) => {
      const act = count(ph.id, "active"), done = count(ph.id, "done") + count(ph.id, "skipped"), total = list.length;
      out[ph.id] = [done === total ? "done" : act ? "active" : "todo", act ? `${act} in progress · ${done}/${total} done` : `${done}/${total} done`];
    });
    if (vv.kind === "planned" && !list.length) out.define[1] = "Nothing scheduled";
    return out;
  }

  /* ----------------------------------------------------------------- render */
  function render() {
    const p = P(), d = D();
    const item = p.p === "evolve" && p.w ? S.evolve.items.find((i) => i.id === p.w && i.ver) : null;
    if (p.w && !item) return go({ w: "" });
    const sel = item ? item.ver : p.r && ver(p.r) && p.r !== "start" ? p.r : defaultVersion();
    const view = item ? stepOf(item, p.t) : p.v || "versions";
    renderChrome(p, sel); renderRail(p, sel, view);
    document.body.dataset.view = PHASES.some((x) => x.id === view) ? view : "work";
    let html, primary;
    if (view === "settings") [html, primary] = [`${header("Benefits Intake Portal", "Project settings", null)}<section class="card">${more("vset", "Versioning rules", `<label class="check"><input type="checkbox" checked> Hotfix versions for high-severity bugs</label><label class="check"><input type="checkbox" checked> Versions are released in order</label><label class="check"><input type="checkbox" checked> Unfinished changes move to the next version on release</label>`, true)}</section>`, null];
    else if (item) [html, primary] = changeView(item, view);
    else if (view === "versions") [html, primary] = versionsView(p, sel);
    else if (p.p === "building") [html, primary] = buildingPhase(view, p.t, sel);
    else if (!isOpen(ver(sel))) [html, primary] = lockedPhase(view, p.t, sel);
    else [html, primary] = versionPhase(view, p.t, sel, p.s);
    $("#page").innerHTML = html;
    $("#mAction").innerHTML = btn(primary);
    document.body.classList.toggle("has-maction", !!primary);
    drawEdges();
  }

  /* -------------------------------------------------------- All versions */
  function versionsView(p, sel) {
    const d = D();
    if (p.p === "building") {
      const B = S.build;
      return [`${header("Before first release", "All versions", { label: "Open v1.0.0", act: "open", arg: "v1.0.0|build" })}
        ${banner({ title: "Everything you build now becomes v1.0.0", body: "After the first release, each bug fix, enhancement and feature is scheduled into a new version. Released versions are read-only.", icon: "flag" })}
        <section class="card"><div class="card-h"><h2>In progress</h2></div><div class="rows"><button class="release-lane" data-ver="v1.0.0" data-go="build"><span class="ver">v1.0.0</span><span class="lr-t"><b>First release</b><span>${B.checks.filter((c) => c.ok).length} of ${B.checks.length} release checks pass</span></span><span class="wi-status">Building</span></button></div></section>`, { label: "Open v1.0.0", act: "open", arg: "v1.0.0|build" }];
    }
    const inbox = d.items.filter((i) => !i.ver), open = d.versions.filter(isOpen), released = d.versions.filter((x) => x.kind === "hist" || x.kind === "current");
    const nextV = d.versions.find((x) => x.kind === "building") || d.versions.find((x) => x.kind === "planned"), hot = d.versions.find((x) => x.kind === "hotfix");
    const html = `${header(`Current release ${d.current}`, "All versions", { label: "New change", act: "newChange" })}
      ${banner(inbox.length ? { title: `${inbox.length} requests are not scheduled`, body: "Choose a version for each one. High-severity bugs can go into a hotfix.", icon: "tag" } : d.items.length ? null : { title: `${d.current} is released. What's next?`, body: `Report a bug or request a change, then schedule it into ${nextV ? nextV.v : "a version"}.`, cta: "New change", act: "newChange", icon: "flag", tone: "ok" })}
      ${inbox.length ? `<section class="card"><div class="card-h"><h2>Not scheduled</h2><span class="meta">${inbox.length}</span></div><div class="rows">${inbox.map((i) => `<div class="wi wi-triage ${p.s === i.id ? "is-open" : ""} ${i.fresh ? "fresh" : ""}"><button class="wi-main" data-toggle="${i.id}" aria-expanded="${p.s === i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="wi-t"><b>${esc(i.title)}</b><span>${esc(i.source)}${i.sev ? ` · ${i.sev} severity` : ""}</span></span>${track(null)}<span class="wi-go">${svg("down", 16)}</span></button>
          ${p.s === i.id ? triageActions(i, nextV, hot) : ""}</div>`).join("")}</div></section>` : ""}
      <section class="card"><div class="card-h"><h2>In progress</h2></div><div class="rows">${open.map((x) => { const list = itemsIn(x.v); return `<button class="release-lane" data-ver="${x.v}"><span class="ver">${x.v}</span><span class="lr-t"><b>${x.kind === "hotfix" ? "Hotfix" : x.kind === "planned" ? "Planned" : "Next release"}</b><span>${list.length} ${list.length === 1 ? "change" : "changes"}${list.length ? " · " + list.filter((i) => i.ph.build === "done").length + " ready" : ""}</span></span><span class="rl-items">${list.map((i) => `<span class="type type-${i.type}">${i.id}</span>`).join("")}</span></button>`; }).join("")}</div></section>
      <section class="card"><div class="card-h"><h2>Released</h2></div><div class="rows">${released.slice().reverse().map((x) => `<button class="release-lane" data-ver="${x.v}"><span class="ver">${x.v}</span><span class="lr-t"><b>${x.first ? "First release" : x.kind === "current" ? "Current release" : "Released"}</b><span>${x.kind === "current" ? "The locked baseline" : x.sub}</span></span><span class="lk">${svg("lock", 14)}</span></button>`).join("")}</div></section>`;
    return [html, { label: "New change", act: "newChange" }];
  }

  /* ---------------------------------------------- phases before release */
  const TOOLS = {
    define: [["requirements", "Requirements"], ["standards", "Standards"], ["artifacts", "Artifacts"]],
    design: [["canvas", "Canvas"], ["specifications", "Specifications"]],
    build: [["agent", "Agent"], ["repository", "Repository"], ["database", "Database"]],
    ship: [["release", "Release"], ["environments", "Environments"], ["audit", "Audit"]],
  };
  function buildingPhase(view, tool, sel) {
    const B = S.build, list = TOOLS[view], t = list.some((x) => x[0] === tool) ? tool : list[0][0], name = list.find((x) => x[0] === t)[1];
    const miss = B.reqs.flatMap((e) => e.stories).filter((s) => !s[1]).length, ready = B.checks.every((c) => c.ok);
    let primary = null, next = null, body = "";
    if (t === "requirements") {
      primary = { label: "Add requirement", act: "noop" };
      next = miss ? { title: `${miss} stories need acceptance criteria`, body: "Criteria become the agent's tests.", cta: "Draft with AI", act: "fixCheck", arg: "criteria" } : { title: "Every story has acceptance criteria", icon: "check", tone: "ok" };
      body = `<section class="card"><div class="card-h"><h2>Requirements in ${sel}</h2></div>${B.reqs.map((e, k) => more("vb-" + k, `<span class="kind">Epic</span><b>${e.epic}</b><span class="meta">${e.stories.length}</span>`, `<div class="rows">${e.stories.map(([s, ok]) => `<div class="lrow"><span class="lr-t"><b>${s}</b></span><span class="delta ${ok ? "delta-new" : "delta-changed"}">${ok ? "Criteria set" : "Needs criteria"}</span></div>`).join("")}</div>`, k === 0)).join("")}</section>`;
    } else if (t === "canvas") { primary = { label: "Regenerate with AI", act: "noop" }; body = canvas([]); }
    else if (t === "agent") {
      primary = { label: "Commit to main", act: "commitMain", disabled: !B.staged.length };
      next = { title: `Building ${sel} directly on main`, body: "After the first release, each change gets its own branch inside a version.", icon: "branch" };
      body = `<section class="card"><div class="card-h"><h2>${svg("branch", 16)} main</h2><span class="meta">becomes ${sel}</span></div>${B.agent.live ? runRow(B.agent) : ""}<div class="sub-h">Staged changes</div><div class="rows">${B.staged.map((f) => `<div class="file"><span class="op op-${f.op}">${f.op.toUpperCase()}</span><code>${f.p}</code><span class="diffstat">${f.s}</span></div>`).join("") || `<div class="empty small">Nothing staged.</div>`}</div></section>`;
    } else if (t === "release") {
      primary = { label: `Release ${sel}`, act: "firstRelease", icon: "flag", disabled: !ready, why: "Complete every release check first" };
      next = ready ? { title: `${sel} is ready`, body: "Releasing places the First release flag on the timeline. After that, work is scheduled into versions.", icon: "flag", tone: "ok" } : { title: "Complete the release checks", icon: "flag" };
      body = `<section class="card" id="releaseCard"><div class="card-h"><h2>Release checks for ${sel}</h2><span class="meta">${B.checks.filter((c) => c.ok).length}/${B.checks.length}</span></div><div class="rows">${B.checks.map((c) => `<div class="chk ${c.ok ? "pass" : "fail"}" id="chk-${c.id}"><span class="st">${c.ok ? svg("check", 14) : "!"}</span><span class="lr-t"><b>${c.t}</b><span>${c.d}</span></span>${c.ok ? "" : `<button class="btn" data-act="fixCheck" data-arg="${c.id}"><span class="lbl">${c.fix}</span><span class="progress"></span></button>`}</div>`).join("")}</div></section>`;
    } else body = `<section class="card empty"><b>${name} goes here</b><span>The existing page mounts inside the shell.</span></section>`;
    return [`${header(`${sel} · ${PHASES.find((x) => x.id === view).name}`, name, primary)}${tabs(list, t, "tools")}${banner(next)}${body}`, primary];
  }

  /* ------------------------------------------------ released = read-only */
  function lockedPhase(view, tool, sel) {
    const list = TOOLS[view], t = list.some((x) => x[0] === tool) ? tool : list[0][0], name = list.find((x) => x[0] === t)[1];
    const d = S.evolve, target = (d.versions.find((x) => x.kind === "building") || d.versions.find((x) => x.kind === "planned") || {}).v;
    const primary = target ? { label: `Change this in ${target}`, act: "newChange" } : null;
    let body = "";
    if (view === "define") body = `<section class="card"><div class="card-h"><h2>Requirements in ${sel}</h2><span class="meta">18 stories</span></div>${REQS.map((e, k) => more("vl-" + k, `<span class="kind">Epic</span><b>${e.epic}</b>`, `<ul class="plain">${e.stories.map((s) => `<li>${s[0]}</li>`).join("")}</ul>`, k === 0)).join("")}</section>`;
    else if (view === "design") body = canvas([]);
    else if (view === "build") body = `<section class="card"><div class="card-h"><h2>${svg("tag", 16)} ${sel}</h2><span class="meta">tagged · read-only</span></div><div class="rows">${["src/api/eligibility.ts", "src/api/upload.ts", "src/pages/Apply.tsx", "src/pages/Queue.tsx"].map((f) => `<div class="file"><code>${f}</code></div>`).join("")}</div></section>`;
    else body = `<section class="card"><div class="card-h"><h2>Shipped in ${sel}</h2></div><div class="rows">${d.items.filter((i) => i.shipped && i.ver === sel).map((i) => `<div class="lrow">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="lr-t"><b>${esc(i.title)}</b></span></div>`).join("") || `<div class="empty small">Release notes for ${sel}.</div>`}</div></section>`;
    return [`${header(`${sel} · released`, name, primary)}${tabs(list, t, "tools")}${banner({ title: `${sel} is released and read-only`, body: "Select a version on the right of the timeline to work on changes.", icon: "lock", tone: "lock" })}${body}`, primary];
  }

  /* ---------------------------------- open version: phase boards per change */
  function versionPhase(view, tool, sel, focus) {
    const d = S.evolve, vv = ver(sel), list = itemsIn(sel), ph = PHASES.find((x) => x.id === view);
    const lower = d.versions.find((x) => (x.kind === "hotfix" || x.kind === "building") && x.v !== sel && x.v < sel);
    let primary = { label: `New change in ${sel}`, act: "newChange", arg: sel }, next = null, body = "";
    if (!list.length) {
      body = `<section class="card empty"><div class="empty-cta"><b>No changes scheduled in ${sel}</b><span>Schedule a request from All versions, or create a new change here.</span></div></section>`;
      return [`${header(`${sel} · ${vv.kind === "hotfix" ? "hotfix" : vv.kind}`, ph.name, primary)}${body}`, primary];
    }
    const rows = (fn) => list.map((i) => `<section class="card ${focus === i.id ? "fresh" : ""}" id="c-${i.id}"><div class="card-h">${typeChip(i.type)}<span class="wi-id">${i.id}</span><h2><button class="card-link" data-item="${i.id}">${esc(i.title)}${svg("chev", 14)}</button></h2><span class="meta">${i.ph[view] === "skipped" ? "skipped" : i.note[view]}</span>${stepAction(i, view)}</div>${fn(i)}</section>`).join("");
    if (view === "define") {
      next = { title: `What ${sel} changes`, body: `Requirement changes from ${list.length} ${list.length > 1 ? "changes" : "change"}, compared with ${d.current}.` };
      body = rows((i) => `<div class="rows">${(i.reqs || []).map(([id, t, dl]) => `<div class="lrow"><span class="rid">${id}</span><span class="lr-t"><b>${esc(t)}</b></span><span class="delta delta-${dl.toLowerCase()}">${dl}</span></div>`).join("") || `<div class="empty small">The agent is drafting requirement changes.</div>`}</div>`);
    } else if (view === "design") {
      next = { title: `Architecture after ${sel}`, body: "Highlighted components change in this version. Bugs skip design unless you add a design step." };
      body = canvas(list) + rows((i) => i.ph.design === "skipped" ? `<div class="pad muted">No design changes.</div>` : `<div class="pad muted">Affects ${i.comps.map((c) => NODES.find((n) => n.id === c).name).join(", ")}.</div>`);
    } else if (view === "build") {
      next = { title: `Each change builds on its own branch`, body: `Reviewed branches merge into release/${sel}.`, icon: "branch" };
      body = rows((i) => `<div class="rows"><div class="file">${svg("branch", 14)}<code>${i.branch}</code><span class="diffstat">${i.ph.build === "done" ? "merged into release/" + sel : i.ph.build === "active" ? "in progress" : "not started"}</span></div>${i.run && i.run.live ? runRow(i.run, i.id) : ""}</div>`);
    } else {
      const ready = list.filter((i) => i.ph.build === "done"), rest = list.filter((i) => i.ph.build !== "done");
      primary = { label: rest.length && ready.length ? `Release ${sel} with ${ready.length} ${ready.length > 1 ? "changes" : "change"}` : `Release ${sel}`, act: "release", arg: sel, icon: "tag", disabled: !ready.length || !!lower, why: lower ? `Release ${lower.v} first. Versions go out in order.` : "No change is reviewed yet" };
      next = lower ? { title: `Release ${lower.v} first`, body: "Versions are released in order, so the baseline stays linear.", cta: `Open ${lower.v}`, act: "open", arg: `${lower.v}|ship`, icon: "tag" }
        : ready.length ? { title: `${ready.length} of ${list.length} changes are ready`, body: rest.length ? `${rest.map((i) => i.id).join(", ")} will move to the next version automatically.` : "Everything in this version is reviewed.", icon: "tag", tone: "ok" } : { title: "Nothing is reviewed yet", body: "Changes become releasable after review in Build.", icon: "tag" };
      body = rows((i) => `<div class="rows"><div class="chk ${i.ph.build === "done" ? "pass" : "todo"}"><span class="st">${i.ph.build === "done" ? svg("check", 14) : ""}</span><span class="lr-t"><b>${i.ph.build === "done" ? "Reviewed, tests pass, no regressions" : "Not reviewed yet"}</b><span>${i.ph.build === "done" ? `Preview: ${i.id.toLowerCase()}.preview.pronghorn.blue` : "Moves to the next version if still open at release"}</span></span></div></div>`)
        + more("notes-" + sel, "Release notes (drafted by the agent)", `<ul class="plain">${ready.map((i) => `<li><b>${i.type === "bug" ? "Fixed" : "New"}:</b> ${esc(i.title)}</li>`).join("") || "<li class='muted'>Empty.</li>"}</ul>`);
    }
    return [`${header(`${sel} · ${vv.kind === "hotfix" ? "hotfix" : vv.kind === "planned" ? "planned" : "next release"}`, ph.name, primary)}${banner(next)}${body}`, primary];
  }
  function triageActions(i, nextV, hot) {
    const hotfixSuggested = i.type === "bug" && i.sev === "High";
    const toNext = nextV ? { v: nextV.v, label: `Schedule in ${nextV.v}` } : null;
    const toHot = i.type === "bug" ? { v: hot ? hot.v : "hotfix", label: hot ? `Add to hotfix ${hot.v}` : `Start hotfix ${nextHotfix()}` } : null;
    const [first, second] = hotfixSuggested ? [toHot, toNext] : [toNext, toHot];
    const why = hotfixSuggested ? "Suggested: hotfix, because this is a high-severity bug." : i.type === "bug" ? "Suggested: next release. Use a hotfix only for high-severity bugs." : "Suggested: next release.";
    const b = (x, cls) => x ? `<button class="btn ${cls}" data-act="schedule" data-arg="${i.id}|${x.v}"><span class="lbl">${x.label}</span><span class="progress"></span></button>` : "";
    return `<div class="wi-more"><p>${esc(i.evidence || "")}</p><p class="suggest">${svg("spark", 14)}${why}</p><div class="wi-acts">${b(first, "primary")}${b(second, "")}<button class="btn quiet" data-act="decline" data-arg="${i.id}"><span class="lbl">Decline</span></button></div></div>`;
  }
  function nextHotfix() { const c = S.evolve.current.split("."); return `${c[0]}.${c[1]}.${+c[2] + 1}`; }
  function stepOf(it, t) { if (PHASES.some((x) => x.id === t)) return t; const c = PHASES.find((x) => it.ph[x.id] === "active"); return c ? c.id : "ship"; }

  /* ------------------------------------------------ one change, one page */
  function changeView(it, s) {
    const d = S.evolve, vv = ver(it.ver), st = it.ph[s];
    const open = d.versions.filter(isOpen);
    const lower = d.versions.find((x) => (x.kind === "hotfix" || x.kind === "building") && x.v < it.ver);
    const stepper = `<nav class="stepper" aria-label="Steps for ${it.id}">${PHASES.map((ph) => `<button class="step ph-${ph.id} st-${it.ph[ph.id]}" data-step="${ph.id}" ${ph.id === s ? 'aria-current="step"' : ""}><span class="node"></span><span><b>${ph.name}</b><small>${it.ph[ph.id] === "skipped" ? "Skipped" : it.note[ph.id] || ""}</small></span></button>`).join("")}</nav>`;
    let primary = null, next = null, body = "";
    if (s === "define") {
      if (st === "active") { primary = { label: "Mark definition ready", act: "stepDone", arg: `${it.id}|define` }; next = { title: "Describe what changes", body: "Only requirements this change touches are listed. The rest stays collapsed." }; }
      else next = { title: "Defined. The agent uses these criteria as tests", cta: `Go to ${it.ph.design === "skipped" ? "Build" : "Design"}`, act: "gostep", arg: it.ph.design === "skipped" ? "build" : "design", icon: "check", tone: "ok" };
      body = (it.bug ? `<section class="card"><div class="card-h"><h2>Bug report</h2><span class="meta">found in ${d.current}</span></div><div class="pad"><div class="kv"><span>Steps</span><ol>${it.bug.steps.map((x) => `<li>${x}</li>`).join("")}</ol></div><div class="kv"><span>Expected</span><p>${it.bug.expected}</p></div><div class="kv"><span>Actual</span><p>${it.bug.actual}</p></div></div></section>` : "")
        + `<section class="card"><div class="card-h"><h2>${it.bug ? "Affected requirements" : "Requirement changes"}</h2><span class="meta">compared with ${d.current}</span></div><div class="rows">${(it.reqs || []).map(([id, t, dl, c]) => `<div class="lrow"><span class="rid">${id}</span><span class="lr-t"><b>${esc(t)}</b>${c ? `<span>New criterion: ${c}</span>` : ""}</span><span class="delta delta-${dl.toLowerCase()}">${dl}</span></div>`).join("") || `<div class="empty small">The agent is drafting requirement changes.</div>`}</div>${more("unchanged", "17 unchanged requirements", `<p class="muted">Browse them in ${d.current} on the timeline.</p>`)}</section>`;
    } else if (s === "design") {
      if (st === "skipped") { primary = { label: "Add a design step", act: "unskip", arg: it.id }; next = { title: "Bugs skip design by default", body: "Add a design step if the fix changes how components connect." }; }
      else if (st === "active") { primary = { label: "Approve design", act: "stepDone", arg: `${it.id}|design` }; next = { title: `${it.comps.length} components affected`, body: "Highlighted nodes change. Everything else stays as released." }; }
      body = canvas([it]);
    } else if (s === "build") {
      if (st === "active") { primary = { label: "Send for review", act: "stepDone", arg: `${it.id}|build`, disabled: !!(it.run && it.run.live), why: "Wait for the agent to finish" }; next = it.run && it.run.live ? { title: `The agent is working on ${it.branch}`, body: "Progress stays in the pill at the top, so you can leave this page.", icon: "branch" } : { title: "Review the changes", body: `Sending for review creates a preview and, once approved, merges into release/${it.ver}.`, icon: "check", tone: "ok" }; }
      else if (st === "todo") next = { title: "Build hasn't started", body: `The agent starts on ${it.branch} when the earlier steps are done.`, icon: "branch" };
      body = st === "todo" ? "" : `<section class="card"><div class="card-h"><h2>${svg("branch", 16)} ${it.branch}</h2><span class="meta">merges into release/${it.ver}</span></div>${it.run && it.run.live ? runRow(it.run, it.id) : ""}
        <div class="sub-h">Staged changes</div><div class="rows">${(it.staged || []).map((f) => `<div class="file ${f.fresh ? "fresh" : ""}"><span class="op op-${f.op}">${f.op.toUpperCase()}</span><code>${f.p}</code><span class="diffstat">${f.s}</span></div>`).join("") || `<div class="empty small">${st === "done" ? `Merged into release/${it.ver}.` : "Nothing staged yet."}</div>`}</div>
        <div class="sub-h">Tests</div><div class="rows">${(it.tests || []).map(([n, r]) => `<div class="chk ${r === "pass" ? "pass" : "todo"}"><span class="st">${r === "pass" ? svg("check", 14) : ""}</span><span class="lr-t"><b>${n}</b></span><span class="diffstat">${r === "pass" ? "Passing" : "Waiting for code"}</span></div>`).join("") || `<div class="empty small">Tests are generated from the acceptance criteria.</div>`}</div></section>`;
    } else {
      const ok = it.ph.build === "done";
      primary = { label: `Open release ${it.ver}`, act: "open", arg: `${it.ver}|ship`, icon: "tag" };
      next = ok ? { title: `Ships with ${it.ver}`, body: lower ? `${lower.v} goes out first, because versions release in order.` : `Release ${it.ver} from its Ship page.`, icon: "tag", tone: "ok" } : { title: `Not ready for ${it.ver} yet`, body: "If it's still open when the version is released, it moves to the next version automatically.", icon: "tag" };
      body = `<section class="card"><div class="card-h"><h2>Release checks</h2></div><div class="rows">${[["Tests pass on the branch", ok], [`Audit finds no regressions against ${d.current}`, ok], ["Review approved", ok]].map(([t, v]) => `<div class="chk ${v ? "pass" : "todo"}"><span class="st">${v ? svg("check", 14) : ""}</span><span class="lr-t"><b>${t}</b></span></div>`).join("")}</div>${ok ? `<div class="sub-h">Preview</div><div class="rows"><div class="lrow"><span class="lr-t"><b>${it.id.toLowerCase()}.preview.pronghorn.blue</b><span>Built from ${it.branch}</span></span><span class="linkchip ok">Ready</span></div></div>` : ""}</section>`;
    }
    const verSelect = `<label class="inline-select ver-move">Version <select data-move="${it.id}" aria-label="Move ${it.id} to another version">${open.map((x) => `<option value="${x.v}" ${x.v === it.ver ? "selected" : ""}>${x.v} · ${x.kind === "hotfix" ? "hotfix" : x.kind === "planned" ? "planned" : "next release"}</option>`).join("")}</select></label>`;
    const head = `<div class="phead"><div class="phead-t"><div class="crumb"><button class="crumb-link" data-ver="${it.ver}" data-go="${s}">${it.ver}</button> / ${it.id}</div><h1>${esc(it.title)}</h1></div><div class="primary-slot">${btn(primary)}</div></div>
      <div class="item-head">${typeChip(it.type)}<span class="wi-id">${it.id}</span>${it.sev ? `<span class="sev-chip">${it.sev} severity</span>` : ""}<span class="cb-branch">${svg("branch", 14)}${it.branch}</span><span class="muted">${esc(it.source)}</span>${verSelect}</div>`;
    return [`${head}${stepper}${banner(next)}${body}`, primary];
  }

  function stepAction(i, view) {
    const st = i.ph[view];
    if (st === "skipped") return `<button class="btn quiet" data-act="unskip" data-arg="${i.id}"><span class="lbl">Add design</span></button>`;
    if (st !== "active") return "";
    const label = { define: "Mark ready", design: "Approve", build: "Send for review", ship: "" }[view];
    if (!label) return "";
    return `<button class="btn" data-act="stepDone" data-arg="${i.id}|${view}" ${view === "build" && i.run && i.run.live ? "disabled title='Wait for the agent'" : ""}><span class="lbl">${label}</span><span class="progress"></span></button>`;
  }
  function runRow(r, id) { return `<div class="agent-run"><span class="dot run"></span><span class="lr-t"><b>Build agent</b><span data-run-detail="${id || "main"}">${r.detail}</span></span><span class="run-pct" data-run-pct="${id || "main"}">${r.pct}%</span><span class="meter"><i data-run-meter="${id || "main"}" style="width:${r.pct}%"></i></span></div>`; }

  function canvas(list) {
    const comps = new Set(list.flatMap((i) => (i.ph && i.ph.design !== "skipped") || list.length ? i.comps || [] : []));
    const newC = list.map((i) => i.newComp).filter(Boolean);
    const nodes = NODES.filter((n) => !n.proposed || newC.includes(n.id)), scoped = list.length > 0;
    const who = (id) => list.filter((i) => (i.comps || []).includes(id)).map((i) => i.id).join(" ");
    return `<section class="card"><div class="card-h"><h2>Architecture</h2><span class="meta">${scoped ? comps.size + " affected" : "5 components"}</span></div>
      <div class="canvas"><svg class="edges" aria-hidden="true">${EDGES.filter((e) => nodes.find((n) => n.id === e[0]) && nodes.find((n) => n.id === e[1])).map(([a, b]) => `<line data-a="${a}" data-b="${b}" class="${comps.has(a) && comps.has(b) ? "hot" : ""} ${NODES.find((n) => n.id === b).proposed ? "prop" : ""}"/>`).join("")}</svg>
      ${nodes.map((n) => { const hit = comps.has(n.id); return `<div id="cn-${n.id}" class="cnode ${hit ? "hit" : scoped ? "dim" : ""} ${n.proposed ? "proposed" : ""}" style="left:${narrow() ? n.mx : n.x}%;top:${narrow() ? n.my : n.y}%"><b>${n.name}</b><small>${n.kind}</small>${hit ? `<span class="cn-tag">${who(n.id)}</span>` : ""}</div>`; }).join("")}</div></section>`;
  }
  function drawEdges() {
    const c = $(".canvas"); if (!c) return; const box = c.getBoundingClientRect();
    $$(".edges line", c).forEach((l) => { const A = $("#cn-" + l.dataset.a).getBoundingClientRect(), B = $("#cn-" + l.dataset.b).getBoundingClientRect();
      l.setAttribute("x1", A.left + A.width / 2 - box.left); l.setAttribute("y1", A.top + A.height / 2 - box.top); l.setAttribute("x2", B.left + B.width / 2 - box.left); l.setAttribute("y2", B.top + B.height / 2 - box.top); });
  }
  let wasNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); render(); } else drawEdges(); });
  if (document.fonts) document.fonts.ready.then(drawEdges);

  /* ------------------------------------------------------------ new change */
  function newChange(target) {
    const d = S.evolve, open = d.versions.filter(isOpen);
    let t = null;
    const draw = () => {
      openSheet("New change", `<div class="field-l">What kind of change?</div><div class="types" role="radiogroup">${Object.entries(TYPES).map(([k, x]) => `<button role="radio" aria-checked="${t === k}" class="type-opt" data-type="${k}">${typeChip(k)}<b>${x.blurb.replace("in production ", "")}</b><span>${x.path}</span></button>`).join("")}</div>
        ${t ? `<label class="f">Title<input id="ncTitle"></label><label class="f">Version<select id="ncVer"><option value="">Not scheduled yet</option>${open.map((x) => `<option value="${x.v}" ${x.v === (target || (open.find((o) => o.kind === "building") || {}).v) ? "selected" : ""}>${x.v} · ${x.kind === "hotfix" ? "hotfix" : x.sub.toLowerCase()}</option>`).join("")}</select></label>` : ""}`,
        `<button class="btn quiet" data-close><span class="lbl">Cancel</span></button><button class="btn primary" id="ncCreate" ${t ? "" : "disabled"}><span class="lbl">Create change</span><span class="progress"></span></button>`);
      $$(".type-opt").forEach((b) => (b.onclick = () => { t = b.dataset.type; draw(); $("#ncTitle").focus(); }));
      const c = $("#ncCreate"); if (c) c.onclick = () => {
        const id = "WI-" + d.seq++, title = $("#ncTitle").value.trim() || `Untitled ${t}`, v = $("#ncVer").value || null;
        runButton(c, 500, "Created", () => {
          const it = { id, type: t, title, ver: v, source: "Created by you", evidence: "", fresh: true };
          if (v) Object.assign(it, startItem(it));
          d.items.unshift(it); setTimeout(() => (it.fresh = false), 1600); closeSheet();
          notify(`${id} created${v ? ` in ${v}` : ", not scheduled yet"}`, () => { d.items = d.items.filter((x) => x !== it); });
          go(v ? { r: v, v: "define", s: id } : { v: "versions", s: id });
        });
      };
    };
    draw();
  }
  function startItem(i) {
    return { ph: { define: "active", design: i.type === "bug" ? "skipped" : "todo", build: "todo", ship: "todo" }, note: { define: "Agent drafting", design: i.type === "bug" ? "Skipped" : "—", build: "—", ship: "—" }, branch: `${i.type === "bug" ? "fix" : "feat"}/${i.id.toLowerCase()}`, reqs: [], comps: ["api"] };
  }

  /* ----------------------------------------------------------------- agents */
  setInterval(() => {
    const p = P();
    const tick = (r, id, done) => { r.pct = Math.min(100, r.pct + 4); if (r.pct >= 100) { r.live = false; done(); return true; }
      const m = $(`[data-run-meter="${id}"]`); if (m) { m.style.width = r.pct + "%"; $(`[data-run-pct="${id}"]`).textContent = r.pct + "%"; } return false; };
    if (p.p === "building") { const a = S.build.agent; if (a.live && tick(a, "main", () => { S.build.staged.push({ p: "src/pages/Queue.test.tsx", op: "a", s: "+72" }); notify("The agent finished. 4 files are staged on main", null); })) return render(); }
    else { const it = S.evolve.items.find((i) => i.run && i.run.live); if (it && tick(it.run, it.id, () => { it.note.build = "Review 2 files"; if (it.staged) it.staged.push({ p: "src/api/heic.ts", op: "a", s: "+41", fresh: true }); (it.tests || []).forEach((x) => (x[1] = "pass")); notify(`${it.id}: the agent finished. Review the changes`, null); })) return render(); }
    renderChrome(p, P().r && ver(P().r) ? P().r : defaultVersion());
    const n = $(".phase.ph-build .ph-note"); if (n && p.p === "building") n.textContent = phaseState().build[1];
  }, 1000);

  /* ----------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    const demo = t.closest("[data-demo]"); if (demo) { if (demo.dataset.demo === "building") S.build = buildState(); else S.evolve = evolveState(false); return go({ p: demo.dataset.demo, r: "", v: "", t: "", s: "" }); }
    if (t.closest("[data-tl-toggle]")) { PK.store("tl.expanded", PK.store("tl.expanded") === "1" ? "0" : "1"); return render(); }
    const vb = t.closest("[data-ver]"); if (vb && !vb.disabled) { const cur = P().v; return go({ r: vb.dataset.ver, v: vb.dataset.go || (cur && cur !== "versions" && cur !== "settings" ? cur : "define"), t: "", s: "", w: "" }); }
    const it = t.closest("[data-item]"); if (it) { const i = S.evolve.items.find((x) => x.id === it.dataset.item); return go({ w: i.id, r: i.ver, t: stepOf(i, P().v), s: "" }); }
    const stp = t.closest("[data-step]"); if (stp) return go({ t: stp.dataset.step });
    const nav = t.closest("[data-nav]"); if (nav) return go({ v: nav.dataset.nav, t: "", s: "", w: "" });
    const tl = t.closest("[data-tool]"); if (tl) return go({ t: tl.dataset.tool });
    const tg = t.closest("[data-toggle]"); if (tg) return go({ s: P().s === tg.dataset.toggle ? "" : tg.dataset.toggle });
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });

  document.addEventListener("change", (e) => {
    const m = e.target.closest("[data-move]"); if (!m) return;
    const i = S.evolve.items.find((x) => x.id === m.dataset.move), from = i.ver, to = m.value;
    if (from === to) return;
    i.ver = to; notify(`${i.id} moved from ${from} to ${to}`, () => { i.ver = from; go({ r: from }); });
    go({ r: to });
  });

  function act(name, arg, el) {
    const B = S.build, d = S.evolve;
    switch (name) {
      case "noop": return runButton(el, 700, "Done");
      case "open": { const [v, view] = arg.split("|"); return go({ r: v, v: view, t: "", w: "" }); }
      case "gostep": return go({ t: arg });
      case "newChange": return newChange(arg);
      case "fixCheck": {
        const c = B.checks.find((x) => x.id === arg), row = $("#chk-" + arg); if (row) { row.className = "chk run"; row.querySelector(".st").textContent = ""; }
        return runButton(el, 1000, "Done", () => { c.ok = true; c.d = { criteria: "18 of 18 stories", audit: "Coverage is 93%", signoff: "Signed off just now" }[arg] || c.d; if (arg === "criteria") B.reqs.forEach((e) => e.stories.forEach((s) => (s[1] = true))); render(); });
      }
      case "commitMain": return runButton(el, 800, "Committed", () => { const prev = B.staged; B.staged = []; notify(`Committed ${prev.length} files to main`, () => { B.staged = prev; }); render(); });
      case "firstRelease": {
        if (!confirmStep(el, "Confirm: release v1.0.0")) return;
        return runButton(el, 1800, "Released", () => { S.evolve = evolveState(true); notify("v1.0.0 is released. New work now goes into versions", null); go({ p: "evolve", r: "", v: "versions", t: "", s: "" }); });
      }
      case "schedule": {
        const [id, v0] = arg.split("|"), i = d.items.find((x) => x.id === id);
        return runButton(el, 500, "Scheduled", () => {
          let v = v0;
          if (v === "hotfix") { v = nextHotfix(); const idx = d.versions.findIndex((x) => x.kind === "current"); d.versions.splice(idx + 1, 0, { v, kind: "hotfix", sub: "Hotfix" }); }
          const snap = JSON.stringify(i); Object.assign(i, { ver: v }, startItem(i), { fresh: true }); setTimeout(() => (i.fresh = false), 1600);
          notify(`${id} scheduled in ${v}`, () => { Object.keys(i).forEach((k) => delete i[k]); Object.assign(i, JSON.parse(snap)); });
          go({ s: "" });
        });
      }
      case "decline": { const i = d.items.find((x) => x.id === arg), idx = d.items.indexOf(i); d.items.splice(idx, 1); notify(`${i.id} declined`, () => d.items.splice(idx, 0, i)); return go({ s: "" }); }
      case "unskip": { const i = d.items.find((x) => x.id === arg); i.ph.design = "active"; i.note.design = "Added"; notify(`${i.id}: design step added`, () => { i.ph.design = "skipped"; i.note.design = "Skipped"; }); return render(); }
      case "stepDone": {
        const [id, ph] = arg.split("|"), i = d.items.find((x) => x.id === id), order = PHASES.map((x) => x.id);
        return runButton(el, 600, "Done", () => {
          const snap = JSON.stringify({ ph: i.ph, note: i.note });
          i.ph[ph] = "done"; i.note[ph] = { define: "Ready", design: "Approved", build: "Reviewed" }[ph];
          const nxt = order.slice(order.indexOf(ph) + 1).find((x) => i.ph[x] !== "skipped");
          if (nxt) { i.ph[nxt] = "active"; i.note[nxt] = nxt === "ship" ? "Ready" : "In progress"; if (nxt === "build") i.run = { pct: 6, live: true, detail: `Working on ${i.branch}` }; }
          notify(`${i.id}: ${PHASES.find((x) => x.id === ph).name} done`, () => { const s = JSON.parse(snap); i.ph = s.ph; i.note = s.note; if (nxt === "build") i.run = null; });
          if (P().w === i.id && nxt) go({ t: nxt }); else render();
        });
      }
      case "release": {
        if (!confirmStep(el, `Confirm: release ${arg}`)) return;
        return runButton(el, 1400, "Released", () => {
          const snap = JSON.stringify(d), list = itemsIn(arg), ready = list.filter((i) => i.ph.build === "done"), rest = list.filter((i) => i.ph.build !== "done");
          d.versions.forEach((x) => { if (x.kind === "current") { x.kind = "hist"; x.sub = "Released"; } });
          const vv = ver(arg); vv.kind = "current"; vv.sub = "Current release"; d.current = arg;
          ready.forEach((i) => { i.shipped = true; i.ph.ship = "done"; });
          let nextOpen = d.versions.find((x) => isOpen(x));
          if (!nextOpen) { const parts = arg.split("."); nextOpen = { v: `${parts[0]}.${+parts[1] + 1}.0`, kind: "planned", sub: "Next release" }; d.versions.push(nextOpen); }
          if (nextOpen.kind === "planned") { nextOpen.kind = "building"; nextOpen.sub = "Next release"; }
          rest.forEach((i) => (i.ver = nextOpen.v));
          notify(`${arg} released with ${ready.length} ${ready.length > 1 ? "changes" : "change"}${rest.length ? `. ${rest.map((i) => i.id).join(", ")} moved to ${nextOpen.v}` : ""}`, () => { S.evolve = JSON.parse(snap); });
          go({ r: nextOpen.v, v: "versions" });
        });
      }
    }
  }

  render();
})();

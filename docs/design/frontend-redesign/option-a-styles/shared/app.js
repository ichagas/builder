/*
 * Pronghorn · Option A · Lifecycle Rail + Evolve loop
 * Shared UX layer: markup, routing, state and behaviour are identical for every
 * visual style. Each style page only supplies its own CSS on top of base.css.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = "pa." + (document.body.dataset.style || "x") + ".";
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(NS + k); localStorage.setItem(NS + k, v); }
    catch (e) { return null; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const now = () => new Date().toTimeString().slice(0, 5);

  const IC = {
    work: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    live: '<path d="M3 12h4l3 7 4-14 3 7h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-4 4.5-9.5 5.5"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
    spark: '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V4M8 11H4M16 11h4M8 16H5M16 16h3M9 5l-1-2M15 5l1-2"/>',
    rocket: '<path d="M12 2c4 3 5 7 4 12l-4 3-4-3c-1-5 0-9 4-12z"/><circle cx="12" cy="9" r="1.5"/>',
  };
  const svg = (k, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

  /* ------------------------------------------------------------------ model */
  const PHASES = [
    { id: "define", name: "Define", tools: [["requirements", "Requirements"], ["standards", "Standards"], ["artifacts", "Artifacts"], ["chat", "Chat"]] },
    { id: "design", name: "Design", tools: [["canvas", "Canvas"], ["specifications", "Specifications"]] },
    { id: "build", name: "Build", tools: [["agent", "Agent"], ["repository", "Repository"], ["database", "Database"]] },
    { id: "ship", name: "Ship", tools: [["release", "Release"], ["environments", "Environments"], ["audit", "Audit"]] },
  ];
  const TYPES = {
    bug: { label: "Bug", blurb: "Something that was released is broken", path: "Define → Build → Ship. Design is optional." },
    enhancement: { label: "Enhancement", blurb: "Improve something users already have", path: "Define → Design → Build → Ship" },
    feature: { label: "Feature", blurb: "Add something new", path: "Define → Design → Build → Ship" },
  };
  const NODES = [
    { id: "web", name: "Applicant web", kind: "React", x: 4, y: 10 },
    { id: "case", name: "Caseworker app", kind: "React", x: 64, y: 10 },
    { id: "api", name: "Intake API", kind: "Express", x: 34, y: 42 },
    { id: "db", name: "Applicants DB", kind: "Postgres", x: 6, y: 74 },
    { id: "docs", name: "Document store", kind: "Azure Blob", x: 62, y: 74 },
    { id: "drafts", name: "Draft store", kind: "Postgres table", x: 36, y: 80, proposed: true },
  ];
  const EDGES = [["web", "api"], ["case", "api"], ["api", "db"], ["api", "docs"], ["api", "drafts"]];

  const S = {
    prod: { version: "v1.4.2", deployed: "6 days ago", prev: "v1.4.1" },
    next: "v1.5.0",
    test: "v1.5.0-rc.2",
    seq: 48,
    items: [
      {
        id: "WI-42", type: "bug", title: "Photo upload fails for iPhone HEIC images", sev: "High", status: "active",
        source: "Reported by the help desk",
        ph: { define: "done", design: "skipped", build: "active", ship: "todo" },
        note: { define: "Reproduced", design: "Skipped for bug", build: "Agent fixing", ship: "Not started" },
        branch: "fix/wi-42-heic",
        reqs: [{ id: "S3", title: "As an applicant I upload ID from my phone", delta: "Regression" }],
        comps: ["docs", "api"],
        staged: [{ p: "src/api/upload.ts", op: "m", s: "+24 −3" }],
        tests: [{ n: "converts HEIC photos to JPEG", st: "pending" }, { n: "rejects files over 10 MB", st: "pass" }],
        run: { pct: 52, live: true, detail: "Adding HEIC conversion to the upload handler" },
        bug: {
          steps: ["Open Apply on an iPhone (iOS 17)", "Choose a photo from the library", "Select Upload"],
          expected: "The photo uploads and shows a preview", actual: "“File type not supported”", env: "v1.4.2 · Safari on iOS 17",
        },
      },
      {
        id: "WI-40", type: "bug", title: "Caseworker queue sorts by name, not priority", sev: "Medium", status: "active",
        source: "Reported by the caseworker team",
        ph: { define: "done", design: "skipped", build: "done", ship: "active" },
        note: { define: "Done", design: "Skipped for bug", build: "Reviewed", ship: "Preview ready" },
        branch: "fix/wi-40-queue-sort", preview: "wi-40.preview.pronghorn.blue",
        reqs: [{ id: "F3", title: "Priority scoring", delta: "Regression" }], comps: ["case"],
        staged: [], tests: [{ n: "queue orders by priority score", st: "pass" }],
        checks: { tests: true, audit: true, review: true },
      },
      {
        id: "WI-38", type: "feature", title: "Applicants can save a draft and return later", status: "active",
        source: "Requested by the program area",
        ph: { define: "done", design: "active", build: "todo", ship: "todo" },
        note: { define: "3 new stories", design: "1 component to add", build: "Waiting on design", ship: "Not started" },
        branch: "feat/wi-38-drafts",
        reqs: [
          { id: "S5", title: "As an applicant I save my application as a draft", delta: "New" },
          { id: "S6", title: "As an applicant I resume a draft from a link in my email", delta: "New" },
          { id: "S7", title: "Drafts are deleted after 30 days", delta: "New" },
          { id: "S1", title: "As an applicant I answer 5 screening questions", delta: "Changed" },
        ],
        comps: ["web", "api", "drafts"], newComp: "drafts", staged: [], tests: [],
      },
      {
        id: "WI-45", type: "enhancement", title: "Show the eligibility result faster", status: "triage",
        source: "Requested by the caseworker lead",
        evidence: "Applicants wait about 3 seconds for the eligibility result. The target in the spec is under 1 second.",
      },
      {
        id: "WI-36", type: "feature", title: "French language support", status: "shipped", shippedIn: "v1.4.2", source: "Ministry request",
        ph: { define: "done", design: "done", build: "done", ship: "done" }, note: {},
      },
    ],
    baseReqs: [
      { title: "Applicant can apply online", stories: ["Answer 5 screening questions", "See why I'm not eligible", "Upload ID from my phone", "Get a confirmation email"] },
      { title: "Caseworker triage queue", stories: ["Queue ordered by priority score", "Assign an application", "Request more documents"] },
      { title: "Bilingual service", stories: ["Switch the interface to French", "Receive emails in my language"] },
    ],
    runs: [],
  };

  const byId = (id) => S.items.find((i) => i.id === id);
  const activeItems = () => S.items.filter((i) => i.status === "active");
  const readyItems = () => S.items.filter((i) => i.status === "active" && i.release === S.next);

  /* ---------------------------------------------------------------- routing */
  function P() {
    const q = new URLSearchParams(location.hash.slice(1));
    return { v: q.get("v") || "work", t: q.get("t"), w: q.get("w"), s: q.get("s"), f: q.get("f") || "all" };
  }
  function go(patch) {
    const n = Object.assign(P(), patch);
    const q = new URLSearchParams();
    ["v", "t", "w", "s", "f"].forEach((k) => { if (n[k] && !(k === "f" && n[k] === "all")) q.set(k, n[k]); });
    const h = "#" + q.toString();
    if (location.hash === h) render(); else location.hash = h;
  }
  window.addEventListener("hashchange", render);

  /* ------------------------------------------------------------------ shell */
  document.body.insertAdjacentHTML("afterbegin", `
    <a class="skip" href="#page">Skip to content</a>
    <header class="gbar">
      <div class="brand"><span class="logo" aria-hidden="true">P</span><span class="brand-name">Pronghorn</span></div>
      <button class="switcher" aria-label="Switch project"><span class="sw-name">Benefits Intake Portal</span>${svg("down", 14)}</button>
      <div class="search" role="search">${svg("search", 16)}<span>Search work items, files, requirements</span><kbd>⌘K</kbd></div>
      <div class="spacer"></div>
      <button class="pill health" data-act="nav" data-arg="ship|release|base" id="healthPill"></button>
      <button class="pill agent" id="agentPill" aria-expanded="false" aria-controls="statusPop"></button>
      <button class="avatar" data-nav="settings" aria-label="Account and project settings">IC</button>
    </header>
    <div class="ctxbar" id="ctxbar" hidden></div>
    <div class="pop" id="statusPop" hidden><div class="pop-h">Running and recent</div><div id="runList"></div></div>
    <nav class="rail" id="rail" aria-label="Project"></nav>
    <main id="main"><div class="wrap"><div id="page" tabindex="-1"></div></div></main>
    <div class="m-action" id="mAction"></div>
    <nav class="tabbar" id="tabbar" aria-label="Project"></nav>
    <div class="undo" id="undo" role="status" aria-live="polite"><span id="undoText"></span><button id="undoBtn">Undo</button></div>
    <div id="sheetRoot"></div>
  `);

  /* ----------------------------------------------------------------- pieces */
  function btn(p, cls = "primary") {
    if (!p) return "";
    return `<button class="btn ${cls}" data-act="${p.act}" ${p.arg ? `data-arg="${p.arg}"` : ""} ${p.disabled ? "disabled" : ""} ${p.why ? `title="${esc(p.why)}"` : ""}><span class="lbl">${p.label}</span><span class="progress"></span></button>`;
  }
  const typeChip = (t) => `<span class="type type-${t}">${TYPES[t].label}</span>`;
  function track(it) {
    if (!it.ph) return `<span class="track track-empty">Not triaged</span>`;
    return `<span class="track" aria-label="Progress: ${PHASES.map((p) => `${p.name} ${it.ph[p.id]}`).join(", ")}">${PHASES.map((p) => `<i class="seg s-${it.ph[p.id]}" title="${p.name}: ${it.ph[p.id]}"></i>`).join("")}</span>`;
  }
  const deltaChip = (d) => `<span class="delta delta-${d.toLowerCase()}">${d}</span>`;
  function banner(n) {
    if (!n) return "";
    return `<div class="next ${n.tone ? "tone-" + n.tone : ""}"><span class="next-ic">${svg(n.icon || "spark", 18)}</span><div class="next-t"><b>${n.title}</b><span>${n.body}</span></div>${n.cta ? `<button class="btn" data-act="${n.act}" ${n.arg ? `data-arg="${n.arg}"` : ""}><span class="lbl">${n.cta}</span><span class="progress"></span></button>` : ""}</div>`;
  }
  function more(key, summary, inner, defOpen) {
    const open = store("open." + key); const isOpen = open === null ? !!defOpen : open === "1";
    return `<details class="more" data-pref="open.${key}" ${isOpen ? "open" : ""}><summary>${svg("chev", 14)}${summary}</summary><div class="more-in">${inner}</div></details>`;
  }
  function header(crumb, title, primary) {
    return `<div class="phead"><div class="phead-t"><div class="crumb">${crumb}</div><h1>${title}</h1></div><div class="primary-slot">${btn(primary)}</div></div>`;
  }

  /* ------------------------------------------------------------------ rail */
  function renderRail(p, item) {
    const inPhase = PHASES.some((x) => x.id === p.v);
    const openCount = S.items.filter((i) => i.status !== "shipped").length;
    const ctxLabel = item ? `${typeChip(item.type)}<span class="ctx-name"><b>${item.id}</b> ${esc(item.title)}</span>` : `<span class="type type-base">Baseline</span><span class="ctx-name"><b>${S.prod.version}</b> released</span>`;
    $("#rail").innerHTML = `
      <div class="rail-top">
        <button class="rail-item" data-nav="work" ${p.v === "work" ? 'aria-current="page"' : ""}>${svg("work")}<span class="ri-t">Work</span><span class="n">${openCount}</span></button>
      </div>
      <div class="rail-ctx">
        <div class="rail-label">Working on</div>
        <button class="ctx-switch" id="ctxSwitch" aria-expanded="false" aria-haspopup="listbox">${ctxLabel}${svg("down", 14)}</button>
        <div class="ctx-menu" id="ctxMenu" role="listbox" hidden>
          <button role="option" data-ctx="" ${!item ? 'aria-selected="true"' : ""}><span class="type type-base">Baseline</span><span>${S.prod.version} released</span></button>
          ${activeItems().map((i) => `<button role="option" data-ctx="${i.id}" ${item && item.id === i.id ? 'aria-selected="true"' : ""}>${typeChip(i.type)}<span><b>${i.id}</b> ${esc(i.title)}</span></button>`).join("")}
        </div>
      </div>
      <div class="journey">
        ${PHASES.map((ph) => {
          const st = item ? item.ph[ph.id] : "base";
          const note = item ? item.note[ph.id] || "" : baseNote(ph.id);
          return `<button class="phase ph-${ph.id} st-${st}" data-phase="${ph.id}" ${inPhase && p.v === ph.id ? 'aria-current="page"' : ""}>
            <span class="node" aria-hidden="true"></span><span class="ph-txt"><span class="ph-name">${ph.name}</span><span class="ph-note">${note}</span></span></button>`;
        }).join("")}
      </div>
      <div class="rail-foot">
        <button class="rail-item quiet" data-nav="settings">${svg("gear")}<span class="ri-t">Project settings</span></button>
        <button class="rail-item quiet" id="collapse" aria-pressed="false">${svg("left")}<span class="ri-t">Collapse</span></button>
      </div>`;
  }
  function baseNote(id) {
    return { define: "18 requirements", design: "5 components", build: "main is protected", ship: `${S.prod.version} released` }[id];
  }

  function renderCtx(item) {
    const bar = $("#ctxbar");
    if (!item) { bar.hidden = true; document.body.classList.remove("has-ctx"); return; }
    bar.hidden = false; document.body.classList.add("has-ctx");
    bar.innerHTML = `${typeChip(item.type)}<span class="cb-id">${item.id}</span><span class="cb-title">${esc(item.title)}</span>
      ${item.branch ? `<span class="cb-branch">${svg("branch", 14)}${item.branch}</span>` : ""}${track(item)}
      <button class="cb-exit" data-ctx="">${svg("x", 14)}<span>Back to baseline</span></button>`;
  }

  function renderTabbar(p) {
    $("#tabbar").innerHTML =
      `<button data-nav="work" ${p.v === "work" ? 'aria-current="page"' : ""}>${svg("work", 22)}<span>Work</span></button>` +
      PHASES.map((ph) => {
        const item = p.w ? byId(p.w) : null; const st = item ? item.ph[ph.id] : "base";
        return `<button class="ph-${ph.id} st-${st}" data-phase="${ph.id}" ${p.v === ph.id ? 'aria-current="page"' : ""}><span class="node" aria-hidden="true"></span><span>${ph.name}</span></button>`;
      }).join("");
  }

  function renderPills() {
    $("#healthPill").innerHTML = `<span class="dot ok"></span><span class="pl-long">Released ${S.prod.version}</span><span class="pl-short">${S.prod.version}</span>`;
    $("#healthPill").setAttribute("aria-label", `Current release ${S.prod.version}. Open releases.`);
    const live = S.items.filter((i) => i.run && i.run.live);
    const pill = $("#agentPill");
    pill.innerHTML = live.length ? `<span class="dot run"></span><span class="pl-long">${live[0].id} agent · ${live[0].run.pct}%</span><span class="pl-short">${live[0].run.pct}%</span>` : `<span class="dot ok"></span><span class="pl-long">Agents idle</span><span class="pl-short">Idle</span>`;
    const rows = [
      ...live.map((i) => ({ t: `${i.id} build agent`, d: i.run.detail, pct: i.run.pct, live: true })),
      ...S.runs,
    ];
    $("#runList").innerHTML = rows.length ? rows.map((r) => `<div class="run-row"><span class="dot ${r.live ? "run" : "ok"}"></span><div><b>${r.t}</b><span>${r.d}</span></div><span class="run-pct">${r.live ? r.pct + "%" : "Done"}</span>${r.live ? `<span class="meter"><i style="width:${r.pct}%"></i></span>` : ""}</div>`).join("") : `<div class="run-row"><div><span>Nothing running.</span></div></div>`;
  }

  /* ------------------------------------------------------------------ pages */
  function render() {
    const p = P();
    const item = p.w ? byId(p.w) : null;
    if (p.w && !item) return go({ w: null });
    document.body.dataset.view = p.v;
    renderRail(p, item); renderCtx(item); renderTabbar(p); renderPills();
    applyCollapse();
    let html = "", primary = null;
    if (p.v === "work") [html, primary] = workView(p);
    else if (p.v === "settings") [html, primary] = settingsView();
    else [html, primary] = phaseView(p, item);
    $("#page").innerHTML = html;
    $("#mAction").innerHTML = btn(primary);
    document.body.classList.toggle("has-maction", !!primary);
    drawEdges();
  }
  function drawEdges() {
    const c = $(".canvas"); if (!c) return;
    const box = c.getBoundingClientRect();
    $$(".edges line", c).forEach((l) => {
      const A = $("#cn-" + l.dataset.a).getBoundingClientRect(), B = $("#cn-" + l.dataset.b).getBoundingClientRect();
      l.setAttribute("x1", A.left + A.width / 2 - box.left); l.setAttribute("y1", A.top + A.height / 2 - box.top);
      l.setAttribute("x2", B.left + B.width / 2 - box.left); l.setAttribute("y2", B.top + B.height / 2 - box.top);
    });
  }
  window.addEventListener("resize", drawEdges);
  if (document.fonts) document.fonts.ready.then(drawEdges);

  /* --- Work ---------------------------------------------------------------- */
  function workView(p) {
    const f = p.f;
    const match = (i) => f === "all" || i.type === f;
    const groups = [
      ["Needs triage", S.items.filter((i) => i.status === "triage" && match(i)), "triage"],
      ["In progress", S.items.filter((i) => i.status === "active" && i.release !== S.next && match(i)), "prog"],
      [`In release ${S.next}`, S.items.filter((i) => i.status === "active" && i.release === S.next && match(i)), "rel"],
      ["Shipped", S.items.filter((i) => i.status === "shipped" && match(i)), "done"],
    ];
    const count = (t) => S.items.filter((i) => i.status !== "shipped" && (t === "all" || i.type === t)).length;
    const triage = S.items.filter((i) => i.status === "triage");
    const n = triage.length
      ? { title: `${triage.length} ${triage.length > 1 ? "items need" : "item needs"} triage`, body: "Accepted items get a branch and start in Define. Nothing is released without going through Ship.", cta: "Triage the first one", act: "openTriage", arg: triage[0].id, icon: "spark" }
      : readyItems().length ? { title: `${readyItems().length} ${readyItems().length > 1 ? "items are" : "item is"} ready for ${S.next}`, body: "Review the release notes and deploy when you're ready.", cta: "Open release", act: "nav", arg: "ship|release", icon: "rocket" }
      : null;
    const html = `
      ${header(`Benefits Intake Portal · released ${S.prod.version}`, "Work", null)}
      <div class="filters" role="tablist" aria-label="Filter by type">
        ${[["all", "All"], ["bug", "Bugs"], ["enhancement", "Enhancements"], ["feature", "Features"]].map(([k, l]) => `<button class="chip" role="tab" aria-selected="${f === k}" data-filter="${k}">${l}<span class="n">${count(k)}</span></button>`).join("")}
      </div>
      ${banner(n)}
      ${groups.filter((g) => g[1].length).map(([name, list, key]) => `
        <section class="card group g-${key}"><div class="card-h"><h2>${name}</h2><span class="meta">${list.length}</span></div>
          <div class="rows">${list.map((i) => workRow(i, p)).join("")}</div></section>`).join("") || `<div class="card empty"><b>No ${f}s open</b><span>Everything of this type has shipped.</span></div>`}`;
    return [html, { label: "New work item", act: "newItem" }];
  }
  function workRow(i, p) {
    const open = p.s === i.id;
    if (i.status === "triage") {
      return `<div class="wi wi-triage ${open ? "is-open" : ""} ${i.fresh ? "fresh" : ""}" id="row-${i.id}">
        <button class="wi-main" data-toggle="${i.id}" aria-expanded="${open}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="wi-t"><b>${esc(i.title)}</b><span>${esc(i.source)}</span></span>${track(i)}<span class="wi-go">${svg("down", 16)}</span></button>
        ${open ? `<div class="wi-more"><p>${esc(i.evidence || "")}</p>
          <div class="wi-acts"><button class="btn primary" data-act="accept" data-arg="${i.id}"><span class="lbl">Accept as ${TYPES[i.type].label.toLowerCase()}</span><span class="progress"></span></button>
          <label class="inline-select">Type <select data-retype="${i.id}">${Object.keys(TYPES).map((k) => `<option value="${k}" ${k === i.type ? "selected" : ""}>${TYPES[k].label}</option>`).join("")}</select></label>
          <button class="btn quiet" data-act="decline" data-arg="${i.id}"><span class="lbl">Decline</span></button></div></div>` : ""}
      </div>`;
    }
    const cur = i.ph ? PHASES.find((ph) => i.ph[ph.id] === "active") : null;
    const status = i.status === "shipped" ? `Shipped in ${i.shippedIn}` : i.release === S.next ? `Ready · ${S.next}` : cur ? `${cur.name}: ${i.note[cur.id]}` : "";
    return `<div class="wi ${i.fresh ? "fresh" : ""}" id="row-${i.id}">
      <button class="wi-main" data-open="${i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="wi-t"><b>${esc(i.title)}</b><span>${esc(i.source)}${i.sev ? ` · ${i.sev} severity` : ""}</span></span>${track(i)}<span class="wi-status">${status}</span><span class="wi-go">${svg("chev", 16)}</span></button>
    </div>`;
  }

  function statusWord(i) {
    if (!i) return "";
    if (i.status === "triage") return "In triage";
    if (i.status === "shipped") return "Shipped";
    if (i.release === S.next) return "Ready";
    const cur = PHASES.find((ph) => i.ph[ph.id] === "active");
    return cur ? cur.name + (cur.id === "build" ? "ing" : "") : "Open";
  }

  /* --- Phases -------------------------------------------------------------- */
  function phaseView(p, item) {
    const phase = PHASES.find((x) => x.id === p.v) || PHASES[0];
    const tool = phase.tools.some((t) => t[0] === p.t) ? p.t : phase.tools[0][0];
    const toolName = phase.tools.find((t) => t[0] === tool)[1];
    const crumb = item ? `${item.id} · ${phase.name}` : `Baseline ${S.prod.version} · ${phase.name}`;
    const primary = primaryFor(phase.id, tool, item);
    const tabs = `<div class="tools" role="tablist" aria-label="${phase.name} tools">${phase.tools.map(([id, l]) => `<button class="tool" role="tab" aria-selected="${id === tool}" data-tool="${id}">${l}${badge(phase.id, id, item)}</button>`).join("")}</div>`;
    const body = (CONTENT[phase.id + "." + tool] || placeholder)(item, phase, toolName);
    return [`${header(crumb, toolName, primary)}${tabs}${banner(nextFor(phase.id, item))}${body}`, primary];
  }
  function badge(ph, tool, item) {
    if (item && ph === "define" && tool === "requirements") return `<span class="n">${item.reqs ? item.reqs.length : 0}</span>`;
    if (item && ph === "build" && tool === "agent" && item.staged && item.staged.length) return `<span class="n">${item.staged.length}</span>`;
    if (!item && ph === "ship" && tool === "release" && readyItems().length) return `<span class="n">${readyItems().length}</span>`;
    return "";
  }
  function primaryFor(ph, tool, item) {
    if (!item) {
      if (ph === "ship" && tool === "release") return { label: `Release ${S.next}`, act: "deployProd", disabled: !readyItems().length, why: "Add at least one work item to the release first" };
      return { label: "New work item", act: "newItem" };
    }
    if (item.status === "shipped") return null;
    const st = item.ph[ph];
    if (ph === "define") return st === "done" ? null : { label: "Mark definition ready", act: "phaseDone", arg: "define" };
    if (ph === "design") return st === "skipped" ? { label: "Add a design step", act: "unskip" } : st === "done" ? null : { label: "Approve design", act: "phaseDone", arg: "design", disabled: st !== "active" };
    if (ph === "build") return st === "done" ? null : { label: "Send for review", act: "phaseDone", arg: "build", disabled: st !== "active" || (item.run && item.run.live), why: "Wait for the agent to finish" };
    if (ph === "ship") return item.release === S.next ? { label: "Open release", act: "nav", arg: "ship|release|base" } : { label: `Add to ${S.next}`, act: "addRelease", disabled: item.ph.build !== "done", why: "Build must be reviewed first" };
    return null;
  }
  function nextFor(ph, item) {
    if (!item) {
      if (ph === "ship") return readyItems().length ? { title: `${S.next} has ${readyItems().length} ready ${readyItems().length > 1 ? "items" : "item"}`, body: "Releasing merges each branch into main, tags the version and deploys it with your deployment settings.", icon: "rocket" } : { title: `Nothing is ready for ${S.next} yet`, body: "Items join the release from their Ship step once review passes.", icon: "rocket" };
      return { title: `You're viewing ${S.prod.version}, the released baseline`, body: "Main is locked after the first release. To change anything, start or open a work item. It gets its own branch and preview.", cta: "New work item", act: "newItem", icon: "lock" };
    }
    const st = item.ph[ph];
    if (item.status === "shipped") return { title: `Shipped in ${item.shippedIn}`, body: "This item is read-only. Start a new work item to change it again.", icon: "check", tone: "ok" };
    if (ph === "define") return st === "done" ? { title: item.type === "bug" ? "Bug reproduced and linked to its requirement" : "Requirement changes are defined", body: "The agent will use these as the tests for this change.", cta: `Go to ${item.ph.design === "skipped" ? "Build" : "Design"}`, act: "nav", arg: item.ph.design === "skipped" ? "build" : "design", icon: "check", tone: "ok" } : { title: "Describe what should change", body: "Add or edit requirements. Unchanged ones stay collapsed below.", icon: "spark" };
    if (ph === "design") return st === "skipped" ? { title: "Bugs skip design by default", body: "Add a design step if the fix changes how components connect or adds a new one.", icon: "spark" } : st === "active" ? { title: `${item.comps.length} components affected, 1 new`, body: "Highlighted nodes change in this item. Everything else is the baseline and stays as it is.", icon: "spark" } : st === "todo" ? { title: "Design starts after Define", body: "", icon: "spark" } : null;
    if (ph === "build") {
      if (st === "todo") return { title: `Build starts after ${item.ph.design === "active" ? "design is approved" : "definition is ready"}`, body: `The agent works on ${item.branch}, never on main.`, cta: item.ph.design === "active" ? "Go to Design" : null, act: "nav", arg: "design", icon: "branch" };
      if (st === "done") return { title: "Reviewed and ready to ship", body: "Add it to the next release from Ship.", cta: "Go to Ship", act: "nav", arg: "ship", icon: "check", tone: "ok" };
      return item.run && item.run.live ? { title: `The agent is working on ${item.branch}`, body: "You can leave this page. Progress stays in the status pill at the top.", icon: "branch" } : { title: "The agent finished. Review what changed", body: "Each file below shows its diff. Send for review when the tests pass.", icon: "check", tone: "ok" };
    }
    if (ph === "ship") return item.release === S.next ? { title: `Included in ${S.next}`, body: "It goes out with the next release, together with the other ready items.", icon: "rocket", tone: "ok" } : item.ph.build === "done" ? { title: `Preview is live at ${item.preview || item.id.toLowerCase() + ".preview.pronghorn.blue"}`, body: "All checks passed. Add it to the next release.", icon: "rocket" } : { title: "Ship opens after review", body: "Each work item gets a preview environment when it's sent for review.", icon: "rocket" };
  }

  function placeholder(item, phase, toolName) {
    return `<section class="card empty"><b>${toolName} goes here</b><span>The existing ${toolName} page mounts inside the shell${item ? `, filtered to what ${item.id} changes` : ""}. This prototype focuses on navigation and the change loop after release.</span></section>`;
  }

  const CONTENT = {
    "define.requirements": (item) => {
      if (!item) return `<section class="card"><div class="card-h"><h2>Requirements in ${S.prod.version}</h2><span class="meta">18 stories · all have criteria</span></div>
        ${S.baseReqs.map((e, k) => more("base-epic-" + k, `<span class="kind">Epic</span><b>${e.title}</b><span class="meta">${e.stories.length}</span>`, `<ul class="plain">${e.stories.map((s) => `<li>${s}</li>`).join("")}</ul>`, k === 0)).join("")}</section>`;
      let out = "";
      if (item.bug) out += `<section class="card"><div class="card-h"><h2>Bug report</h2><span class="meta">${item.bug.env}</span></div><div class="pad">
        <div class="kv"><span>Steps</span><ol>${item.bug.steps.map((s) => `<li>${s}</li>`).join("")}</ol></div>
        <div class="kv"><span>Expected</span><p>${item.bug.expected}</p></div>
        <div class="kv"><span>Actual</span><p>${item.bug.actual}</p></div>
</div></section>`;
      if (item.evidence && !item.bug) out += `<section class="card"><div class="pad"><p class="lede">${esc(item.evidence)}</p></div></section>`;
      out += `<section class="card"><div class="card-h"><h2>${item.bug ? "Affected requirements" : "Requirement changes"}</h2><span class="meta">Compared with ${S.prod.version}</span></div>
        <div class="rows">${(item.reqs || []).map((r) => `<div class="lrow"><span class="rid">${r.id}</span><span class="lr-t"><b>${esc(r.title)}</b>${r.delta === "Regression" ? `<span>New criterion: ${item.id === "WI-42" ? "HEIC photos convert to JPEG and upload" : "Queue is ordered by priority score, then date"}</span>` : ""}</span>${deltaChip(r.delta)}</div>`).join("") || `<div class="empty"><b>No requirement changes yet</b></div>`}</div>
        ${more("unchanged", `${18 - (item.reqs || []).filter((r) => r.delta !== "New").length} unchanged requirements`, `<ul class="plain muted">${S.baseReqs.flatMap((e) => e.stories).slice(0, 6).map((s) => `<li>${s}</li>`).join("")}<li>…</li></ul>`)}</section>`;
      return out;
    },
    "design.canvas": (item) => {
      const skipped = item && item.ph.design === "skipped";
      const nodes = NODES.filter((n) => !n.proposed || (item && item.newComp === n.id));
      return `<section class="card"><div class="card-h"><h2>Architecture</h2><span class="meta">${item ? (skipped ? "Read-only · design skipped" : `${item.comps.length} affected`) : `${S.prod.version} baseline`}</span></div>
        <div class="canvas ${item ? "scoped" : ""} ${skipped ? "is-skipped" : ""}">
          <svg class="edges" aria-hidden="true">${EDGES.filter((e) => nodes.find((n) => n.id === e[0]) && nodes.find((n) => n.id === e[1])).map(([a, b]) => `<line data-a="${a}" data-b="${b}" class="${item && item.comps.includes(a) && item.comps.includes(b) ? "hot" : ""} ${NODES.find((n) => n.id === b).proposed ? "prop" : ""}"/>`).join("")}</svg>
          ${nodes.map((n) => { const hit = item && item.comps.includes(n.id); return `<div id="cn-${n.id}" class="cnode ${hit ? "hit" : item ? "dim" : ""} ${n.proposed ? "proposed" : ""}" style="left:${n.x}%;top:${n.y}%"><b>${n.name}</b><small>${n.kind}</small>${hit ? `<span class="cn-tag">${n.proposed ? "New" : "Changes"}</span>` : ""}</div>`; }).join("")}
        </div></section>`;
    },
    "build.agent": (item) => {
      if (!item) return `<section class="card"><div class="card-h"><h2>${svg("lock", 16)} main</h2><span class="meta">Protected · last commit 6 days ago</span></div>
        <div class="rows">${activeItems().map((i) => `<div class="lrow"><button class="wi-main" data-open="${i.id}" data-to="build">${typeChip(i.type)}<span class="lr-t"><b>${i.branch}</b><span>${i.id} · ${esc(i.title)}</span></span><span class="wi-status">${statusWord(i)}</span>${svg("chev", 16)}</button></div>`).join("")}</div></section>`;
      if (item.ph.build === "todo") return `<section class="card empty"><b>Build hasn't started</b><span>The agent starts on ${item.branch} as soon as ${item.ph.design === "active" ? "design is approved" : "the definition is ready"}. It never commits to main.</span></section>`;
      const r = item.run;
      return `<section class="card"><div class="card-h"><h2>${svg("branch", 16)} ${item.branch}</h2><span class="meta">from main @ ${S.prod.version}</span></div>
        ${r && r.live ? `<div class="agent-run"><span class="dot run"></span><span class="lr-t"><b>Build agent</b><span id="runDetail">${r.detail}</span></span><span class="run-pct" id="runPct">${r.pct}%</span><span class="meter"><i id="runMeter" style="width:${r.pct}%"></i></span></div>` : ""}
        <div class="sub-h">Staged changes</div>
        <div class="rows">${item.staged.length ? item.staged.map((f) => `<div class="file ${f.fresh ? "fresh" : ""}"><span class="op op-${f.op}">${f.op.toUpperCase()}</span><code>${f.p}</code><span class="diffstat">${f.s}</span></div>`).join("") : `<div class="empty small">No changes staged.</div>`}</div>
        <div class="sub-h">Tests</div>
        <div class="rows">${item.tests.map((t) => `<div class="file"><span class="tst tst-${t.st}">${t.st === "pass" ? svg("check", 14) : "…"}</span><span>${t.n}</span><span class="diffstat">${t.st === "pass" ? "Passing" : "Waiting for code"}</span></div>`).join("")}</div>
        ${more("commit-opts", "Commit options", `<label class="f">Message<input value="Fix ${item.id}: ${esc(item.title.toLowerCase())}"></label><label class="f">Reviewer<select><option>Igor Chagas</option><option>Caseworker lead</option></select></label>`)}</section>`;
    },
    "ship.release": (item) => {
      if (item) {
        const c = item.ph.build === "done" ? (item.checks || { tests: true, audit: true, review: true }) : { tests: false, audit: false, review: false };
        return `<section class="card"><div class="card-h"><h2>Release checks</h2><span class="meta">${item.id}</span></div><div class="rows">
          ${[["Tests pass on the branch", c.tests], ["Audit finds no regressions against " + S.prod.version, c.audit], ["Review approved", c.review]].map(([t, ok]) => `<div class="file"><span class="tst tst-${ok ? "pass" : "pending"}">${ok ? svg("check", 14) : "…"}</span><span>${t}</span></div>`).join("")}
          </div>${item.ph.build === "done" ? `<div class="sub-h">Preview</div><div class="rows"><div class="lrow"><span class="lr-t"><b>${item.preview || item.id.toLowerCase() + ".preview.pronghorn.blue"}</b><span>Built from ${item.branch}</span></span><span class="linkchip ok">Ready</span></div></div>` : ""}</section>`;
      }
      const ready = readyItems(), waiting = activeItems().filter((i) => i.release !== S.next);
      return `<section class="card"><div class="card-h"><h2>Release ${S.next}</h2><span class="meta">Replaces ${S.prod.version}</span></div>
        <div class="rows">${ready.length ? ready.map((i) => `<div class="lrow"><button class="wi-main" data-open="${i.id}" data-to="ship">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="lr-t"><b>${esc(i.title)}</b></span><span class="linkchip ok">${svg("check", 14)}Ready</span></button></div>`).join("") : `<div class="empty small">No items in this release yet.</div>`}</div>
        ${waiting.length ? `<div class="sub-h">Not in this release</div><div class="rows">${waiting.map((i) => `<div class="lrow"><button class="wi-main" data-open="${i.id}">${typeChip(i.type)}<span class="wi-id">${i.id}</span><span class="lr-t"><b>${esc(i.title)}</b></span><span class="wi-status">${statusWord(i)}</span></button></div>`).join("")}</div>` : ""}
        ${more("notes", "Release notes (drafted by the agent)", `<ul class="plain">${ready.map((i) => `<li><b>${TYPES[i.type].label === "Bug" ? "Fixed" : "New"}:</b> ${esc(i.title)}</li>`).join("") || "<li class='muted'>Notes appear as items are added.</li>"}</ul>`)}
</section>
        <section class="card"><div class="card-h"><h2>Pipeline</h2></div><div class="pipeline">
          <div class="stage done"><b>Branches</b><span>${ready.length} merged on release</span></div>
          <div class="stage done"><b>Test</b><span>${S.test}</span></div>
          <div class="stage" id="prodStage"><b>Current release</b><span>${S.prod.version}</span></div></div></section>`;
    },
    "ship.environments": (item) => `<section class="card"><div class="card-h"><h2>Environments</h2></div><div class="rows">
      <div class="lrow"><span class="lr-t"><b>Production</b><span>Deployed ${S.prod.deployed}</span></span><span class="ver">${S.prod.version}</span></div>
      <div class="lrow"><span class="lr-t"><b>Test</b><span>Release candidate</span></span><span class="ver">${S.test}</span></div>
      ${activeItems().filter((i) => i.ph.build === "done").map((i) => `<div class="lrow"><span class="lr-t"><b>Preview · ${i.id}</b><span>${i.preview || i.id.toLowerCase() + ".preview.pronghorn.blue"}</span></span><span class="ver">${i.branch}</span></div>`).join("")}</div></section>`,
  };

  function settingsView() {
    const html = `${header("Benefits Intake Portal", "Project settings", null)}
      <section class="card"><div class="pad form"><label class="f">Project name<input value="Benefits Intake Portal"></label><label class="f">Default AI model<select><option>GPT-4.1</option><option>o4-mini</option></select></label></div>
      ${more("set-lifecycle", "After the first release", `<label class="check"><input type="checkbox" checked> Lock main after the first release</label><label class="check"><input type="checkbox" checked> Bugs skip Design by default</label>`, true)}
      ${more("set-share", "Sharing and access", `<p class="muted">Owner, Editor and Viewer links live here, not in the main navigation.</p>`)}
      ${more("set-danger", "Danger zone", `<button class="btn danger"><span class="lbl">Delete project…</span></button>`)}</section>`;
    return [html, null];
  }

  /* --------------------------------------------------------------- feedback */
  let undoFn = null, undoT = null;
  function notify(text, fn) {
    $("#undoText").textContent = text; $("#undoBtn").hidden = !fn; undoFn = fn;
    $("#undo").classList.add("show"); clearTimeout(undoT); undoT = setTimeout(() => $("#undo").classList.remove("show"), 6500);
  }
  $("#undoBtn").onclick = () => { if (undoFn) undoFn(); $("#undo").classList.remove("show"); render(); };

  function runButton(b, ms, done, cb) {
    if (!b) { cb && cb(); return; }
    const lbl = b.querySelector(".lbl"), bar = b.querySelector(".progress"), orig = lbl.textContent;
    b.dataset.state = "pending"; lbl.textContent = "Working…";
    let pct = 0; const t = setInterval(() => { pct = Math.min(100, pct + 100 / (ms / 80)); if (bar) bar.style.width = pct + "%"; }, 80);
    setTimeout(() => { clearInterval(t); b.dataset.state = "done"; lbl.textContent = done; setTimeout(() => { cb && cb(); if (b.isConnected) { b.dataset.state = ""; lbl.textContent = orig; } }, 450); }, ms);
  }
  function flash(item) { item.fresh = true; setTimeout(() => { item.fresh = false; }, 1600); }

  /* agent ticker */
  setInterval(() => {
    let changed = false;
    S.items.forEach((i) => {
      if (!i.run || !i.run.live) return;
      i.run.pct = Math.min(100, i.run.pct + 4);
      if (i.run.pct === 76) i.run.detail = "Writing the regression test";
      if (i.run.pct >= 100) {
        i.run.live = false; i.note.build = "Review 2 files";
        const f = { p: "src/api/heic.ts", op: "a", s: "+41", fresh: true }; i.staged.push(f); setTimeout(() => (f.fresh = false), 1600);
        i.tests.forEach((t) => (t.st = "pass"));
        S.runs.unshift({ t: `${i.id} build agent`, d: "Staged 2 files · tests pass" });
        notify(`${i.id}: the agent finished. 2 files are ready to review.`, null);
        changed = true;
      }
    });
    if (changed) render();
    else {
      renderPills();
      const it = S.items.find((i) => i.run && i.run.live);
      if (it && $("#runMeter")) { $("#runMeter").style.width = it.run.pct + "%"; $("#runPct").textContent = it.run.pct + "%"; $("#runDetail").textContent = it.run.detail; }
    }
  }, 1000);

  /* ----------------------------------------------------------------- sheet */
  function openSheet(pre) {
    pre = pre || {};
    let type = pre.type || null;
    const root = $("#sheetRoot");
    const draw = () => {
      root.innerHTML = `<div class="scrim" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT">
        <div class="sheet-h"><h2 id="sheetT">New work item</h2><button class="icon-btn" data-close aria-label="Close">${svg("x")}</button></div>
        <div class="sheet-b">
          <div class="field-l">What kind of change?</div>
          <div class="types" role="radiogroup">${Object.entries(TYPES).map(([k, t]) => `<button role="radio" aria-checked="${type === k}" class="type-opt" data-type="${k}">${typeChip(k)}<b>${t.blurb}</b><span>${t.path}</span></button>`).join("")}</div>
          ${type ? `
          <label class="f">Title<input id="wiTitle" value="${esc(pre.title || "")}" placeholder="${type === "bug" ? "What's broken, in one line" : type === "feature" ? "What people will be able to do" : "What gets better"}"></label>
          ${type === "bug" ? `<label class="f">What happened?<textarea id="wiBody">${esc(pre.body || "")}</textarea></label>
            <div class="row2"><label class="f">Affected version<select><option>${S.prod.version}</option><option>${S.prod.prev}</option></select></label>
            <label class="f">Severity<select><option>High</option><option selected>Medium</option><option>Low</option></select></label></div>`
          : type === "enhancement" ? `<label class="f">Which requirement does it change?<select>${S.baseReqs.flatMap((e) => e.stories).map((s) => `<option>${s}</option>`).join("")}</select></label>`
          : `<label class="f">What problem does it solve?<textarea id="wiBody" placeholder="Who needs it and why"></textarea></label>`}
          ${more("sheet-adv", "More options", `<label class="f">Target release<select><option>${S.next}</option><option>Later</option></select></label><label class="check"><input type="checkbox" checked> Let the agent draft requirement changes</label>`)}` : ""}
        </div>
        <div class="sheet-f"><button class="btn quiet" data-close><span class="lbl">Cancel</span></button><button class="btn primary" id="createWi" ${type ? "" : "disabled"}><span class="lbl">Create work item</span><span class="progress"></span></button></div>
      </div>`;
      $$(".type-opt", root).forEach((b) => (b.onclick = () => { type = b.dataset.type; pre.title = ($("#wiTitle") || {}).value || pre.title; draw(); setTimeout(() => $("#wiTitle") && $("#wiTitle").focus(), 0); }));
      const c = $("#createWi");
      if (c) c.onclick = () => {
        const title = ($("#wiTitle").value || "").trim() || (type === "bug" ? "Untitled bug" : "Untitled " + type);
        runButton(c, 600, "Created", () => {
          const id = "WI-" + S.seq++;
          const it = { id, type, title, status: "active", source: "Created by you", sev: type === "bug" ? "Medium" : null,
            ph: { define: "active", design: type === "bug" ? "skipped" : "todo", build: "todo", ship: "todo" },
            note: { define: "Drafting", design: type === "bug" ? "Skipped for bug" : "Not started", build: "Not started", ship: "Not started" },
            branch: `${type === "bug" ? "fix" : "feat"}/${id.toLowerCase()}`, reqs: [], comps: ["api"], staged: [], tests: [] };
          S.items.unshift(it); flash(it);
                    closeSheet();
          notify(`${id} created with branch ${it.branch}`, () => { S.items = S.items.filter((x) => x !== it) });
          if (pre.stay) render(); else go({ v: "work", w: null, t: null, s: null });
        });
      };
    };
    draw();
    const first = $(".type-opt[aria-checked='true']", root) || $(".type-opt", root); first && first.focus();
  }
  function closeSheet() { $("#sheetRoot").innerHTML = ""; }

  /* ----------------------------------------------------------------- events */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) return closeSheet();
    const cs = t.closest("#ctxSwitch");
    if (cs) { const m = $("#ctxMenu"); m.hidden = !m.hidden; cs.setAttribute("aria-expanded", String(!m.hidden)); return; }
    if (!t.closest("#ctxMenu")) { const m = $("#ctxMenu"); if (m) m.hidden = true; }
    const cx = t.closest("[data-ctx]");
    if (cx) { const id = cx.dataset.ctx || null; const p = P(); const v = PHASES.some((x) => x.id === p.v) ? p.v : id ? currentPhase(byId(id)) : "work"; return go({ w: id, v, t: null, s: null }); }
    const nav = t.closest("[data-nav]");
    if (nav) return go({ v: nav.dataset.nav, t: null, s: null, w: nav.dataset.nav === "work" || nav.dataset.nav === "live" || nav.dataset.nav === "settings" ? null : P().w });
    const ph = t.closest("[data-phase]"); if (ph) return go({ v: ph.dataset.phase, t: null, s: null });
    const tl = t.closest("[data-tool]"); if (tl) return go({ t: tl.dataset.tool });
    const fl = t.closest("[data-filter]"); if (fl) return go({ f: fl.dataset.filter, s: null });
    const tg = t.closest("[data-toggle]"); if (tg) return go({ s: P().s === tg.dataset.toggle ? null : tg.dataset.toggle });
    const op = t.closest("[data-open]");
    if (op) { const it = byId(op.dataset.open); if (!it) return; if (it.status === "triage") return go({ v: "work", w: null, s: it.id }); return go({ w: it.id, v: op.dataset.to || currentPhase(it), t: null, s: null }); }
    if (t.closest("#agentPill")) { const pop = $("#statusPop"); pop.hidden = !pop.hidden; $("#agentPill").setAttribute("aria-expanded", String(!pop.hidden)); return; }
    if (!t.closest("#statusPop")) { $("#statusPop").hidden = true; $("#agentPill").setAttribute("aria-expanded", "false"); }
    if (t.closest("#collapse")) { store("collapsed", document.body.classList.contains("rail-collapsed") ? "0" : "1"); return applyCollapse(); }
    const a = t.closest("[data-act]"); if (a && !a.disabled) act(a.dataset.act, a.dataset.arg, a);
  });
  document.addEventListener("change", (e) => {
    const r = e.target.closest("[data-retype]");
    if (r) { byId(r.dataset.retype).type = r.value; render(); }
  });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.pref) store(d.dataset.pref, d.open ? "1" : "0"); }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if ($("#sheetRoot").innerHTML) return closeSheet(); const m = $("#ctxMenu"); if (m && !m.hidden) { m.hidden = true; return; } if (P().s) go({ s: null }); }
  });

  function currentPhase(it) { if (!it || !it.ph) return "define"; const c = PHASES.find((p) => it.ph[p.id] === "active"); return c ? c.id : "ship"; }
  function applyCollapse() {
    const v = store("collapsed") === "1"; document.body.classList.toggle("rail-collapsed", v);
    const c = $("#collapse"); if (c) { c.setAttribute("aria-pressed", String(v)); c.querySelector(".ri-t").textContent = v ? "Expand" : "Collapse"; }
  }

  function act(name, arg, el) {
    const p = P(); const item = p.w ? byId(p.w) : null;
    switch (name) {
      case "newItem": return openSheet({ type: arg || null });
      case "nav": { const [v, t, base] = arg.split("|"); return go({ v, t: t || null, s: null, w: base ? null : p.w }); }
      case "openTriage": return go({ v: "work", s: arg });
      case "accept": {
        const it = byId(arg);
        return runButton(el, 500, "Accepted", () => {
          const prev = JSON.stringify(it);
          Object.assign(it, { status: "active", ph: { define: "active", design: it.type === "bug" ? "skipped" : "todo", build: "todo", ship: "todo" }, note: { define: "Agent drafting", design: it.type === "bug" ? "Skipped for bug" : "Not started", build: "Not started", ship: "Not started" }, branch: `${it.type === "bug" ? "fix" : "feat"}/${it.id.toLowerCase()}-${it.type}`, reqs: [{ id: "S1", title: "As an applicant I answer 5 screening questions", delta: "Changed" }], comps: ["api"], staged: [], tests: [] });
          flash(it); notify(`${it.id} accepted. Branch ${it.branch} created`, () => { Object.keys(it).forEach((k) => delete it[k]); Object.assign(it, JSON.parse(prev)); });
          go({ s: null });
        });
      }
      case "decline": {
        const it = byId(arg), idx = S.items.indexOf(it); S.items.splice(idx, 1);
        notify(`${it.id} declined`, () => S.items.splice(idx, 0, it)); return go({ s: null });
      }
      case "phaseDone": {
        const ph = arg, order = PHASES.map((x) => x.id);
        return runButton(el, ph === "build" ? 1200 : 700, ph === "build" ? "Sent" : "Done", () => {
          const snap = JSON.stringify({ ph: item.ph, note: item.note });
          item.ph[ph] = "done"; item.note[ph] = { define: "Ready", design: "Approved", build: "Reviewed" }[ph];
          const nxt = order.slice(order.indexOf(ph) + 1).find((x) => item.ph[x] !== "skipped");
          if (nxt) { item.ph[nxt] = "active"; item.note[nxt] = nxt === "build" ? "Agent starting" : nxt === "ship" ? "Preview ready" : "In progress"; }
          if (nxt === "build" && !item.run) { item.run = { pct: 4, live: true, detail: `Planning changes on ${item.branch}` }; }
          if (ph === "build") { item.preview = item.preview || `${item.id.toLowerCase()}.preview.pronghorn.blue`; S.runs.unshift({ t: `${item.id} preview`, d: item.preview }); }
          notify(`${item.id}: ${PHASES.find((x) => x.id === ph).name} complete${nxt ? `. ${PHASES.find((x) => x.id === nxt).name} started` : ""}`, () => { const s = JSON.parse(snap); item.ph = s.ph; item.note = s.note; if (nxt === "build") item.run = null; });
          render();
        });
      }
      case "unskip": { item.ph.design = item.ph.define === "done" && item.ph.build !== "done" ? "active" : "todo"; item.note.design = "Added"; notify(`${item.id}: design step added`, () => { item.ph.design = "skipped"; item.note.design = "Skipped for bug"; }); return render(); }
      case "addRelease":
        return runButton(el, 600, "Added", () => { item.release = S.next; item.ph.ship = "active"; item.note.ship = `In ${S.next}`; flash(item); notify(`${item.id} added to ${S.next}`, () => { item.release = null; item.note.ship = "Preview ready"; }); render(); });
      case "deployProd": {
        if (el.dataset.confirm !== "1") {
          el.dataset.confirm = "1"; el.classList.add("confirm"); el.querySelector(".lbl").textContent = `Confirm: release ${readyItems().length} ${readyItems().length > 1 ? "items" : "item"}`;
          setTimeout(() => { if (el.isConnected && el.dataset.confirm === "1") { el.dataset.confirm = ""; el.classList.remove("confirm"); el.querySelector(".lbl").textContent = `Release ${S.next}`; } }, 4000);
          return;
        }
        el.dataset.confirm = ""; el.classList.remove("confirm");
        $$('[data-act="deployProd"]').forEach((b) => b !== el && (b.disabled = true));
        const stage = $("#prodStage"); if (stage) stage.classList.add("running");
        return runButton(el, 2200, "Deployed", () => {
          const snap = JSON.stringify({ prod: S.prod, items: S.items, next: S.next, test: S.test });
          const shipped = readyItems();
          shipped.forEach((i) => { i.status = "shipped"; i.shippedIn = S.next; i.ph.ship = "done"; i.release = null; });
          S.prod = { version: S.next, deployed: "just now", prev: S.prod.version };
          S.next = "v1.5.1"; S.test = S.prod.version;
          S.runs.unshift({ t: `Release ${S.prod.version}`, d: `${shipped.length} items released` });
          notify(`${S.prod.version} is released. The baseline now includes ${shipped.length} ${shipped.length > 1 ? "items" : "item"}`, () => { const s = JSON.parse(snap); Object.assign(S, s); });
          render();
        });
      }
    }
  }

  render();
})();

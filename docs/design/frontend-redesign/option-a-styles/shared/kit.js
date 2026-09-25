/*
 * Pronghorn prototype kit: shared helpers for the lifecycle-approach prototypes.
 * Rendering helpers return HTML strings using the component classes in base.css
 * and lifecycle.css. Nothing here knows about a specific navigation model.
 */
window.PK = (function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NS = "pk." + (document.body.dataset.proto || "x") + ".";
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(NS + k); localStorage.setItem(NS + k, v); }
    catch (e) { return null; }
  }

  const IC = {
    work: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    live: '<path d="M3 12h4l3 7 4-14 3 7h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    chev: '<path d="M9 6l6 6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l4 4 10-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-4 4.5-9.5 5.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/>',
    spark: '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z"/>',
    bug: '<rect x="8" y="7" width="8" height="12" rx="4"/><path d="M12 7V4M8 11H4M16 11h4M8 16H5M16 16h3"/>',
    rocket: '<path d="M12 2c4 3 5 7 4 12l-4 3-4-3c-1-5 0-9 4-12z"/><circle cx="12" cy="9" r="1.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
    canvas: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4a3 3 0 013 3V14"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  };
  const svg = (k, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

  const PHASES = [
    { id: "define", name: "Define" }, { id: "design", name: "Design" }, { id: "build", name: "Build" }, { id: "ship", name: "Ship" },
  ];
  const TYPES = {
    bug: { label: "Bug", blurb: "Something that was released is broken", path: "Define → Build → Ship. Design is optional." },
    enhancement: { label: "Enhancement", blurb: "Improve something users already have", path: "Define → Design → Build → Ship" },
    feature: { label: "Feature", blurb: "Add something new", path: "Define → Design → Build → Ship" },
  };

  function btn(p, cls = "primary") {
    if (!p) return "";
    return `<button class="btn ${cls}" data-act="${p.act}" ${p.arg ? `data-arg="${p.arg}"` : ""} ${p.disabled ? "disabled" : ""} ${p.why ? `title="${esc(p.why)}"` : ""}>${p.icon ? svg(p.icon, 16) : ""}<span class="lbl">${p.label}</span><span class="progress"></span></button>`;
  }
  const typeChip = (t) => `<span class="type type-${t}">${TYPES[t].label}</span>`;
  function track(ph) {
    if (!ph) return `<span class="track track-empty">Not triaged</span>`;
    return `<span class="track">${PHASES.map((p) => `<i class="seg s-${ph[p.id]}" title="${p.name}: ${ph[p.id]}"></i>`).join("")}</span>`;
  }
  function spark(vals) {
    const m = Math.max(...vals, 1), w = 64, h = 20;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / m) * (h - 2) - 1}`).join(" ");
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }
  function banner(n) {
    if (!n) return "";
    return `<div class="next ${n.tone ? "tone-" + n.tone : ""}"><span class="next-ic">${svg(n.icon || "spark", 18)}</span><div class="next-t"><b>${n.title}</b><span>${n.body || ""}</span></div>${n.cta ? `<button class="btn" data-act="${n.act}" ${n.arg ? `data-arg="${n.arg}"` : ""}><span class="lbl">${n.cta}</span><span class="progress"></span></button>` : ""}</div>`;
  }
  function more(key, summary, inner, defOpen) {
    const o = store("open." + key); const open = o === null ? !!defOpen : o === "1";
    return `<details class="more" data-pref="open.${key}" ${open ? "open" : ""}><summary>${svg("chev", 14)}${summary}</summary><div class="more-in">${inner}</div></details>`;
  }
  function header(crumb, title, primary, extra) {
    return `<div class="phead"><div class="phead-t"><div class="crumb">${crumb}</div><h1>${title}</h1></div><div class="primary-slot">${extra || ""}${btn(primary)}</div></div>`;
  }
  function tabs(list, current, label) {
    return `<div class="tools" role="tablist" aria-label="${label}">${list.map(([id, l, n]) => `<button class="tool" role="tab" aria-selected="${id === current}" data-tool="${id}">${l}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>`;
  }

  /* Two-step confirmation for irreversible or production actions */
  function confirmStep(el, confirmLabel) {
    if (el.dataset.confirm === "1") { el.dataset.confirm = ""; el.classList.remove("confirm"); return true; }
    const lbl = el.querySelector(".lbl"), orig = lbl.textContent;
    el.dataset.confirm = "1"; el.classList.add("confirm"); lbl.textContent = confirmLabel;
    setTimeout(() => { if (el.isConnected && el.dataset.confirm === "1") { el.dataset.confirm = ""; el.classList.remove("confirm"); lbl.textContent = orig; } }, 4000);
    return false;
  }
  function runButton(b, ms, done, cb) {
    if (!b || !b.querySelector(".lbl")) { cb && cb(); return; }
    const lbl = b.querySelector(".lbl"), bar = b.querySelector(".progress"), orig = lbl.textContent;
    b.dataset.state = "pending"; lbl.textContent = "Working…";
    let pct = 0; const t = setInterval(() => { pct = Math.min(100, pct + 100 / (ms / 80)); if (bar) bar.style.width = pct + "%"; }, 80);
    setTimeout(() => { clearInterval(t); b.dataset.state = "done"; lbl.textContent = done; setTimeout(() => { cb && cb(); if (b.isConnected) { b.dataset.state = ""; lbl.textContent = orig; } }, 400); }, ms);
  }

  let undoFn = null, undoT = null, onUndo = null;
  function notify(text, fn) {
    $("#undoText").textContent = text; $("#undoBtn").hidden = !fn; undoFn = fn;
    $("#undo").classList.add("show"); clearTimeout(undoT); undoT = setTimeout(() => $("#undo").classList.remove("show"), 7000);
  }

  function shell() {
    document.body.insertAdjacentHTML("afterbegin", `
      <a class="skip" href="#page">Skip to content</a>
      <header class="gbar">
        <div class="brand"><span class="logo" aria-hidden="true">P</span><span class="brand-name">Pronghorn</span></div>
        <button class="switcher" aria-label="Switch project"><span class="sw-name">Benefits Intake Portal</span>${svg("down", 14)}</button>
        <span class="mode-badge" id="modeBadge"></span>
        <div class="search" role="search">${svg("search", 16)}<span>Search</span><kbd>⌘K</kbd></div>
        <div class="spacer"></div>
        <div class="demo-switch" role="group" aria-label="Prototype only: show the project as">
          <span>Prototype</span><button data-demo="building">Building</button><button data-demo="evolve">Released</button>
        </div>
        <button class="pill" id="pillA"></button>
        <button class="avatar" data-nav="settings" aria-label="Account and project settings">IC</button>
      </header>
      <div class="ctxbar strip" id="strip" hidden></div>
      <nav class="rail" id="rail" aria-label="Project"></nav>
      <main id="main"><div class="wrap"><div id="page" tabindex="-1"></div></div></main>
      <div class="m-action" id="mAction"></div>
      <nav class="tabbar" id="tabbar" aria-label="Project"></nav>
      <div class="undo" id="undo" role="status" aria-live="polite"><span id="undoText"></span><button id="undoBtn">Undo</button></div>
      <div id="sheetRoot"></div>`);
    $("#undoBtn").onclick = () => { if (undoFn) undoFn(); $("#undo").classList.remove("show"); onUndo && onUndo(); };
    document.addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.pref) store(d.dataset.pref, d.open ? "1" : "0"); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#sheetRoot").innerHTML) closeSheet(); });
    document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  }
  function afterUndo(fn) { onUndo = fn; }
  function openSheet(title, body, foot) {
    $("#sheetRoot").innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT">
      <div class="sheet-h"><h2 id="sheetT">${title}</h2><button class="icon-btn" data-close aria-label="Close">${svg("x")}</button></div>
      <div class="sheet-b">${body}</div><div class="sheet-f">${foot}</div></div>`;
    const f = $("#sheetRoot input, #sheetRoot button.type-opt, #sheetRoot select"); f && f.focus();
  }
  function closeSheet() { $("#sheetRoot").innerHTML = ""; }

  function hashParams() { return Object.fromEntries(new URLSearchParams(location.hash.slice(1))); }
  function setHash(obj) {
    const q = new URLSearchParams(); Object.entries(obj).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "") q.set(k, v); });
    const h = "#" + q.toString(); if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = h;
  }

  return { $, $$, esc, store, svg, IC, PHASES, TYPES, btn, typeChip, track, spark, banner, more, header, tabs, confirmStep, runButton, notify, afterUndo, shell, openSheet, closeSheet, hashParams, setHash };
})();

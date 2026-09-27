// ═══════════════════════════════════════════════════════════════════
// MoGeRe Wochenplan Mobil — App (Vanilla JS, kein Build, offline-fähig)
// ═══════════════════════════════════════════════════════════════════
import {
  APP_VERSION, DAYS, WEEKDAY_LONG, WEEKDAY_SHORT, STATUS_COLORS, ABT_COLORS, FALLBACK_ABT, KNOWN_ABTEILUNGEN,
  parseTimeRange, minToHHMM, dateKey, parseDateKey, addDays, todayKey, isoWeek, mondayOf, fmtDate, fmtDateShort,
  escapeHtml as h, initials, phoneNumbers, typeLabel, pad2,
} from "./core.js";
import { importBehandlungsplan, inspectBpFile } from "./bp-import.js";
import { isPlan, staffByKey, staffName, staffDay, activeStaff, subsetPlan, mergeWochenplanExport, dayConflicts, itemKey, patientAppointments } from "./plan.js";
import { encryptPlan, decryptPlan, isEncrypted, cryptoAvailable } from "./crypto.js";
import { store } from "./store.js";
import { icon } from "./icons.js";

// ── Zustand ────────────────────────────────────────────────────────
const S = {
  settings: store.loadSettings(),
  plan: null,
  lockPin: null,        // PIN der aktiven App-Sperre (nur im Speicher)
  locked: false,
  view: "tag",
  date: todayKey(),
  viewStaff: null,      // Ansicht eines Kollegen (Team → Tag)
  done: store.loadDone(),
  teamQuery: "",
  vt: null,             // Verteiler-Zustand
};
const $ = (sel, root = document) => root.querySelector(sel);
const el = { top: $("#topbar"), nav: $("#nav"), main: $("#main"), sheet: $("#sheet-root"), toast: $("#toast"), file: $("#file-input") };

// ── Hilfen ─────────────────────────────────────────────────────────
const saveSettings = () => store.saveSettings(S.settings);
const meKey = () => S.viewStaff || S.settings.me;
const abtColor = (abt) => {
  if (!abt) return ABT_COLORS[FALLBACK_ABT];
  const g = S.plan && S.plan.groups.find((x) => x.name === abt);
  return (g && g.color) || ABT_COLORS[abt] || ABT_COLORS[FALLBACK_ABT];
};
const isTeamPlan = () => S.plan && activeStaff(S.plan).length > 1;
const isSunday = (dk) => parseDateKey(dk).getDay() === 0;
const nowMinutes = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const mapsUrl = (addr) => {
  const q = encodeURIComponent(addr);
  const which = S.settings.maps || (isApple() ? "apple" : "google");
  return which === "apple" ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
};
const dayLabel = (dk) => {
  const d = parseDateKey(dk);
  const t = todayKey();
  const rel = dk === t ? "Heute" : dk === dateKey(addDays(new Date(), 1)) ? "Morgen" : dk === dateKey(addDays(new Date(), -1)) ? "Gestern" : WEEKDAY_LONG[d.getDay()];
  return { rel, full: WEEKDAY_LONG[d.getDay()] + ", " + fmtDate(d) };
};
const safeFile = (s) => String(s).replace(/[^\w.\-äöüÄÖÜß]+/g, "_");

function toast(msg, action) {
  el.toast.innerHTML = `<span>${h(msg)}</span>` + (action ? `<button type="button">${h(action.label)}</button>` : "");
  el.toast.classList.add("show");
  if (action) el.toast.querySelector("button").onclick = () => { action.run(); el.toast.classList.remove("show"); };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.toast.classList.remove("show"), action ? 12000 : 3200);
}

function applyTheme() {
  const r = document.documentElement;
  if (S.settings.theme === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", S.settings.theme);
  r.setAttribute("data-size", S.settings.textSize);
}

// ── Speichern (Klartext oder mit App-Sperre verschlüsselt) ────────
async function persistPlan() {
  if (!S.plan) return store.clearPlan();
  if (S.lockPin) {
    const encFile = await encryptPlan(S.plan, S.lockPin, planMeta(S.plan));
    return store.savePlan(null, encFile);
  }
  if (!store.savePlan(S.plan)) toast("Speicher voll – Plan nur bis zum Schließen verfügbar.");
}
function planMeta(plan) {
  return {
    kind: plan.kind,
    owner: plan.owner ? staffName(plan, plan.owner) : null,
    range: plan.range,
    createdAt: plan.createdAt,
    stand: plan.stand || null,
  };
}

// ── Dialoge (Sheet) ────────────────────────────────────────────────
let sheetClose = null;
function openSheet(html, { onMount, dismissable = true } = {}) {
  closeSheet();
  const back = document.createElement("div");
  back.className = "sheet-backdrop";
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  el.sheet.appendChild(back);
  const sheet = back.firstElementChild;
  let resolveClose;
  const closed = new Promise((r) => (resolveClose = r));
  sheetClose = (val) => {
    back.remove();
    sheetClose = null;
    document.removeEventListener("keydown", onKey);
    resolveClose(val);
  };
  const onKey = (e) => { if (e.key === "Escape" && dismissable) sheetClose(null); };
  document.addEventListener("keydown", onKey);
  if (dismissable) back.addEventListener("click", (e) => { if (e.target === back) sheetClose(null); });
  sheet.addEventListener("click", (e) => {
    const b = e.target.closest("[data-close]");
    if (b) sheetClose(b.dataset.close === "" ? null : b.dataset.close);
  });
  if (onMount) onMount(sheet, sheetClose);
  const f = sheet.querySelector("[autofocus]");
  if (f) setTimeout(() => f.focus(), 60);
  return closed;
}
const closeSheet = () => sheetClose && sheetClose(null);

function askChoice(title, text, options) {
  return openSheet(`<h2>${h(title)}</h2>${text ? `<p class="muted" style="white-space:pre-line">${h(text)}</p>` : ""}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
      ${options.map((o) => `<button class="btn block ${o.primary ? "primary" : ""} ${o.danger ? "danger" : ""}" data-close="${h(o.value)}">${h(o.label)}</button>`).join("")}
    </div>`, { dismissable: options.some((o) => o.value === "cancel") });
}

function askPin({ title, text = "", confirm = false, submit = "OK", allowCancel = true }) {
  return openSheet(`<h2>${h(title)}</h2>${text ? `<p class="muted">${h(text)}</p>` : ""}
    <form id="pinf" autocomplete="off">
      <div class="field"><label for="p1">PIN / Passwort</label>
        <input class="input pin" id="p1" type="password" inputmode="numeric" autocomplete="off" autofocus required minlength="4"></div>
      ${confirm ? `<div class="field"><label for="p2">PIN wiederholen</label><input class="input pin" id="p2" type="password" inputmode="numeric" autocomplete="off" required minlength="4"></div>` : ""}
      <label class="row small muted" style="margin-bottom:6px"><input type="checkbox" id="pshow"> PIN anzeigen</label>
      <p class="small" id="perr" style="color:var(--danger);min-height:1.2em;margin:4px 0"></p>
      <div class="sheet-actions">
        ${allowCancel ? `<button type="button" class="btn" data-close="">Abbrechen</button>` : ""}
        <button type="submit" class="btn primary">${h(submit)}</button>
      </div>
    </form>`, {
    dismissable: allowCancel,
    onMount(sheet, close) {
      const p1 = $("#p1", sheet), p2 = $("#p2", sheet);
      $("#pshow", sheet).onchange = (e) => { p1.type = e.target.checked ? "text" : "password"; if (p2) p2.type = p1.type; };
      $("#pinf", sheet).onsubmit = (e) => {
        e.preventDefault();
        if (p1.value.length < 4) return ($("#perr", sheet).textContent = "Mindestens 4 Zeichen.");
        if (p2 && p1.value !== p2.value) return ($("#perr", sheet).textContent = "Die PINs stimmen nicht überein.");
        close(p1.value);
      };
    },
  });
}

// ── Datei öffnen / importieren ─────────────────────────────────────
el.file.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) await handleFile(f);
});
const pickFile = () => el.file.click();

async function handleFile(file) {
  let text;
  try { text = await file.text(); } catch (e) { return toast("Datei konnte nicht gelesen werden."); }
  await handleText(text, file.name || "Datei");
}

async function handleText(text, name) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) {
    return askChoice("Unbekanntes Dateiformat", `„${name}“ ist keine gültige Plan-Datei (JSON).`, [{ label: "OK", value: "ok", primary: true }]);
  }
  try {
    if (isEncrypted(obj)) return await importEncrypted(obj);
    if (isPlan(obj)) return await adoptPlan(obj);
    if (Array.isArray(obj.rows) || obj.allMonths) return await importBp(obj, name);
    if (Array.isArray(obj.groups) && obj.weekNumber) return await importWp(obj);
    throw new Error("Diese Datei wird nicht erkannt. Erwartet: Plan-Datei der Koordination, BhP_*.json oder Wochenplan-Export.");
  } catch (err) {
    console.error(err);
    askChoice("Import fehlgeschlagen", err.message || String(err), [{ label: "OK", value: "ok", primary: true }]);
  }
}

async function importEncrypted(file) {
  if (!cryptoAvailable()) throw new Error("Verschlüsselte Dateien können hier nicht geöffnet werden (Seite muss über https laufen).");
  const who = file.meta && file.meta.owner ? ` für ${file.meta.owner}` : "";
  let msg = "Bitte die PIN eingeben, die du von der Koordination bekommen hast.";
  for (;;) {
    const pin = await askPin({ title: "Geschützter Plan" + who, text: msg, submit: "Öffnen" });
    if (!pin) return;
    try {
      const plan = await decryptPlan(file, pin);
      if (!isPlan(plan)) throw new Error("Datei beschädigt.");
      S.lockPin = pin; // Sperre bleibt mit derselben PIN aktiv
      return await adoptPlan(plan);
    } catch (e) {
      if (e.code !== "BAD_PIN") throw e;
      msg = "Falsche PIN – bitte erneut versuchen.";
    }
  }
}

async function adoptPlan(plan, { stats, deferPicker } = {}) {
  S.plan = plan;
  S.locked = false;
  S.viewStaff = null;
  if (plan.owner) S.settings.me = plan.owner;
  else if (S.settings.me && !staffByKey(plan, S.settings.me)) S.settings.me = null;
  saveSettings();
  await persistPlan();
  S.date = defaultDate();
  S.view = "tag";
  renderAll();
  const n = activeStaff(plan).length;
  toast(stats ? stats : `Plan geladen (${fmtRange(plan.range)}${n > 1 ? `, ${n} Mitarbeiter` : ""}).`);
  if (!S.settings.me && !deferPicker) setTimeout(() => openStaffPicker(true), 250);
}

async function importBp(bp, name) {
  const inf = inspectBpFile(bp);
  if (!inf.valid) throw new Error("Keine gültige Behandlungsplan-Datei.");
  let onlyTop = false;
  if (inf.months.length > 1 && inf.topMonth) {
    const top = inf.months.find((m) => m.month === inf.topMonth.month && m.year === inf.topMonth.year);
    const topName = top ? new Date(top.year, top.month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : "";
    const c = await askChoice("Behandlungsplan importieren", `Die Datei enthält ${inf.months.length} Monate (Termine: ${inf.rangeText}).`, [
      { label: "Alle Monate übernehmen", value: "all", primary: true },
      { label: `Nur ${topName}`, value: "top" },
      { label: "Abbrechen", value: "cancel" },
    ]);
    if (!c || c === "cancel") return;
    onlyTop = c === "top";
  }
  const { plan, stats } = importBehandlungsplan(bp, { onlyTopMonth: onlyTop, sourceName: name });
  let msg = `${stats.monthText}: ${stats.entryCount} Termine, ${stats.autoCount} Auto-Einsätze, ${stats.staffCount} Mitarbeiter.`;
  if (stats.createdStaff.length) msg += `\nUnbekannte Kürzel angelegt: ${stats.createdStaff.map((s) => s.name).join(", ")}`;
  S.settings.coordinator = true;
  await adoptPlan(plan, { stats: `Behandlungsplan importiert – ${stats.entryCount} Termine.`, deferPicker: true });
  const c = await askChoice("Import abgeschlossen", msg + "\n\nDieses Gerät enthält jetzt die Termine und Kontaktdaten aller Patienten. Eine PIN-Sperre wird empfohlen.", [
    { label: "PIN-Sperre einrichten", value: "lock", primary: true },
    { label: "Später", value: "later" },
  ]);
  if (c === "lock") await enableLock();
  if (!S.settings.me) openStaffPicker(true);
}

async function importWp(wp) {
  if (!S.plan) {
    S.plan = { format: "mogere-wochenplan", version: 1, kind: "team", createdAt: new Date().toISOString(), source: "Wochenplan-Export", range: { from: null, to: null }, groups: [], staff: [], patients: {}, days: {} };
  }
  const r = mergeWochenplanExport(S.plan, wp);
  S.settings.coordinator = true;
  saveSettings();
  await persistPlan();
  renderAll();
  toast(`Wochenplan KW ${r.week}/${r.year} eingemischt: ${r.manual} manuelle Einträge, ${r.statuses} Status.`);
}
const fmtRange = (r) => (r && r.from ? fmtDateShort(parseDateKey(r.from)) + "–" + fmtDate(parseDateKey(r.to)) : "–");

function defaultDate() {
  let d = new Date();
  if (d.getDay() === 0) d = addDays(d, 1);
  return dateKey(d);
}

// ── App-Sperre ────────────────────────────────────────────────────
async function enableLock() {
  if (!cryptoAvailable()) return toast("PIN-Sperre benötigt https.");
  const pin = await askPin({ title: "PIN-Sperre einrichten", text: "Der Plan wird auf diesem Gerät verschlüsselt gespeichert. Beim Öffnen der App wird die PIN abgefragt.", confirm: true, submit: "Sperre aktivieren" });
  if (!pin) return;
  S.lockPin = pin;
  await persistPlan();
  render();
  toast("PIN-Sperre aktiv.");
}
async function disableLock() {
  const enc = store.loadEncrypted();
  const pin = await askPin({ title: "PIN-Sperre ausschalten", text: "Zur Bestätigung die aktuelle PIN eingeben.", submit: "Ausschalten" });
  if (!pin) return;
  try { await decryptPlan(enc, pin); } catch (e) { return toast("Falsche PIN."); }
  S.lockPin = null;
  await persistPlan();
  render();
  toast("PIN-Sperre ausgeschaltet.");
}
async function unlock(pin) {
  const enc = store.loadEncrypted();
  const plan = await decryptPlan(enc, pin);
  S.plan = plan;
  S.lockPin = pin;
  S.locked = false;
  S.date = defaultDate();
  renderAll();
  if (!S.settings.me) openStaffPicker(true);
}

// ── Rendering ─────────────────────────────────────────────────────
function renderAll() {
  applyTheme();
  renderTop();
  renderNav();
  render();
}
function render() {
  renderTop();
  renderNav();
  const v = S.locked ? "lock" : !S.plan ? "welcome" : S.view;
  const fn = { lock: viewLock, welcome: viewWelcome, tag: viewTag, woche: viewWoche, team: viewTeam, mehr: viewMehr, verteiler: viewVerteiler }[v] || viewTag;
  el.main.innerHTML = fn();
  if (v === "verteiler") mountVerteiler();
  if (v === "lock") mountLock();
}

function renderTop() {
  const p = S.plan;
  let sub = "MoGeRe Gold";
  if (p && !S.locked) {
    const w = isoWeek(parseDateKey(S.date));
    sub = `KW ${w.week} · Stand ${fmtDateShort(new Date(p.stand || p.createdAt))}`;
  }
  const k = meKey();
  const s = p && k ? staffByKey(p, k) : null;
  const other = S.viewStaff && S.viewStaff !== S.settings.me;
  el.top.innerHTML = `<div class="topbar-inner">
    <div class="brand"><img src="icons/icon-192.png" alt=""><div class="brand-text"><div class="brand-title">Wochenplan</div><div class="brand-sub">${h(sub)}</div></div></div>
    ${p && !S.locked ? `<button class="me-btn" data-act="pick-staff" aria-label="Mitarbeiter wählen">
      <span class="avatar" style="background:${abtColor(s && s.abt)}">${h(s ? initials(s.name) : "?")}</span>
      <span class="name">${h(s ? (other ? "Ansicht: " : "") + s.name : "Wer bist du?")}</span></button>` : ""}
    ${other ? `<button class="icon-btn flat" data-act="back-to-me" aria-label="Zurück zu meinem Plan">${icon("x")}</button>` : ""}
  </div>`;
}

function renderNav() {
  if (!S.plan || S.locked) { el.nav.innerHTML = ""; return; }
  const items = [
    ["tag", "Tag", "day"],
    ["woche", "Woche", "week"],
    ...(isTeamPlan() ? [["team", "Team", "team"]] : []),
    ["mehr", "Mehr", "more"],
  ];
  const cur = S.view === "verteiler" ? "mehr" : S.view;
  el.nav.innerHTML = items.map(([v, l, i]) => `<button data-act="view" data-v="${v}" ${cur === v ? 'aria-current="page"' : ""}><span class="pill">${icon(i)}</span>${l}</button>`).join("");
}

// ── Willkommen / Sperre ───────────────────────────────────────────
function viewWelcome() {
  return `<div class="welcome">
    <img src="icons/icon-192.png" alt="">
    <h1>MoGeRe Wochenplan</h1>
    <p>Dein persönlicher Wochenplan – Termine, Adressen, Auto-Einteilung und Tageshinweise, auch ohne Internet.</p>
    <button class="btn primary block" data-act="open-file" style="max-width:360px;margin:0 auto">${icon("file")} Plan-Datei öffnen</button>
    <ol class="steps card" style="padding:16px 16px 10px 34px">
      <li>Du bekommst deine Plan-Datei von der Koordination (z. B. per E-Mail oder Messenger).</li>
      <li>Datei speichern und hier mit „Plan-Datei öffnen“ auswählen.</li>
      <li>PIN eingeben – fertig. Neue Wochen einfach mit der nächsten Datei aktualisieren.</li>
    </ol>
    <div class="privacy card">${icon("shield")}<div>Alle Daten bleiben ausschließlich auf diesem Gerät. Die App sendet nichts an einen Server.</div></div>
    <p class="small muted" style="margin-top:18px">Koordination: hier kann auch direkt eine <b>BhP_*.json</b> aus dem Behandlungsplan geöffnet werden.</p>
  </div>`;
}
function viewLock() {
  const enc = store.loadEncrypted();
  const m = (enc && enc.meta) || {};
  return `<div class="welcome">
    <img src="icons/icon-192.png" alt="">
    <h1>${icon("lock")} Gesperrt</h1>
    <p>${m.owner ? `Plan von ${h(m.owner)}` : "Wochenplan"}${m.range ? ` · ${h(fmtRange(m.range))}` : ""}</p>
    <form id="lockf" class="card" style="padding:16px;text-align:left;max-width:380px;margin:0 auto" autocomplete="off">
      <div class="field"><label for="lp">PIN</label><input id="lp" class="input pin" type="password" inputmode="numeric" autocomplete="off" required></div>
      <p class="small" id="lerr" style="color:var(--danger);min-height:1.2em;margin:0 0 8px"></p>
      <button class="btn primary block" type="submit">Entsperren</button>
    </form>
    <button class="btn ghost" data-act="open-file" style="margin-top:16px">Andere Plan-Datei öffnen</button>
  </div>`;
}
function mountLock() {
  const f = $("#lockf");
  const inp = $("#lp");
  setTimeout(() => inp && inp.focus(), 100);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Prüfe …";
    try { await unlock(inp.value); } catch (err) {
      $("#lerr").textContent = err.code === "BAD_PIN" ? "Falsche PIN." : "Fehler: " + err.message;
      btn.disabled = false;
      btn.textContent = "Entsperren";
      inp.select();
    }
  };
}

// ── Tagesansicht ──────────────────────────────────────────────────
function weekStrip(key, kind) {
  const mon = mondayOf(parseDateKey(S.date));
  const t = todayKey();
  return `<div class="weekstrip">${DAYS.map((d, i) => {
    const dk = dateKey(addDays(mon, i));
    const day = S.plan.days[dk];
    let dots = "";
    if (kind === "staff" && key) {
      const sd = staffDay(S.plan, dk, key);
      const n = sd.items.filter((x) => x.k === "entry" && !x.pause).length;
      dots = Array.from({ length: Math.min(n, 4) }, () => "<i></i>").join("") + (sd.status ? '<i class="n"></i>' : "");
    } else if (day) {
      const n = Object.values(day.staff).reduce((a, sd) => a + sd.items.filter((x) => x.k === "entry" && !x.pause).length, 0);
      dots = n ? "<i></i>".repeat(Math.min(4, Math.ceil(n / 8))) : "";
    }
    return `<button data-act="date" data-d="${dk}" class="${dk === t ? "today" : ""} ${day && day.holiday ? "hol" : ""}" aria-pressed="${dk === S.date}" aria-label="${WEEKDAY_LONG[(i + 1) % 7]} ${fmtDate(parseDateKey(dk))}">
      <span class="wd">${d.label}</span><span class="dn">${parseDateKey(dk).getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join("")}</div>`;
}

function dayBar(extraBtns = "") {
  const L = dayLabel(S.date);
  return `<div class="daybar">
    <button class="icon-btn" data-act="shift" data-n="-1" aria-label="Vorheriger Tag">${icon("left")}</button>
    <div class="grow"><h1>${h(L.rel)}</h1><div class="sub">${h(L.full)}</div></div>
    ${S.date !== todayKey() ? `<button class="btn sm" data-act="today">Heute</button>` : ""}
    ${extraBtns}
    <button class="icon-btn" data-act="shift" data-n="1" aria-label="Nächster Tag">${icon("right")}</button>
  </div>`;
}

function dayBanners(dk) {
  const d = S.plan.days[dk];
  let out = "";
  if (d && d.holiday) out += `<div class="banner hol">${icon("info")}<div>Feiertag</div></div>`;
  if (d && d.note) out += `<div class="banner note" ${d.noteColor ? `style="background:${d.noteColor};color:#1f1d18"` : ""}>${icon("note")}<div>${h(d.note)}</div></div>`;
  return out;
}

function viewTag() {
  const k = meKey();
  if (!k) return dayBar() + `<div class="empty"><div class="big">👤</div>Bitte zuerst auswählen, wessen Plan angezeigt werden soll.<br><br><button class="btn primary" data-act="pick-staff">Mitarbeiter wählen</button></div>`;
  const dk = S.date;
  const sd = staffDay(S.plan, dk, k);
  const inRange = S.plan.range && S.plan.range.from && dk >= S.plan.range.from && dk <= S.plan.range.to;
  const conflicts = dayConflicts(S.plan, dk);
  const entries = sd.items.filter((x) => x.k === "entry" && !x.pause);
  const ranges = entries.map((x) => parseTimeRange(x.time)).filter(Boolean);
  const isToday = dk === todayKey();
  const now = nowMinutes();
  let nowIt = null, nextIt = null;
  if (isToday) {
    for (const it of entries) {
      const r = parseTimeRange(it.time);
      if (!r) continue;
      if (r.start <= now && now < Math.max(r.end, r.start + 1)) { nowIt = it; break; }
      if (r.start > now && !nextIt) nextIt = it;
    }
  }
  const doneCount = entries.filter((it) => S.done[itemKey(dk, k, it)]).length;

  let html = dayBar(`<button class="icon-btn" data-act="share-day" aria-label="Tag teilen">${icon("share")}</button>`) + weekStrip(k, "staff") + dayBanners(dk);
  if (sd.status) {
    const c = STATUS_COLORS[sd.status] || { bg: "var(--surface-2)", text: "var(--text)" };
    html += `<div class="banner status" style="background:${c.bg};color:${c.text}">${icon("info")}<div>${h(sd.status)}</div></div>`;
  }
  if (isSunday(dk)) return html + `<div class="empty"><div class="big">☀️</div>Sonntag – kein Plan.</div>`;
  if (!sd.items.length) {
    return html + `<div class="empty"><div class="big">🗓️</div>${inRange ? "Keine Termine an diesem Tag." : `Für diesen Tag liegt noch kein Plan vor.<br><span class="small">Plan-Datei gültig: ${h(fmtRange(S.plan.range))}</span>`}</div>`;
  }
  if (entries.length) {
    const first = ranges.length ? Math.min(...ranges.map((r) => r.start)) : null;
    const last = ranges.length ? Math.max(...ranges.map((r) => r.end)) : null;
    html += `<div class="summary"><span class="chip">${icon("clock", "sm")} ${entries.length} Termin${entries.length === 1 ? "" : "e"}${first != null ? ` · ${minToHHMM(first)}–${minToHHMM(last)}` : ""}</span>
      ${doneCount ? `<span class="chip ok">${icon("check", "sm")} ${doneCount}/${entries.length} erledigt</span>` : ""}
      ${conflicts.size && entries.some((e) => conflicts.has(e)) ? `<span class="chip warn">${icon("alert", "sm")} Überschneidung</span>` : ""}</div>`;
  }
  html += `<div class="list">` + sd.items.map((it, idx) => {
    if (it.k === "notiz") return notizHtml(it);
    return apptHtml(it, idx, dk, k, { now: it === nowIt, next: it === nextIt, conflicts: conflicts.get(it) });
  }).join("") + `</div>`;
  return html;
}

function notizHtml(it) {
  if (it.kind === "auto") return `<div class="notiz auto">${icon("car")}<div><b>${h(it.plate)}</b>${it.time ? ` · ${h(it.time)}` : ""}${it.privat ? " · Privatfahrzeug" : ""}${it.text.includes(" – ") ? `<div class="small muted">${h(it.text.split(" – ").slice(1).join(" – "))}</div>` : ""}</div></div>`;
  if (it.kind === "ende") return `<div class="notiz ende ${it.home ? "" : "back"}">${icon(it.home ? "home" : "car")}<div>${h(it.text)}</div></div>`;
  return `<div class="notiz">${icon("note")}<div style="white-space:pre-line">${h(it.text)}</div></div>`;
}

function apptHtml(it, idx, dk, k, { now, next, conflicts } = {}) {
  const r = parseTimeRange(it.time);
  const t1 = r ? minToHHMM(r.start) : it.time || "–";
  const t2 = r && r.end !== r.start ? minToHHMM(r.end % 1440) : "";
  if (it.pause) {
    return `<div class="appt-wrap"><div class="appt card pause"><div class="bar" style="background:var(--border)"></div><div class="time"><div class="t1">${h(t1)}</div><div class="t2">${h(t2)}</div></div><div class="body"><div class="who">☕ Mittagspause</div></div></div></div>`;
  }
  const p = it.pid && S.plan.patients[it.pid];
  const done = !!S.done[itemKey(dk, k, it)];
  const withNames = (it.with || []).map((x) => staffName(S.plan, x));
  const color = abtColor(it.abt || (staffByKey(S.plan, k) || {}).abt);
  const tel = p ? phoneNumbers(p.contact) : [];
  const actions = [];
  if (p && p.address) actions.push(`<a class="btn sm" href="${h(mapsUrl(p.address))}" target="_blank" rel="noopener">${icon("nav", "sm")} Route</a>`);
  if (tel.length) actions.push(`<a class="btn sm" href="tel:${h(tel[0].tel)}">${icon("phone", "sm")} Anrufen</a>`);
  return `<div class="appt-wrap ${done ? "done" : ""} ${now ? "now" : ""}">
    <div class="card" style="overflow:hidden">
      <div class="appt">
        <div class="bar" style="background:${color}"></div>
        <div class="time"><div class="t1">${h(t1)}</div><div class="t2">${h(t2)}</div></div>
        <button class="body" data-act="patient" data-i="${idx}" aria-label="Details zu ${h(it.label)}">
          <div class="who">${h(it.label || "(ohne Namen)")}</div>
          <div class="meta">
            ${it.type ? `<span class="chip abt" style="background:${color}">${h(typeLabel(it.type))}</span>` : ""}
            ${it.beh ? `<span class="chip">${h(it.beh)}</span>` : ""}
            ${withNames.length ? `<span class="chip accent">${icon("team", "sm")} ${it.role === "partner" ? "mit" : "+"} ${h(withNames.join(", "))}</span>` : ""}
            ${it.src === "wp" ? `<span class="chip">Wochenplan</span>` : ""}
            ${now ? `<span class="chip ok">Jetzt</span>` : next ? `<span class="chip accent">Als Nächstes</span>` : ""}
          </div>
          ${it.note ? `<div class="note">${h(it.note)}</div>` : ""}
          ${it.hint ? `<div class="note hint">⚠ ${h(it.hint)}</div>` : ""}
          ${(conflicts || []).map((c) => `<div class="conflict">${icon("alert", "sm")}<span>${h(c)}</span></div>`).join("")}
        </button>
        <button class="check" data-act="done" data-i="${idx}" aria-pressed="${done}" aria-label="Als erledigt markieren"><span class="box">${done ? icon("check", "sm") : ""}</span></button>
      </div>
      ${actions.length ? `<div class="actions">${actions.join("")}</div>` : ""}
    </div></div>`;
}

// ── Wochenansicht ─────────────────────────────────────────────────
function viewWoche() {
  const k = meKey();
  const mon = mondayOf(parseDateKey(S.date));
  const w = isoWeek(mon);
  const sat = addDays(mon, 5);
  let html = `<div class="daybar">
    <button class="icon-btn" data-act="shift" data-n="-7" aria-label="Vorherige Woche">${icon("left")}</button>
    <div class="grow"><h1>KW ${w.week}</h1><div class="sub">${fmtDateShort(mon)} – ${fmtDate(sat)}</div></div>
    ${dateKey(mondayOf(new Date())) !== dateKey(mon) ? `<button class="btn sm" data-act="today">Heute</button>` : ""}
    <button class="icon-btn" data-act="shift" data-n="7" aria-label="Nächste Woche">${icon("right")}</button>
  </div>`;
  if (!k) return html + `<div class="empty">Bitte zuerst einen Mitarbeiter wählen.<br><br><button class="btn primary" data-act="pick-staff">Mitarbeiter wählen</button></div>`;
  let total = 0;
  const cols = DAYS.map((d, i) => {
    const dk = dateKey(addDays(mon, i));
    const day = S.plan.days[dk];
    const sd = staffDay(S.plan, dk, k);
    const entries = sd.items.filter((x) => x.k === "entry" && !x.pause);
    total += entries.length;
    const rows = sd.items.map((it) => {
      if (it.k === "notiz") {
        if (it.kind === "ende") return `<div class="wrow n"><span class="tm">${it.home ? "🏠" : "↩︎"}</span><span class="lb">${it.home ? "Auto mit nach Hause" : "Auto zurück zum Standort"}</span></div>`;
        return `<div class="wrow n"><span class="tm">${it.kind === "auto" ? "🚗" : "📝"}</span><span class="lb">${h(it.kind === "auto" ? it.plate + (it.time ? " (" + it.time + ")" : "") : it.text)}</span></div>`;
      }
      const done = S.done[itemKey(dk, k, it)];
      return `<div class="wrow" ${done ? 'style="opacity:.5"' : ""}><span class="dot" style="background:${it.pause ? "var(--border)" : abtColor(it.abt)}"></span><span class="tm">${h(it.time)}</span><span class="lb">${it.pause ? '<span class="muted">Mittagspause</span>' : h(it.label)}</span></div>`;
    }).join("");
    return `<section class="card wday">
      <button class="wday-head ${dk === todayKey() ? "today" : ""}" data-act="goto-day" data-d="${dk}">
        <span class="d">${d.long}</span><span class="muted small">${fmtDateShort(parseDateKey(dk))}</span>
        <span class="grow"></span>${entries.length ? `<span class="chip">${entries.length}</span>` : ""}${icon("right", "sm")}
      </button>
      <div class="wday-body">
        ${day && day.holiday ? `<div class="wrow" style="color:var(--danger)"><b>Feiertag</b></div>` : ""}
        ${sd.status ? `<div class="wrow"><span class="chip" style="background:${(STATUS_COLORS[sd.status] || {}).bg};color:${(STATUS_COLORS[sd.status] || {}).text};border:0">${h(sd.status)}</span></div>` : ""}
        ${day && day.note ? `<div class="wrow n"><span class="lb" style="white-space:pre-line">📌 ${h(day.note)}</span></div>` : ""}
        ${rows || (!sd.status && !(day && day.holiday) ? `<div class="wrow n"><span class="lb">—</span></div>` : "")}
      </div></section>`;
  }).join("");
  html += `<div class="summary"><span class="chip">${total} Termine in dieser Woche</span></div><div class="week">${cols}</div>`;
  return html;
}

// ── Team (Koordination) ───────────────────────────────────────────
function viewTeam() {
  const dk = S.date;
  let html = dayBar() + weekStrip(null, "team") + dayBanners(dk);
  html += `<label class="searchbox">${icon("search")}<input id="teamq" type="search" placeholder="Mitarbeiter oder Patient suchen" value="${h(S.teamQuery)}" aria-label="Suchen"></label>`;
  return html + `<div id="teamres">${teamResults()}</div>`;
}
function teamResults() {
  const dk = S.date;
  const day = S.plan.days[dk];
  const conflicts = dayConflicts(S.plan, dk);
  const q = S.teamQuery.trim().toLowerCase();
  let html = "";
  const staff = activeStaff(S.plan);
  const groups = [...new Set([...KNOWN_ABTEILUNGEN, ...staff.map((s) => s.abt)])];
  let any = false;
  groups.forEach((abt) => {
    const members = staff.filter((s) => s.abt === abt).map((s) => ({ s, sd: staffDay(S.plan, dk, s.key) }))
      .filter(({ s, sd }) => {
        if (!sd.items.length && !sd.status) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q) || sd.items.some((it) => (it.label || it.text || "").toLowerCase().includes(q));
      });
    if (!members.length) return;
    any = true;
    html += `<section class="team-group"><h2><span class="sw" style="background:${abtColor(abt)}"></span>${h(abt)} <span class="muted small">${members.length}</span></h2><div class="team-grid">`;
    members.forEach(({ s, sd }) => {
      const nConf = sd.items.filter((it) => conflicts.has(it)).length;
      const entries = sd.items.filter((x) => x.k === "entry" && !x.pause).length;
      html += `<article class="card staff-card ${nConf ? "conf" : ""}">
        <button class="head" data-act="open-staff" data-k="${h(s.key)}">
          <span class="avatar" style="background:${abtColor(s.abt)}">${h(initials(s.name))}</span>
          <span class="grow"><span class="nm">${h(s.name)}</span><br><span class="small muted">${entries} Termin${entries === 1 ? "" : "e"}</span></span>
          ${sd.status ? `<span class="chip" style="background:${(STATUS_COLORS[sd.status] || {}).bg};color:${(STATUS_COLORS[sd.status] || {}).text};border:0">${h(sd.status)}</span>` : ""}
          ${nConf ? `<span class="chip warn">${icon("alert", "sm")} ${nConf}</span>` : ""}
          ${icon("right", "sm")}
        </button>
        <div class="body">${sd.items.map((it) => {
          if (it.k === "notiz") {
            if (it.kind === "ende") return `<div class="wrow n"><span class="tm">${it.home ? "🏠" : "↩︎"}</span><span class="lb">${it.home ? "Auto mit nach Hause" : "Auto zurück"}</span></div>`;
            return `<div class="wrow n"><span class="tm">${it.kind === "auto" ? "🚗" : "📝"}</span><span class="lb">${h(it.kind === "auto" ? it.plate + (it.time ? " (" + it.time + ")" : "") : it.text)}</span></div>`;
          }
          const c = conflicts.get(it);
          return `<div class="wrow" ${c ? `title="${h(c.join(" "))}" style="color:var(--danger)"` : ""}><span class="tm">${h(it.time)}</span><span class="lb">${it.pause ? '<span class="muted">Mittagspause</span>' : h(it.label)}${c ? " ⚠" : ""}</span></div>`;
        }).join("")}</div>
      </article>`;
    });
    html += `</div></section>`;
  });
  if (!any) html += `<div class="empty"><div class="big">🗓️</div>${q ? "Keine Treffer." : day && day.holiday ? "Feiertag." : "Keine Einträge an diesem Tag."}</div>`;
  return html;
}

// ── Mehr / Einstellungen ──────────────────────────────────────────
function viewMehr() {
  const p = S.plan;
  const s = S.settings;
  const me = staffByKey(p, s.me);
  const nStaff = activeStaff(p).length;
  const nDays = Object.keys(p.days).length;
  const seg = (name, val, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="set" data-k="${name}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join("")}</div>`;
  const locked = !!S.lockPin;
  const mapsVal = s.maps || (isApple() ? "apple" : "google");
  return `
  <div class="section-title">Mein Plan</div>
  <div class="card menu">
    <button class="menu-item" data-act="pick-staff">${icon("user")}<span class="lbl">Ich bin</span><span class="val">${h(me ? me.name : "nicht gewählt")}</span>${icon("right", "sm")}</button>
    <div class="menu-item">${icon("info")}<span class="lbl">Datenstand<div class="small muted">${h(p.kind === "personal" ? "Persönlicher Plan" : "Team-Plan")} · ${nStaff} Mitarbeiter · ${nDays} Tage<br>Zeitraum ${h(fmtRange(p.range))}<br>Stand Behandlungsplan ${h(new Date(p.stand || p.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }))}</div></span></div>
    <button class="menu-item" data-act="open-file">${icon("file")}<span class="lbl">Neue Plan-Datei öffnen<div class="small muted">Ersetzt den aktuellen Plan${s.coordinator ? " · auch BhP_*.json oder Wochenplan-Export" : ""}</div></span>${icon("right", "sm")}</button>
  </div>

  ${s.coordinator || nStaff > 1 ? `
  <div class="section-title">Koordination</div>
  <div class="card menu">
    <button class="menu-item" data-act="view" data-v="verteiler">${icon("send")}<span class="lbl">Pläne an Mitarbeiter verteilen<div class="small muted">Persönliche, verschlüsselte Datei je Mitarbeiter erstellen und teilen</div></span>${icon("right", "sm")}</button>
    <button class="menu-item" data-act="open-file">${icon("week")}<span class="lbl">Desktop-Wochenplan-Export einmischen<div class="small muted">Wochenplan_KW##_*.json – übernimmt Urlaub/Krank und manuelle Einträge</div></span>${icon("right", "sm")}</button>
  </div>` : ""}

  <div class="section-title">Sicherheit</div>
  <div class="card menu">
    <div class="menu-item">${icon("lock")}<span class="lbl">PIN-Sperre<div class="small muted">${locked ? "Plan ist auf dem Gerät verschlüsselt." : "Plan liegt unverschlüsselt auf dem Gerät."}</div></span>
      <label class="switch"><input type="checkbox" data-act="toggle-lock" ${locked ? "checked" : ""} aria-label="PIN-Sperre"><span></span></label></div>
    ${locked ? `<button class="menu-item" data-act="lock-now">${icon("lock")}<span class="lbl">Jetzt sperren</span></button>` : ""}
  </div>

  <div class="section-title">Anzeige</div>
  <div class="card menu">
    <div class="menu-item">${icon("palette")}<span class="lbl">Design</span>${seg("theme", s.theme, [["auto", "Auto"], ["light", "Hell"], ["dark", "Dunkel"]])}</div>
    <div class="menu-item">${icon("text")}<span class="lbl">Schrift</span>${seg("textSize", s.textSize, [["normal", "Normal"], ["large", "Groß"]])}</div>
    <div class="menu-item">${icon("map")}<span class="lbl">Karten-App</span>${seg("maps", mapsVal, [["google", "Google"], ["apple", "Apple"]])}</div>
  </div>

  <div class="section-title">App</div>
  <div class="card menu">
    <button class="menu-item" data-act="install-help">${icon("install")}<span class="lbl">Auf dem Startbildschirm installieren</span>${icon("right", "sm")}</button>
    <button class="menu-item" data-act="check-update">${icon("refresh")}<span class="lbl">Nach Updates suchen</span><span class="val">v${APP_VERSION}</span></button>
    <div class="menu-item">${icon("shield")}<span class="lbl">Datenschutz<div class="small muted">Die App arbeitet komplett offline. Plan-Daten werden nur lokal auf diesem Gerät gespeichert und nie an einen Server gesendet.</div></span></div>
    <button class="menu-item danger" data-act="wipe">${icon("trash")}<span class="lbl">Alle Daten von diesem Gerät löschen</span></button>
  </div>
  <p class="small muted" style="text-align:center;margin-top:18px">MoGeRe Gold GmbH · Mobile Geriatrische Rehabilitation</p>`;
}

// ── Mitarbeiter-Auswahl ───────────────────────────────────────────
function openStaffPicker(first = false) {
  const staff = activeStaff(S.plan);
  const groups = [...new Set([...KNOWN_ABTEILUNGEN, ...staff.map((s) => s.abt)])];
  const cur = meKey();
  const body = groups.map((abt) => {
    const m = staff.filter((s) => s.abt === abt);
    if (!m.length) return "";
    return `<div class="section-title" style="margin-top:14px">${h(abt)}</div><div class="staff-pick">${m.map((s) => `
      <button class="staff-opt" data-close="${h(s.key)}" aria-pressed="${s.key === cur}">
        <span class="avatar" style="background:${abtColor(s.abt)}">${h(initials(s.name))}</span>
        <span><span class="nm">${h(s.name)}</span><br><span class="ab">${h(s.key)}</span></span></button>`).join("")}</div>`;
  }).join("");
  openSheet(`<h2>${first ? "Wer bist du?" : "Mitarbeiter wählen"}</h2>
    <p class="muted small">${first ? "Wähle deinen Namen – die App merkt sich die Auswahl." : "Dein eigener Plan wird beim Start angezeigt."}</p>${body}
    ${staff.length ? "" : `<div class="empty">Keine Mitarbeiter im Plan.</div>`}`).then((k) => {
    if (!k) return;
    S.settings.me = k;
    S.viewStaff = null;
    saveSettings();
    render();
  });
}

// ── Patient-Details ───────────────────────────────────────────────
function openPatient(it, k) {
  const p = (it.pid && S.plan.patients[it.pid]) || { name: it.label };
  const tel = phoneNumbers(p.contact);
  const appts = it.pid ? patientAppointments(S.plan, it.pid, isTeamPlan() ? null : k, todayKey()) : [];
  const rows = appts.slice(0, 30).map(({ date, staff, it: a }) => `<div class="wrow"><span class="tm">${WEEKDAY_SHORT[parseDateKey(date).getDay()]} ${fmtDateShort(parseDateKey(date))}</span><span class="lb">${h(a.time)} · ${h(typeLabel(a.type) || "Termin")}${isTeamPlan() ? ` · <span class="muted">${h(staffName(S.plan, staff))}</span>` : ""}</span></div>`).join("");
  openSheet(`<h2>${h(p.name)}</h2>
    <div class="card" style="padding:14px">
      <dl class="kv">
        ${p.address ? `<dt>Adresse</dt><dd>${h(p.address)}</dd>` : ""}
        ${p.contact ? `<dt>Kontakt</dt><dd>${h(p.contact)}</dd>` : ""}
        ${p.km ? `<dt>Entfernung</dt><dd>${h(p.km)} km${p.minutes ? ` · ca. ${h(p.minutes)} Min.` : ""}</dd>` : ""}
        <dt>Termin</dt><dd>${h(it.time)}${it.type ? " · " + h(typeLabel(it.type)) : ""}${it.beh ? " · " + h(it.beh) : ""}</dd>
        ${it.note ? `<dt>Notiz</dt><dd>${h(it.note)}</dd>` : ""}
        ${it.hint ? `<dt>Hinweis</dt><dd style="color:var(--warn)">${h(it.hint)}</dd>` : ""}
      </dl>
      ${!p.address && !p.contact ? `<p class="small muted" style="margin:10px 0 0">Adresse/Telefon sind in dieser Plan-Datei nicht enthalten.</p>` : ""}
    </div>
    <div class="sheet-actions" style="flex-wrap:wrap">
      ${p.address ? `<a class="btn primary" href="${h(mapsUrl(p.address))}" target="_blank" rel="noopener">${icon("nav")} Route starten</a>` : ""}
      ${tel.map((t) => `<a class="btn" href="tel:${h(t.tel)}">${icon("phone")} ${h(t.tel)}</a>`).join("")}
    </div>
    ${rows ? `<div class="section-title">Nächste Termine</div><div class="card" style="padding:6px 0">${rows}</div>` : ""}
    <div class="sheet-actions"><button class="btn" data-close="">Schließen</button></div>`);
}

// ── Tag teilen (Text) ─────────────────────────────────────────────
async function shareDay() {
  const k = meKey();
  const sd = staffDay(S.plan, S.date, k);
  const L = dayLabel(S.date);
  const lines = [`${L.full} – ${staffName(S.plan, k)}`];
  const day = S.plan.days[S.date];
  if (day && day.note) lines.push("📌 " + day.note.replace(/\n/g, " · "));
  sd.items.forEach((it) => {
    if (it.k === "notiz") lines.push((it.kind === "auto" ? "🚗 " : "• ") + it.text);
    else lines.push(`${it.time}  ${it.label}${it.type ? " (" + typeLabel(it.type) + ")" : ""}`);
  });
  const text = lines.join("\n");
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast("In die Zwischenablage kopiert."); }
  } catch (e) { /* abgebrochen */ }
}

// ── Verteiler ─────────────────────────────────────────────────────
function vtInit() {
  if (S.vt) return S.vt;
  const mon = mondayOf(parseDateKey(defaultDate())); // sonntags: ab der kommenden Woche
  S.vt = {
    sel: new Set(),
    from: dateKey(mon),
    weeks: 4,
    addresses: true,
    notes: true,
    encrypt: cryptoAvailable(),
    pin: randomPin(),
    results: [],
  };
  return S.vt;
}
const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
const vtTo = (vt) => dateKey(addDays(parseDateKey(vt.from), vt.weeks * 7 - 2));

function viewVerteiler() {
  const vt = vtInit();
  const staff = activeStaff(S.plan);
  const groups = [...new Set([...KNOWN_ABTEILUNGEN, ...staff.map((s) => s.abt)])];
  const to = vtTo(vt);
  const countFor = (key) => {
    let n = 0;
    Object.entries(S.plan.days).forEach(([dk, d]) => {
      if (dk < vt.from || dk > to) return;
      const sd = d.staff[key];
      if (sd) n += sd.items.filter((x) => x.k === "entry" && !x.pause).length;
    });
    return n;
  };
  return `<div class="daybar"><button class="icon-btn" data-act="view" data-v="mehr" aria-label="Zurück">${icon("back")}</button>
    <div class="grow"><h1>Pläne verteilen</h1><div class="sub">Persönliche Datei je Mitarbeiter</div></div></div>

  <div class="section-title">1 · Zeitraum</div>
  <div class="card" style="padding:14px">
    <div class="row" style="flex-wrap:wrap;gap:12px">
      <div class="field grow" style="min-width:150px;margin:0"><label for="vtfrom">Ab</label><input class="input" id="vtfrom" type="date" value="${vt.from}"></div>
      <div class="field" style="margin:0"><label for="vtweeks">Wochen</label>
        <select class="input" id="vtweeks">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => `<option value="${n}" ${n === vt.weeks ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    </div>
    <p class="small muted" style="margin:10px 0 0">${fmtDate(parseDateKey(vt.from))} – ${fmtDate(parseDateKey(to))} · Plan enthält ${h(fmtRange(S.plan.range))}</p>
  </div>

  <div class="section-title">2 · Mitarbeiter</div>
  <div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="vt-all">Alle mit Terminen</button><button class="btn sm" data-act="vt-none">Keine</button><span class="grow"></span><span class="small muted">${vt.sel.size} gewählt</span></div>
  ${groups.map((abt) => {
    const m = staff.filter((s) => s.abt === abt);
    if (!m.length) return "";
    return `<div class="small muted" style="margin:12px 4px 6px">${h(abt)}</div><div class="staff-pick">${m.map((s) => {
      const n = countFor(s.key);
      return `<button class="staff-opt" data-act="vt-toggle" data-k="${h(s.key)}" aria-pressed="${vt.sel.has(s.key)}">
        <span class="avatar" style="background:${abtColor(s.abt)}">${h(initials(s.name))}</span>
        <span><span class="nm">${h(s.name)}</span><br><span class="ab">${n} Termine im Zeitraum</span></span>
        <span class="tick">${vt.sel.has(s.key) ? icon("check", "sm") : ""}</span></button>`;
    }).join("")}</div>`;
  }).join("")}

  <div class="section-title">3 · Inhalt & Schutz</div>
  <div class="card menu">
    <div class="menu-item">${icon("map")}<span class="lbl">Adressen & Telefonnummern<div class="small muted">Nur der eigenen Patienten</div></span><label class="switch"><input type="checkbox" id="vtaddr" ${vt.addresses ? "checked" : ""}><span></span></label></div>
    <div class="menu-item">${icon("note")}<span class="lbl">Tageshinweise mitgeben<div class="small muted">z. B. Teamsitzung, Besprechungen</div></span><label class="switch"><input type="checkbox" id="vtnotes" ${vt.notes ? "checked" : ""}><span></span></label></div>
    <div class="menu-item">${icon("lock")}<span class="lbl">Mit PIN verschlüsseln<div class="small muted">Dringend empfohlen (Patientendaten)</div></span><label class="switch"><input type="checkbox" id="vtenc" ${vt.encrypt ? "checked" : ""} ${cryptoAvailable() ? "" : "disabled"}><span></span></label></div>
    <div class="menu-item" ${vt.encrypt ? "" : "hidden"} id="vtpinrow">${icon("key")}<span class="lbl">PIN<input class="input pin" id="vtpin" value="${h(vt.pin)}" inputmode="numeric" autocomplete="off" style="margin-top:6px;max-width:220px"><div class="small muted" style="margin-top:6px">Die PIN getrennt von der Datei weitergeben (mündlich, SMS) – nie in derselben Nachricht.</div></span>
      <button class="btn sm" data-act="vt-newpin">Neu</button></div>
  </div>

  <div class="section-title">4 · Erstellen</div>
  <div class="row" style="flex-wrap:wrap">
    <button class="btn primary grow" data-act="vt-make" data-mode="single" ${vt.sel.size ? "" : "disabled"}>${icon("send")} Einzeldateien (${vt.sel.size})</button>
    <button class="btn grow" data-act="vt-make" data-mode="team" ${vt.sel.size > 1 ? "" : "disabled"}>${icon("team")} Eine Team-Datei</button>
  </div>
  <div id="vtresults" style="margin-top:14px">${vtResultsHtml()}</div>`;
}

function vtResultsHtml() {
  const vt = S.vt;
  if (!vt || !vt.results.length) return "";
  return `<div class="list">${vt.results.map((r, i) => `<div class="card filecard">
      <span class="avatar" style="background:${abtColor(r.abt)}">${h(r.initials)}</span>
      <div class="grow"><div class="nm">${h(r.title)}</div><div class="small muted">${h(r.file.name)} · ${Math.max(1, Math.round(r.file.size / 1024))} KB · ${r.count} Termine${r.enc ? " · 🔒" : ""}</div></div>
      <button class="icon-btn" data-act="vt-share" data-i="${i}" aria-label="Teilen">${icon("share")}</button>
      <button class="icon-btn" data-act="vt-save" data-i="${i}" aria-label="Speichern">${icon("download")}</button>
    </div>`).join("")}</div>
    ${vt.results.some((r) => r.enc) ? `<div class="banner info" style="margin-top:12px">${icon("key")}<div>PIN für diese Dateien: <b style="font-size:1.1rem;letter-spacing:.15em">${h(vt.results[0].pin)}</b></div></div>` : ""}`;
}

function mountVerteiler() {
  const vt = S.vt;
  $("#vtfrom").onchange = (e) => { if (e.target.value) { vt.from = dateKey(mondayOf(parseDateKey(e.target.value))); vt.results = []; render(); } };
  $("#vtweeks").onchange = (e) => { vt.weeks = Number(e.target.value); vt.results = []; render(); };
  $("#vtaddr").onchange = (e) => { vt.addresses = e.target.checked; vt.results = []; };
  $("#vtnotes").onchange = (e) => { vt.notes = e.target.checked; vt.results = []; };
  $("#vtenc").onchange = (e) => { vt.encrypt = e.target.checked; vt.results = []; $("#vtpinrow").hidden = !vt.encrypt; };
  $("#vtpin").oninput = (e) => { vt.pin = e.target.value.trim(); vt.results = []; };
}

async function vtMake(mode) {
  const vt = S.vt;
  if (vt.encrypt && vt.pin.length < 4) return toast("PIN muss mindestens 4 Zeichen haben.");
  if (!vt.encrypt) {
    const c = await askChoice("Ohne Verschlüsselung?", "Die Dateien enthalten Patientennamen" + (vt.addresses ? ", Adressen und Telefonnummern" : "") + ". Unverschlüsselt kann sie jeder lesen, der die Datei erhält.", [
      { label: "Trotzdem unverschlüsselt", value: "ok", danger: true }, { label: "Abbrechen", value: "cancel", primary: true }]);
    if (c !== "ok") return;
  }
  const to = vtTo(vt);
  const sets = mode === "team" ? [[...vt.sel]] : [...vt.sel].map((k) => [k]);
  const btns = el.main.querySelectorAll("[data-act='vt-make']");
  btns.forEach((b) => (b.disabled = true));
  const out = [];
  const stamp = new Date();
  const range = `${fmtDateShort(parseDateKey(vt.from))}-${fmtDate(parseDateKey(to))}`;
  for (const keys of sets) {
    const sub = subsetPlan(S.plan, keys, vt.from, to, { addresses: vt.addresses, dayNotes: vt.notes });
    const count = Object.values(sub.days).reduce((a, d) => a + Object.values(d.staff).reduce((b, sd) => b + sd.items.filter((x) => x.k === "entry" && !x.pause).length, 0), 0);
    const payload = vt.encrypt ? await encryptPlan(sub, vt.pin, planMeta(sub)) : sub;
    const one = keys.length === 1 ? staffByKey(S.plan, keys[0]) : null;
    const name = `Wochenplan_${safeFile(one ? one.key : "Team")}_${range}.json`;
    const file = new File([JSON.stringify(payload)], name, { type: "application/json", lastModified: stamp.getTime() });
    out.push({ file, title: one ? one.name : `Team (${keys.length} Mitarbeiter)`, initials: one ? initials(one.name) : "T", abt: one ? one.abt : null, count, enc: vt.encrypt, pin: vt.pin });
  }
  vt.results = out;
  $("#vtresults").innerHTML = vtResultsHtml();
  btns.forEach((b) => (b.disabled = false));
  $("#vtresults").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function vtShare(i) {
  const r = S.vt.results[i];
  const text = `Hallo, hier ist dein Wochenplan (${fmtRange({ from: S.vt.from, to: vtTo(S.vt) })}).\nÖffnen mit der Wochenplan-App: ${appUrl()}` + (r.enc ? "\nDie PIN bekommst du separat." : "");
  if (navigator.canShare && navigator.canShare({ files: [r.file] })) {
    try { await navigator.share({ files: [r.file], title: r.file.name, text }); } catch (e) { if (e.name !== "AbortError") toast("Teilen nicht möglich – bitte speichern."); }
  } else {
    toast("Teilen wird hier nicht unterstützt – Datei wird gespeichert.");
    vtSave(i);
  }
}
function vtSave(i) {
  const r = S.vt.results[i];
  const url = URL.createObjectURL(r.file);
  const a = document.createElement("a");
  a.href = url;
  a.download = r.file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Aktionen ──────────────────────────────────────────────────────
function currentItems() {
  return staffDay(S.plan, S.date, meKey()).items;
}
function shiftDate(n) {
  let d = addDays(parseDateKey(S.date), n);
  if (d.getDay() === 0) d = addDays(d, n > 0 ? 1 : -1);
  S.date = dateKey(d);
  render();
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const a = t.dataset.act;
  switch (a) {
    case "view":
      S.view = t.dataset.v;
      render();
      window.scrollTo(0, 0);
      break;
    case "open-file": pickFile(); break;
    case "pick-staff": openStaffPicker(); break;
    case "back-to-me": S.viewStaff = null; render(); break;
    case "date": S.date = t.dataset.d; render(); break;
    case "shift": shiftDate(Number(t.dataset.n)); break;
    case "today": S.date = defaultDate(); render(); break;
    case "goto-day": S.date = t.dataset.d; S.view = "tag"; render(); window.scrollTo(0, 0); break;
    case "open-staff": S.viewStaff = t.dataset.k === S.settings.me ? null : t.dataset.k; S.view = "tag"; render(); window.scrollTo(0, 0); break;
    case "patient": openPatient(currentItems()[Number(t.dataset.i)], meKey()); break;
    case "done": {
      const it = currentItems()[Number(t.dataset.i)];
      const key = itemKey(S.date, meKey(), it);
      if (S.done[key]) delete S.done[key]; else S.done[key] = 1;
      pruneDone();
      store.saveDone(S.done);
      if (navigator.vibrate) navigator.vibrate(12);
      render();
      break;
    }
    case "share-day": shareDay(); break;
    case "set":
      S.settings[t.dataset.k] = t.dataset.v;
      saveSettings();
      applyTheme();
      render();
      break;
    case "lock-now":
      S.plan = null;
      S.lockPin = null;
      S.locked = true;
      render();
      break;
    case "wipe": {
      const c = await askChoice("Alle Daten löschen?", "Plan, Einstellungen und Häkchen werden von diesem Gerät entfernt.", [
        { label: "Endgültig löschen", value: "yes", danger: true }, { label: "Abbrechen", value: "cancel", primary: true }]);
      if (c !== "yes") return;
      store.clearAll();
      S.plan = null; S.lockPin = null; S.locked = false; S.settings = store.loadSettings(); S.done = {}; S.vt = null;
      renderAll();
      break;
    }
    case "install-help":
      openSheet(`<h2>App installieren</h2>
        <div class="card" style="padding:14px"><b>iPhone / iPad (Safari)</b><ol class="small" style="padding-left:18px;margin:8px 0 0"><li>Unten auf ${icon("share", "sm")} „Teilen“ tippen</li><li>„Zum Home-Bildschirm“ wählen</li><li>„Hinzufügen“ tippen</li></ol></div>
        <div class="card" style="padding:14px;margin-top:10px"><b>Android (Chrome)</b><ol class="small" style="padding-left:18px;margin:8px 0 0"><li>Menü ⋮ oben rechts öffnen</li><li>„App installieren“ bzw. „Zum Startbildschirm hinzufügen“</li></ol>
        <p class="small muted" style="margin:8px 0 0">Nach der Installation kann eine Plan-Datei unter Android auch direkt aus WhatsApp/E-Mail an „Wochenplan“ geteilt werden.</p></div>
        <div class="sheet-actions">${deferredInstall ? `<button class="btn primary" data-act="do-install">Jetzt installieren</button>` : ""}<button class="btn" data-close="">OK</button></div>`);
      break;
    case "do-install":
      if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; closeSheet(); }
      break;
    case "check-update": checkUpdate(true); break;
    case "vt-toggle": {
      const k = t.dataset.k;
      S.vt.sel.has(k) ? S.vt.sel.delete(k) : S.vt.sel.add(k);
      S.vt.results = [];
      const y = window.scrollY; render(); window.scrollTo(0, y);
      break;
    }
    case "vt-all": {
      const to = vtTo(S.vt);
      S.vt.sel = new Set(activeStaff(S.plan).filter((s) => Object.entries(S.plan.days).some(([dk, d]) => dk >= S.vt.from && dk <= to && d.staff[s.key] && d.staff[s.key].items.some((x) => x.k === "entry"))).map((s) => s.key));
      S.vt.results = [];
      const y = window.scrollY; render(); window.scrollTo(0, y);
      break;
    }
    case "vt-none": { S.vt.sel.clear(); S.vt.results = []; const y = window.scrollY; render(); window.scrollTo(0, y); break; }
    case "vt-newpin": S.vt.pin = randomPin(); S.vt.results = []; $("#vtpin").value = S.vt.pin; break;
    case "vt-make": vtMake(t.dataset.mode); break;
    case "vt-share": vtShare(Number(t.dataset.i)); break;
    case "vt-save": vtSave(Number(t.dataset.i)); break;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches("[data-act='toggle-lock']")) {
    e.preventDefault();
    const want = e.target.checked;
    e.target.checked = !want; // Zustand erst nach Bestätigung ändern
    want ? enableLock() : disableLock();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "teamq") {
    S.teamQuery = e.target.value;
    $("#teamres").innerHTML = teamResults();
  }
});

function pruneDone() {
  const limit = dateKey(addDays(new Date(), -90));
  Object.keys(S.done).forEach((k) => { if (k.slice(0, 10) < limit) delete S.done[k]; });
}

// Wischen: Tag vor/zurück
let touch = null;
el.main.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1 || !["tag", "team", "woche"].includes(S.view) || !S.plan) return;
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
el.main.addEventListener("touchend", (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  const fast = Date.now() - touch.t < 600;
  touch = null;
  if (fast && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8 && !sheetClose) shiftDate((dx < 0 ? 1 : -1) * (S.view === "woche" ? 7 : 1));
}, { passive: true });

// Tastatur (Tablet mit Tastatur)
document.addEventListener("keydown", (e) => {
  if (sheetClose || e.target.matches("input, textarea, select") || !S.plan) return;
  if (e.key === "ArrowLeft") shiftDate(S.view === "woche" ? -7 : -1);
  if (e.key === "ArrowRight") shiftDate(S.view === "woche" ? 7 : 1);
});

// Minütlich aktualisieren ("Jetzt"-Markierung)
setInterval(() => {
  if (S.plan && !sheetClose && S.view === "tag" && S.date === todayKey() && document.visibilityState === "visible") {
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.plan && !sheetClose && (S.view === "tag" || S.view === "team")) render();
});

// ── Service Worker / Installation / Share-Target ──────────────────
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });
let swReg = null;
async function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    swReg = await navigator.serviceWorker.register("sw.js");
    const onWaiting = (w) => toast("Neue Version verfügbar.", { label: "Aktualisieren", run: () => w.postMessage({ type: "SKIP_WAITING" }) });
    if (swReg.waiting && navigator.serviceWorker.controller) onWaiting(swReg.waiting);
    swReg.addEventListener("updatefound", () => {
      const nw = swReg.installing;
      nw && nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) onWaiting(nw); });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  } catch (e) { console.warn("SW", e); }
}
async function checkUpdate(manual) {
  if (!swReg) return manual && toast("Offline-Modus nicht verfügbar (nur über https).");
  try {
    await swReg.update();
    if (manual && !swReg.waiting && !swReg.installing) toast(`Aktuell – Version ${APP_VERSION}.`);
  } catch (e) { manual && toast("Keine Verbindung – später erneut versuchen."); }
}
async function consumeSharedFile() {
  const params = new URLSearchParams(location.search);
  if (!params.has("share")) return;
  history.replaceState(null, "", location.pathname);
  try {
    const cache = await caches.open("mgwp-share");
    const res = await cache.match("shared-file");
    if (!res) return;
    const name = decodeURIComponent(res.headers.get("x-filename") || "geteilte Datei");
    const text = await res.text();
    await cache.delete("shared-file");
    await handleText(text, name);
  } catch (e) { toast("Geteilte Datei konnte nicht gelesen werden."); }
}

// ── Start ─────────────────────────────────────────────────────────
function boot() {
  applyTheme();
  const enc = store.loadEncrypted();
  if (enc) S.locked = true;
  else S.plan = store.loadPlan();
  if (S.plan && !isPlan(S.plan)) S.plan = null;
  S.date = defaultDate();
  pruneDone();
  renderAll();
  registerSW();
  consumeSharedFile();
}
boot();

// für Tests / Fehlersuche
window.__mgwp = { S, handleText, render };

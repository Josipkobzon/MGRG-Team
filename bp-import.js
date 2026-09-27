// ═══════════════════════════════════════════════════════════════════
// bp-import.js — Behandlungsplan-JSON (BhP_*.json / Behandlungsplan_*.json)
// → datumsbasiertes Plan-Modell der Mobil-App.
//
// Die Zuordnungsregeln sind 1:1 aus importBehandlungsplan() des Desktop-
// Wochenplans v4 übernommen (THERAPEUT_MAP, TYPE_TO_ABT, Dual-Therapeut,
// KNOWN_ABTEILUNGEN-Whitelist, deletedPatients, KH/PAUSE/SCHLUSS/DIALYSE,
// alignCells, AUTO-Tabelle, Mittagspause, Dienstende-Hinweis, Privat-Auto).
// Zusätzlich werden die Informationen behalten, die unterwegs nützlich sind:
// Behandlungstyp, T-Nummer, Notiz/Hinweis, Partner, Patientenadresse/-telefon.
// ═══════════════════════════════════════════════════════════════════
import {
  THERAPEUT_MAP, FORCE_ABT, TYPE_TO_ABT, KNOWN_ABTEILUNGEN, FALLBACK_ABT, ABT_COLORS,
  MONTH_NAMES, FILE_FORMAT, FILE_VERSION, normDash, parseTimeRange, sortEntriesByTime,
  canonicalKey, dateKey, pad2,
} from "./core.js";

const TW_COLORS = {
  "bg-pink-200": "#fbcfe8", "bg-yellow-200": "#fef08a", "bg-gray-300": "#d1d5db", "bg-gray-200": "#e5e7eb",
  "bg-sky-200": "#bae6fd", "bg-green-200": "#bbf7d0", "bg-red-200": "#fecaca", "bg-blue-200": "#bfdbfe",
  "bg-orange-200": "#fed7aa", "bg-purple-200": "#e9d5ff", "bg-amber-200": "#fde68a", "bg-lime-200": "#d9f99d",
  "bg-emerald-200": "#a7f3d0", "bg-teal-200": "#99f6e4", "bg-indigo-200": "#c7d2fe", "bg-rose-200": "#fecdd3",
};
const KNOWN = new Set(KNOWN_ABTEILUNGEN);
const isPrivateCar = (plate) => /privat/i.test(String(plate || ""));

function alignCells(cells, month, year) {
  if (!Array.isArray(cells)) return [];
  const nd = new Date(year, month, 0).getDate();
  if (cells.length === nd) return cells;
  const nonSun = [];
  for (let dn = 1; dn <= nd; dn++) if (new Date(year, month - 1, dn).getDay() !== 0) nonSun.push(dn);
  if (cells.length === nonSun.length) {
    const out = new Array(nd).fill(null);
    nonSun.forEach((dn, i) => { out[dn - 1] = cells[i]; });
    return out;
  }
  return cells;
}

function cellTypeToAbt(cellType) {
  if (!cellType) return null;
  if (TYPE_TO_ABT[cellType]) return TYPE_TO_ABT[cellType];
  const lower = cellType.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_TO_ABT)) if (k.toLowerCase() === lower) return v;
  return null;
}

function resolveInfo(key) {
  const k = canonicalKey(key);
  if (THERAPEUT_MAP[k]) return { key: k, ...THERAPEUT_MAP[k] };
  const lk = k.toLowerCase();
  if (lk.length >= 3) {
    for (const [mk, mv] of Object.entries(THERAPEUT_MAP)) {
      if (mv.name.toLowerCase().includes(lk) || mk.toLowerCase().includes(lk)) return { key: canonicalKey(mk), ...mv };
    }
  }
  return { key: k, abt: null, name: k, unknown: true };
}

function parseTherapeutenFromCell(cell) {
  const results = [];
  const primaryAbt = cellTypeToAbt(cell.type) || null;
  if (cell.therapeut && cell.therapeut.includes("+")) {
    const parts = cell.therapeut.split("+").map((s) => s.trim()).filter(Boolean);
    const noteRaw = cell.note ? cell.note.trim() : null;
    const noteAbt = noteRaw && KNOWN.has(noteRaw) ? noteRaw : null;
    parts.forEach((key, i) => results.push({ key, abtOverride: i === 0 ? primaryAbt : noteAbt, role: i === 0 ? "lead" : "partner" }));
    return results;
  }
  if (cell.therapeut) {
    results.push({ key: cell.therapeut.trim(), abtOverride: primaryAbt, role: "lead" });
    if (cell.note) {
      const mitMatch = cell.note.match(/\bmit\s+([A-Z][a-z]?\.[A-Za-zÀ-ſ]+)/);
      if (mitMatch) results.push({ key: mitMatch[1], abtOverride: null, role: "partner" });
    }
  }
  return results;
}

// "BhP_25.09.2026_09_29.json" → ISO-Zeitpunkt des BP-Stands (sonst null)
function standFromName(name) {
  const m = String(name || "").match(/(\d{2})[._](\d{2})[._](\d{4})(?:[_ ](\d{2})[_:.](\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).toISOString();
}

/** Liefert die Monatsliste der Datei (für die Auswahl-Frage). */
export function inspectBpFile(bp) {
  const list = [];
  const topIsMonth = Array.isArray(bp.rows) && bp.month && bp.year;
  if (bp.allMonths && typeof bp.allMonths === "object") {
    Object.keys(bp.allMonths)
      .filter((k) => /^behandlungsplan:\d{4}-\d{2}$/.test(k))
      .sort()
      .forEach((k) => {
        const [y, mo] = k.replace("behandlungsplan:", "").split("-").map(Number);
        const md = topIsMonth && Number(bp.year) === y && Number(bp.month) === mo ? bp : bp.allMonths[k];
        if (md && Array.isArray(md.rows)) list.push({ data: md, month: mo, year: y });
      });
  }
  if (!list.length && topIsMonth) list.push({ data: bp, month: Number(bp.month), year: Number(bp.year) });
  const hasEntries = (m) =>
    (m.data.rows || []).some((r) => (r.cells || []).some((c) => c && c.therapeut && String(c.therapeut).trim())) ||
    (m.data.autoRows || []).some((a) => (a.cells || []).some((c) => c && ((Array.isArray(c.slots) && c.slots.some((s) => s && s.mitarbeiter)) || c.therapeut)));
  const withData = list.filter(hasEntries);
  const fmt = (m) => MONTH_NAMES[m.month] + " " + m.year;
  return {
    valid: list.length > 0,
    months: list,
    withData,
    topMonth: topIsMonth ? { month: Number(bp.month), year: Number(bp.year) } : null,
    rangeText: withData.length ? (withData.length === 1 ? fmt(withData[0]) : fmt(withData[0]) + " – " + fmt(withData[withData.length - 1])) : "keine Termine",
  };
}

/**
 * @param {object} bp  geparste BhP-Datei
 * @param {object} opt { onlyTopMonth:boolean, sourceName:string }
 * @returns {{plan:object, stats:object}}
 */
export function importBehandlungsplan(bp, opt = {}) {
  const info = inspectBpFile(bp);
  if (!info.valid) throw new Error("Keine gültige Behandlungsplan-Datei. Bitte eine BhP_*.json bzw. Behandlungsplan_*.json Datei auswählen.");
  let monthList = info.months;
  if (opt.onlyTopMonth && info.topMonth) {
    monthList = monthList.filter((m) => m.month === info.topMonth.month && m.year === info.topMonth.year);
  }

  // gelöschte Patienten
  const deletedIds = new Set(), deletedNames = new Set();
  (Array.isArray(bp.deletedPatients) ? bp.deletedPatients : []).forEach((p) => {
    if (!p) return;
    if (p.id) deletedIds.add(p.id);
    if (p.name) deletedNames.add(String(p.name).trim().toLowerCase());
  });
  const isDeletedRow = (r) => (r.id && deletedIds.has(r.id)) || (r.name && deletedNames.has(String(r.name).trim().toLowerCase()));

  // Mitarbeiter
  const staff = {}; // key → {key,name,abt}
  const staffOrder = [];
  const createdStaff = [];
  function ensureStaff(rawKey, abtHint) {
    const inf = resolveInfo(rawKey);
    if (!inf.key) return null;
    if (staff[inf.key]) return inf.key;
    const abt = FORCE_ABT[inf.key] || abtHint || inf.abt || FALLBACK_ABT;
    staff[inf.key] = { key: inf.key, name: inf.name, abt };
    staffOrder.push(inf.key);
    if (inf.unknown) createdStaff.push({ name: inf.name, abt });
    return inf.key;
  }

  const patients = {};
  const days = {}; // dateKey → {holiday, note, noteColor, staff:{key:{auto:[], items:[]}}}
  const getDay = (dk) => (days[dk] = days[dk] || { holiday: false, note: "", noteColor: "", staff: {} });
  const getStaffDay = (dk, sk) => {
    const d = getDay(dk);
    return (d.staff[sk] = d.staff[sk] || { status: "", auto: [], items: [] });
  };
  const seenMittagspause = new Set();
  const carStatus = {};
  const privateCarDays = new Set();
  let entryCount = 0, autoCount = 0, skippedDeleted = 0;
  let from = null, to = null;

  monthList.forEach(({ data, month, year }) => {
    const nd = new Date(year, month, 0).getDate();
    const mFrom = `${year}-${pad2(month)}-01`, mTo = `${year}-${pad2(month)}-${pad2(nd)}`;
    if (!from || mFrom < from) from = mFrom;
    if (!to || mTo > to) to = mTo;
    const dk = (dn) => dateKey(new Date(year, month - 1, dn));
    const isSun = (dn) => new Date(year, month - 1, dn).getDay() === 0;

    (Array.isArray(data.holidays) ? data.holidays : []).forEach((dn) => {
      const n = Number(dn);
      if (!n || n < 1 || n > nd || isSun(n)) return;
      getDay(dk(n)).holiday = true;
    });
    const noteColors = data.dayNoteColors && typeof data.dayNoteColors === "object" ? data.dayNoteColors : {};
    Object.entries(data.dayNotes && typeof data.dayNotes === "object" ? data.dayNotes : {}).forEach(([dn, txt]) => {
      const n = Number(dn);
      const t = String(txt || "").trim();
      if (!n || n < 1 || n > nd || !t || isSun(n)) return;
      const d = getDay(dk(n));
      d.note = t;
      d.noteColor = TW_COLORS[noteColors[dn]] || "";
    });

    // Patienten-Termine
    (data.rows || []).forEach((row) => {
      if (isDeletedRow(row)) { skippedDeleted++; return; }
      const patient = row.name || "(ohne Namen)";
      const pid = row.id || "n:" + patient;
      patients[pid] = {
        name: patient,
        address: row.address || "",
        contact: row.contact || "",
        km: row.km || "",
        minutes: row.minutes || "",
      };
      alignCells(row.cells, month, year).forEach((cell, idx) => {
        if (!cell || !cell.therapeut || !String(cell.therapeut).trim()) return;
        if (cell.kh || cell.pause || cell.schluss || cell.dialyse) return;
        if (isSun(idx + 1)) return;
        const date = dk(idx + 1);
        const time = normDash(cell.time);
        const people = parseTherapeutenFromCell(cell);
        const keys = people.map(({ key, abtOverride }) => {
          const inf = resolveInfo(key);
          return ensureStaff(key, abtOverride || inf.abt);
        });
        people.forEach(({ abtOverride, role }, i) => {
          const sk = keys[i];
          if (!sk) return;
          const sd = getStaffDay(date, sk);
          sd.items.push({
            k: "entry", src: "bp", time, label: patient, pid,
            type: cell.type || "", beh: cell.behandlung || "",
            note: String(cell.note || "").trim(), hint: String(cell.hinweis || "").trim(),
            abt: abtOverride || staff[sk].abt, role,
            with: keys.filter((k, j) => j !== i && k),
          });
          entryCount++;
          const mpRaw = normDash(cell.mittagspause);
          if (mpRaw) {
            const mpKey = date + "|" + sk + "|" + mpRaw;
            if (!seenMittagspause.has(mpKey)) {
              seenMittagspause.add(mpKey);
              const isRange = /^\d{1,2}(:\d{2})?\s*-\s*\d{1,2}(:\d{2})?$/.test(mpRaw);
              sd.items.push(isRange
                ? { k: "entry", src: "bp", time: mpRaw, label: "Mittagspause", pause: true }
                : { k: "notiz", src: "bp", kind: "mp", text: "Mittagspause: " + mpRaw });
            }
          }
          const r = parseTimeRange(time);
          const endMinutes = r ? r.end : -1;
          const hasAutoHaus = Array.isArray(cell.icons) && cell.icons.includes("auto") && cell.icons.includes("haus");
          const csKey = date + "|" + sk;
          const prev = carStatus[csKey];
          if (!prev || endMinutes >= prev.endMinutes) carStatus[csKey] = { endMinutes, hasAutoHaus };
        });
      });
    });

    // AUTO-Tabelle
    (data.autoRows || []).forEach((auto) => {
      const plate = String(auto.plate || "").trim() || "(ohne Kennzeichen)";
      alignCells(auto.cells, month, year).forEach((cell, idx) => {
        if (!cell) return;
        const slots = Array.isArray(cell.slots) && cell.slots.length
          ? cell.slots
          : (cell.time || cell.therapeut ? [{ time: cell.time || "", mitarbeiter: cell.therapeut || "" }] : []);
        if (!slots.length || isSun(idx + 1)) return;
        const date = dk(idx + 1);
        const noteTxt = String(cell.note || "").trim();
        slots.forEach((s) => {
          if (!s || !s.mitarbeiter) return;
          String(s.mitarbeiter).split("+").map((x) => x.trim()).filter(Boolean).forEach((key) => {
            const sk = ensureStaff(key, null);
            if (!sk) return;
            const t = normDash(s.time);
            const text = "Auto: " + plate + (t ? " (" + t + ")" : "") + (noteTxt ? " – " + noteTxt : "");
            getStaffDay(date, sk).auto.push({ k: "notiz", src: "bp", kind: "auto", plate, time: t, text, privat: isPrivateCar(plate) });
            if (isPrivateCar(plate)) privateCarDays.add(date + "|" + sk);
            autoCount++;
          });
        });
      });
    });
  });

  // Dienstende-Hinweis (wie Desktop: je Mitarbeiter/Tag, außer Privat-Auto)
  Object.entries(carStatus).forEach(([csKey, inf]) => {
    if (privateCarDays.has(csKey)) return;
    const [date, sk] = csKey.split("|");
    getStaffDay(date, sk).items.push({
      k: "notiz", src: "bp", kind: "ende", home: inf.hasAutoHaus,
      text: inf.hasAutoHaus ? "Das Auto darf am Dienstende mit nach Hause genommen werden." : "Das Auto muss zum Standort zurückgebracht werden.",
    });
  });

  // Reihenfolge: Auto-Notiz → Termine (zeitlich) → Dienstende
  Object.values(days).forEach((d) => {
    Object.keys(d.staff).forEach((sk) => {
      const sd = d.staff[sk];
      d.staff[sk] = { status: sd.status, items: sortEntriesByTime([...sd.auto, ...sd.items]) };
    });
  });

  // Mitarbeiterliste: nach Abteilung (Desktop-Reihenfolge), darin in Import-Reihenfolge
  const staffList = staffOrder.map((k) => staff[k]);
  const groups = [...new Set([...KNOWN_ABTEILUNGEN.filter((a) => staffList.some((s) => s.abt === a)), ...staffList.map((s) => s.abt)])]
    .map((name) => ({ name, color: ABT_COLORS[name] || "#e5e5e5" }));

  const plan = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    kind: "team",
    createdAt: new Date().toISOString(),
    stand: standFromName(opt.sourceName),
    source: opt.sourceName || "Behandlungsplan",
    range: { from, to },
    groups,
    staff: staffList,
    patients,
    days,
  };
  return {
    plan,
    stats: {
      months: monthList.length,
      monthText: monthList.length === 1
        ? MONTH_NAMES[monthList[0].month] + " " + monthList[0].year
        : MONTH_NAMES[monthList[0].month] + " " + monthList[0].year + " – " + MONTH_NAMES[monthList[monthList.length - 1].month] + " " + monthList[monthList.length - 1].year,
      entryCount, autoCount, skippedDeleted, createdStaff,
      staffCount: staffList.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// core.js — gemeinsame Konstanten + Zeit-/Datumsfunktionen
// Logik 1:1 aus "06. Wochenplan alle Abteilung MoGeRe Gold v4" übernommen
// ═══════════════════════════════════════════════════════════════════

export const APP_VERSION = "1.0.3";
export const FILE_FORMAT = "mogere-wochenplan";
export const FILE_VERSION = 1;

export const DAYS = [
  { key: "mon", label: "Mo", long: "Montag" },
  { key: "tue", label: "Di", long: "Dienstag" },
  { key: "wed", label: "Mi", long: "Mittwoch" },
  { key: "thu", label: "Do", long: "Donnerstag" },
  { key: "fri", label: "Fr", long: "Freitag" },
  { key: "sat", label: "Sa", long: "Samstag" },
];
export const WEEKDAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const MONTH_NAMES = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export const STATUS_COLORS = {
  Urlaub: { bg: "#cfe0f5", text: "#1d3a66" },
  Krank: { bg: "#f6caca", text: "#7a1f1f" },
  Frei: { bg: "#e2e2e2", text: "#3a3a3a" },
  Fortbildung: { bg: "#f7e2b0", text: "#6b4d12" },
};

// ── Mitarbeiter / Abteilungen (Stand Wochenplan v4) ────────────────
export const THERAPEUT_MAP = {
  "K.Radi": { abt: "Medizin", name: "dr. med. Katalin Radi" },
  "A.Miranda": { abt: "Medizin", name: "Alejandro Miranda" },
  "S.Jaballah": { abt: "Medizin", name: "Sviatlana Jaballah" },
  "J.Maiostre": { abt: "Medizin", name: "Juliana Maiostre" },
  "C.Weißert": { abt: "Physio", name: "Caroline Weißert" },
  "A.Nagy": { abt: "Physio", name: "Alexandra Nagy" },
  "D.Gallon": { abt: "Physio", name: "Daniel Gallon" },
  "D.Gallen": { abt: "Physio", name: "Daniel Gallon" },
  "S.Dachs": { abt: "Physio", name: "Simon Dachs" },
  "A.Schubert": { abt: "Physio", name: "Anette Schubert" },
  "M.Garofano": { abt: "Physio", name: "Maximiliano Garofano" },
  "V.Ricardo": { abt: "Physio", name: "Valentina Ricardo" },
  "Praxis Krause": { abt: "Physio", name: "Intakt Physio" },
  "J.Abraham": { abt: "Ergo", name: "Johnish Abraham" },
  "C.Riedel": { abt: "Ergo", name: "Chiara Riedel" },
  "T.Arany": { abt: "Pflege", name: "Tamas Arany" },
  "C.Steiner": { abt: "Logopädie", name: "Claudia Steiner" },
  "A.Bartelt": { abt: "Psychologie", name: "Alisa Bartelt" },
  "P.Haydn": { abt: "Ernährung", name: "Patricia Haydn" },
  "H.Pasztor": { abt: "Verwaltung", name: "Henriette Pasztor" },
};
export const KEY_ALIASES = { "D.Gallen": "D.Gallon" };
export const FORCE_ABT = { "A.Bartelt": "Psychologie", "P.Haydn": "Ernährung" };

export const TYPE_TO_ABT = {
  "Ärztliche Aufnahme": "Medizin", "Aufnahme": "Medizin", "Arztvisite": "Medizin",
  "Visite": "Medizin", "Entlassung": "Medizin", "Neurologie": "Medizin",
  "Physiotherapie": "Physio", "Sporttherapie": "Physio", "PhysikalischeTherapie": "Physio",
  "Physikalische Therapie": "Physio", "Sonstiges": "Physio", "Lymphdrainage": "Physio", "Massage": "Physio",
  "Ergotherapie": "Ergo",
  "Logopaedie": "Logopädie", "Logopädie": "Logopädie",
  "Sozialdienst": "Sozialdienst",
  "AktivierendePflege": "Pflege", "Aktivierende Pflege": "Pflege", "Pflege": "Pflege",
  "Psychologie": "Psychologie",
  "Ernährungsberatung": "Ernährung", "Ernaehrungsberatung": "Ernährung",
  // "AktivierendeTherapie" bewusst OHNE feste Abteilung
};

// Anzeigenamen für Behandlungstypen (BP speichert sie ohne Leerzeichen/Umlaute)
export const TYPE_LABELS = {
  AktivierendePflege: "Aktivierende Pflege",
  AktivierendeTherapie: "Aktivierende Therapie",
  PhysikalischeTherapie: "Physikalische Therapie",
  Logopaedie: "Logopädie",
  Ernaehrungsberatung: "Ernährungsberatung",
  Sonstiges: "Lymphdrainage",
};
export const typeLabel = (t) => TYPE_LABELS[t] || t || "";

export const KNOWN_ABTEILUNGEN = ["Medizin", "Physio", "Ergo", "Sozialdienst", "Pflege", "Ernährung", "Psychologie", "Logopädie", "Verwaltung"];
export const FALLBACK_ABT = "Weitere Mitarbeiter";
export const ABT_COLORS = {
  "Medizin": "#c8e6c0", "Physio": "#f5e08a", "Ergo": "#f0b3b3",
  "Sozialdienst": "#9cb8da", "Pflege": "#dceaf7", "Ernährung": "#f5c9da",
  "Psychologie": "#d9c2a6", "Logopädie": "#c4b5e8", "Verwaltung": "#b8d4b8",
  [FALLBACK_ABT]: "#e5e5e5",
};
export const abtOrder = (name) => {
  const i = KNOWN_ABTEILUNGEN.indexOf(name);
  return i === -1 ? 99 : i;
};

// ── Zeit ───────────────────────────────────────────────────────────
export const normDash = (s) => String(s || "").replace(/[‒–—−]/g, "-").trim();

export function parseTimeRange(str) {
  if (!str) return null;
  const s = String(str).replace(/[‒–—−]/g, "-").trim();
  const r = s.match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  if (r) {
    const h1 = parseInt(r[1], 10), m1 = r[2] !== undefined ? parseInt(r[2], 10) : 0;
    const h2 = parseInt(r[3], 10), m2 = r[4] !== undefined ? parseInt(r[4], 10) : 0;
    if (Number.isNaN(h1) || Number.isNaN(h2)) return null;
    const start = h1 * 60 + m1;
    let end = h2 * 60 + m2;
    if (end <= start) end += 24 * 60;
    return { start, end };
  }
  const s1 = s.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (s1) {
    const t = parseInt(s1[1], 10) * 60 + (s1[2] !== undefined ? parseInt(s1[2], 10) : 0);
    return { start: t, end: t };
  }
  return null;
}

export function rangesOverlap(a, b) {
  if (!a || !b) return false;
  const ea = a.start === a.end ? { start: a.start, end: a.start + 1 } : a;
  const eb = b.start === b.end ? { start: b.start, end: b.start + 1 } : b;
  return ea.start < eb.end && eb.start < ea.end;
}

// Termine nach Zeit sortieren, Notizen behalten ihre relative Position
export function sortEntriesByTime(items) {
  const slots = [];
  items.forEach((item, idx) => {
    if ((item.k || "entry") === "entry") slots.push({ idx, item, range: parseTimeRange(item.time) });
  });
  const sorted = [...slots].sort((a, b) => {
    const at = a.range ? a.range.start : Infinity, bt = b.range ? b.range.start : Infinity;
    return at !== bt ? at - bt : a.idx - b.idx;
  });
  let p = 0;
  return items.map((item) => ((item.k || "entry") === "entry" ? sorted[p++].item : item));
}

export const minToHHMM = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

// ── Datum ──────────────────────────────────────────────────────────
export const pad2 = (n) => String(n).padStart(2, "0");
export const dateKey = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
export const parseDateKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
export const todayKey = () => dateKey(new Date());

// identisch mit dayToWeekDay() des Desktop-Wochenplans
export function isoWeek(d) {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  const week = 1 + Math.ceil((firstThursday - target) / 6048e5);
  return { year: new Date(firstThursday).getFullYear(), week };
}
export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function isoWeekMonday(week, year) {
  const jan4 = new Date(year, 0, 4);
  const m = mondayOf(jan4);
  m.setDate(m.getDate() + (week - 1) * 7);
  return m;
}
export const fmtDate = (d) => pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear();
export const fmtDateShort = (d) => pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + ".";
export const dayKeyOfDate = (d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()];

// ── Diverses ───────────────────────────────────────────────────────
export const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
export const canonicalKey = (key) => {
  const k = String(key || "").trim();
  return KEY_ALIASES[k] || k;
};
export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function initials(name) {
  const w = String(name || "").replace(/^(dr\.|med\.|prof\.)\s*/gi, "").replace(/(dr\.|med\.)\s*/gi, "").split(/[\s.]+/).filter(Boolean);
  if (!w.length) return "?";
  return ((w[0][0] || "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

// Telefonnummer für tel:-Link bereinigen; mehrere Nummern trennen
export function phoneNumbers(contact) {
  const out = [];
  String(contact || "").split(/[,;\/\n]| {2,}/).forEach((part) => {
    const m = part.match(/\+?[\d][\d\s\-()]{5,}\d/);
    if (m) out.push({ label: part.trim(), tel: m[0].replace(/[^\d+]/g, "") });
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// plan.js — Operationen auf dem Plan-Modell
//   • Teilmenge für einzelne Mitarbeiter (Verteiler)
//   • Desktop-Wochenplan KW-Export einmischen (Status, manuelle Einträge)
//   • Konfliktprüfung (wie Desktop)
// ═══════════════════════════════════════════════════════════════════
import {
  FILE_FORMAT, FILE_VERSION, ABT_COLORS, FALLBACK_ABT, KNOWN_ABTEILUNGEN, THERAPEUT_MAP,
  parseTimeRange, rangesOverlap, sortEntriesByTime, isoWeekMonday, addDays, dateKey, normName, canonicalKey,
} from "./core.js";

export function isPlan(obj) {
  return obj && obj.format === FILE_FORMAT && obj.days && Array.isArray(obj.staff);
}

export const staffByKey = (plan, key) => plan.staff.find((s) => s.key === key) || null;
export const staffName = (plan, key) => (staffByKey(plan, key) || {}).name || key;

export function staffDay(plan, date, key) {
  const d = plan.days[date];
  return (d && d.staff[key]) || { status: "", items: [] };
}

/** Alle Mitarbeiter, die im Plan tatsächlich Einträge haben (für Auswahl). */
export function activeStaff(plan) {
  const has = new Set();
  Object.values(plan.days).forEach((d) => Object.entries(d.staff).forEach(([k, sd]) => {
    if (sd.items.length || sd.status) has.add(k);
  }));
  return plan.staff.filter((s) => has.has(s.key));
}

/** Teilmenge: nur ausgewählte Mitarbeiter + Zeitraum. */
export function subsetPlan(plan, staffKeys, from, to, opt = {}) {
  const keys = new Set(staffKeys);
  const days = {};
  const usedPids = new Set();
  Object.entries(plan.days).forEach(([dk, d]) => {
    if (dk < from || dk > to) return;
    const staff = {};
    Object.entries(d.staff).forEach(([k, sd]) => {
      if (!keys.has(k)) return;
      staff[k] = JSON.parse(JSON.stringify(sd));
      sd.items.forEach((it) => it.pid && usedPids.add(it.pid));
    });
    const hasNote = opt.dayNotes !== false && d.note;
    if (!Object.keys(staff).length && !hasNote && !d.holiday) return;
    days[dk] = {
      holiday: !!d.holiday,
      note: opt.dayNotes === false ? "" : d.note || "",
      noteColor: opt.dayNotes === false ? "" : d.noteColor || "",
      staff,
    };
  });
  const patients = {};
  usedPids.forEach((pid) => {
    const p = plan.patients[pid];
    if (!p) return;
    patients[pid] = opt.addresses === false ? { name: p.name } : { ...p };
  });
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    kind: keys.size === 1 ? "personal" : "team",
    createdAt: new Date().toISOString(),
    stand: plan.stand || plan.createdAt,
    source: plan.source,
    range: { from, to },
    owner: keys.size === 1 ? [...keys][0] : null,
    groups: plan.groups,
    staff: plan.staff, // Namen der Kollegen (für "mit …"-Anzeige)
    patients,
    days,
  };
}

/**
 * Desktop-Wochenplan "Export" (Wochenplan_KW##_####_*.json) einmischen.
 * Übernimmt je Mitarbeiter/Tag: Status (Urlaub/Krank/…), manuell angelegte
 * Termine + Notizen (id ohne "bp-") und manuelle Tageshinweise.
 * BP-Einträge kommen weiterhin aus dem Behandlungsplan (mit Adressen etc.).
 */
export function mergeWochenplanExport(plan, wp) {
  if (!wp || !Array.isArray(wp.groups) || !wp.weekYear || !wp.weekNumber) {
    throw new Error("Ungültige Wochenplan-Datei.");
  }
  const monday = isoWeekMonday(wp.weekNumber, wp.weekYear);
  const DK = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const dateOf = (dk) => dateKey(addDays(monday, DK.indexOf(dk)));
  const isBp = (x) => x && x.id && String(x.id).startsWith("bp-");
  const nameToPid = {};
  Object.entries(plan.patients).forEach(([pid, p]) => { nameToPid[normName(p.name)] = pid; });
  let manual = 0, statuses = 0;

  const findKey = (s) => {
    if (s.bpKey) {
      const k = canonicalKey(s.bpKey);
      if (!plan.staff.some((x) => x.key === k)) {
        const m = THERAPEUT_MAP[k];
        plan.staff.push({ key: k, name: m ? m.name : s.name || k, abt: m ? m.abt : FALLBACK_ABT });
      }
      return k;
    }
    const byName = plan.staff.find((x) => normName(x.name) === normName(s.name));
    if (byName) return byName.key;
    return null;
  };

  wp.groups.forEach((g) => {
    (g.staff || []).forEach((s) => {
      if (!s.name && !s.bpKey) return;
      let key = findKey(s);
      if (!key) {
        key = s.name;
        plan.staff.push({ key, name: s.name, abt: g.name || FALLBACK_ABT });
        if (!plan.groups.some((x) => x.name === (g.name || FALLBACK_ABT))) {
          plan.groups.push({ name: g.name || FALLBACK_ABT, color: g.color || ABT_COLORS[g.name] || "#e5e5e5" });
        }
      }
      Object.entries(s.days || {}).forEach(([dk, day]) => {
        if (!DK.includes(dk) || !day) return;
        const date = dateOf(dk);
        const d = (plan.days[date] = plan.days[date] || { holiday: false, note: "", noteColor: "", staff: {} });
        const sd = (d.staff[key] = d.staff[key] || { status: "", items: [] });
        if (day.status) { sd.status = day.status; statuses++; }
        const manualItems = (day.entries || []).filter((e) => !isBp(e)).map((e) => {
          manual++;
          return (e.type || "entry") === "notiz"
            ? { k: "notiz", src: "wp", kind: "manual", text: e.text || "" }
            : { k: "entry", src: "wp", time: e.time || "", label: e.label || "", pid: nameToPid[normName(e.label)] || undefined };
        }).filter((e) => (e.k === "notiz" ? e.text.trim() : e.label.trim() || e.time.trim()));
        const keep = sd.items.filter((x) => x.src !== "wp");
        sd.items = sortEntriesByTime([...keep, ...manualItems]);
      });
    });
  });

  // manuelle Tageshinweise
  Object.entries(wp.holidays || {}).forEach(([dk, list]) => {
    if (!DK.includes(dk)) return;
    const txt = (Array.isArray(list) ? list : [{ text: String(list || "") }])
      .filter((n) => n && !isBp(n) && String(n.text || "").trim())
      .map((n) => n.text.trim()).join("\n");
    if (!txt) return;
    const date = dateOf(dk);
    const d = (plan.days[date] = plan.days[date] || { holiday: false, note: "", noteColor: "", staff: {} });
    if (!d.note.includes(txt)) d.note = d.note ? d.note + "\n" + txt : txt;
  });

  const wFrom = dateKey(monday), wTo = dateKey(addDays(monday, 5));
  if (!plan.range.from || wFrom < plan.range.from) plan.range.from = wFrom;
  if (!plan.range.to || wTo > plan.range.to) plan.range.to = wTo;
  // Gruppen-Reihenfolge wiederherstellen
  plan.groups.sort((a, b) => {
    const ia = KNOWN_ABTEILUNGEN.indexOf(a.name), ib = KNOWN_ABTEILUNGEN.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return { manual, statuses, week: wp.weekNumber, year: wp.weekYear };
}

/** Konflikte eines Tages (Portierung der Desktop-Logik). Ergebnis: Map item → [Meldungen] */
export function dayConflicts(plan, date) {
  const result = new Map();
  const d = plan.days[date];
  if (!d || d.holiday) return result;
  const add = (it, msg) => { if (!result.has(it)) result.set(it, []); result.get(it).push(msg); };
  const entries = [];
  const notizBy = {};
  Object.entries(d.staff).forEach(([k, sd]) => {
    const nm = staffName(plan, k);
    sd.items.forEach((it) => {
      if (it.k === "entry") entries.push({ it, k, nm, range: parseTimeRange(it.time), label: (it.label || "").trim() });
      else if (it.text) (notizBy[k] = notizBy[k] || []).push(it.text.toLowerCase());
    });
  });
  const byStaff = {};
  entries.forEach((e) => (byStaff[e.k] = byStaff[e.k] || []).push(e));
  Object.values(byStaff).forEach((list) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (rangesOverlap(list[i].range, list[j].range)) {
        add(list[i].it, `Zeitüberschneidung mit „${list[j].label || "(ohne Namen)"}“ (${list[j].it.time}).`);
        add(list[j].it, `Zeitüberschneidung mit „${list[i].label || "(ohne Namen)"}“ (${list[i].it.time}).`);
      }
    }
  });
  const mentions = (a, b) => (notizBy[a.k] || []).some((t) => t.includes(b.nm.toLowerCase())) || (notizBy[b.k] || []).some((t) => t.includes(a.nm.toLowerCase()));
  const byLabel = {};
  entries.forEach((e) => { if (e.label) (byLabel[e.label.toLowerCase()] = byLabel[e.label.toLowerCase()] || []).push(e); });
  Object.values(byLabel).forEach((list) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.k === b.k || a.label.toLowerCase() === "mittagspause") continue;
      if (!rangesOverlap(a.range, b.range) || mentions(a, b)) continue;
      if (a.it.src === "bp" && b.it.src === "bp" && a.it.time === b.it.time) continue;
      add(a.it, `„${a.label}“ ist zeitgleich (${b.it.time}) bei ${b.nm} eingetragen.`);
      add(b.it, `„${b.label}“ ist zeitgleich (${a.it.time}) bei ${a.nm} eingetragen.`);
    }
  });
  return result;
}

/** Stabiler Schlüssel eines Termins für "Erledigt"-Häkchen. */
export const itemKey = (date, staffKey, it) => [date, staffKey, it.time || "", it.label || it.text || ""].join("|");

/** Termine eines Patienten für einen Mitarbeiter (ab Datum). */
export function patientAppointments(plan, pid, staffKey, fromDate) {
  const out = [];
  Object.keys(plan.days).sort().forEach((dk) => {
    if (fromDate && dk < fromDate) return;
    const d = plan.days[dk];
    Object.entries(d.staff).forEach(([k, sd]) => {
      if (staffKey && k !== staffKey) return;
      sd.items.forEach((it) => { if (it.pid === pid) out.push({ date: dk, staff: k, it }); });
    });
  });
  return out;
}

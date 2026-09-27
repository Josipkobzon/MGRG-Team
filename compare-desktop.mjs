// Vergleicht den BP-Import der Mobil-App mit dem Ergebnis des Desktop-Wochenplans v4.
// Aufruf: node tests/compare-desktop.mjs <BhP.json> <desktop_state.json>
// desktop_state.json = localStorage "wochenplan-mogere-gold-state-v3" nach BP-Import (alle Monate)
import fs from "node:fs";
import { importBehandlungsplan } from "../js/bp-import.js";
import { isoWeekMonday, addDays, dateKey } from "../js/core.js";

const [bpPath, statePath] = process.argv.slice(2);
if (!bpPath || !statePath) {
  console.log("Aufruf: node tests/compare-desktop.mjs <BhP.json> <desktop_state.json>");
  process.exit(0);
}
const bp = JSON.parse(fs.readFileSync(bpPath, "utf8"));
const st = JSON.parse(fs.readFileSync(statePath, "utf8"));
const { plan, stats } = importBehandlungsplan(bp, {});
console.log("Mobil:", stats.entryCount, "Termine,", stats.autoCount, "Auto,", stats.skippedDeleted, "gelöscht übersprungen,", stats.staffCount, "Mitarbeiter");

const fmt = (it) => ((it.k || it.type) === "notiz" ? "N " + it.text : "E " + it.time + " " + it.label);
const mobile = {};
Object.entries(plan.days).forEach(([dk, d]) => Object.entries(d.staff).forEach(([k, sd]) => {
  if (sd.items.length) mobile[dk + "|" + k] = sd.items.map(fmt);
}));

const sidToKey = {};
st.groups.forEach((g) => g.staff.forEach((s) => { sidToKey[s.id] = s.bpKey || s.name; }));
const DK = ["mon", "tue", "wed", "thu", "fri", "sat"];
const desk = {};
const deskNotes = {}, deskHol = {};
Object.entries(st.weeks).forEach(([wk, w]) => {
  const [y, n] = wk.split("-").map(Number);
  const mon = isoWeekMonday(n, y);
  Object.entries(w.staffDays || {}).forEach(([sid, days]) => Object.entries(days).forEach(([dk, day]) => {
    const e = (day.entries || []);
    if (e.length) desk[dateKey(addDays(mon, DK.indexOf(dk))) + "|" + sidToKey[sid]] = e.map(fmt);
  }));
  Object.entries(w.holidays || {}).forEach(([dk, list]) => list.forEach((x) => {
    if (String(x.id).startsWith("bp-daynote")) deskNotes[dateKey(addDays(mon, DK.indexOf(dk)))] = x.text;
  }));
  Object.entries(w.holidayFlags || {}).forEach(([dk, v]) => { if (v) deskHol[dateKey(addDays(mon, DK.indexOf(dk)))] = true; });
});

let diff = 0;
const keys = new Set([...Object.keys(mobile), ...Object.keys(desk)]);
[...keys].sort().forEach((k) => {
  const a = JSON.stringify(mobile[k] || []), b = JSON.stringify(desk[k] || []);
  if (a !== b) {
    diff++;
    if (diff <= 15) console.log("DIFF", k, "\n  mobil  :", a, "\n  desktop:", b);
  }
});
let noteDiff = 0;
Object.entries(plan.days).forEach(([dk, d]) => {
  const m = (d.note || "").replace(/\s*\n\s*/g, " · ");
  const dn = (deskNotes[dk] || "").replace(/\s*·\s*$/, ""); // Desktop lässt ein " ·" am Ende stehen
  if ((m || "") !== dn) { noteDiff++; console.log("NOTE DIFF", dk, m, "|", deskNotes[dk]); }
});
Object.keys(deskNotes).forEach((dk) => { if (!plan.days[dk] || !plan.days[dk].note) { noteDiff++; console.log("NOTE missing", dk); } });
const holM = Object.keys(plan.days).filter((k) => plan.days[k].holiday).sort().join(",");
const holD = Object.keys(deskHol).sort().join(",");
console.log(`Staff-Tage verglichen: ${keys.size}, Abweichungen: ${diff}; Tageshinweise-Abweichungen: ${noteDiff}; Feiertage gleich: ${holM === holD}`);
process.exit(diff || noteDiff || holM !== holD ? 1 : 0);

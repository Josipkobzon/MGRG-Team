# MoGeRe Wochenplan Mobil (PWA) – projekt összefoglaló továbbfejlesztéshez

## Mi ez?
A „06. Wochenplan alle Abteilung MoGeRe Gold v4” desktop alkalmazás mobil/tablet párja.
Munkatárs-centrikus, csak megjelenítő (read-only) app: a koordinátor a BhP JSON-ból
munkatársanként titkosított plan-fájlt készít, a munkatárs ezt nyitja meg a telefonján.
GitHub Pages-en fut, offline (Service Worker), telepíthető (manifest).

## Technikai alap
- Vanilla JS ES-modulok, NINCS build, nincs React/Tailwind, nincs CDN.
- CSP a index.html-ben: `connect-src 'self'` → az app nem tud adatot küldeni sehová.
- localStorage kulcsok: `mgwp-plan-v1` (plain), `mgwp-plan-enc-v1` (titkosított, ha PIN-zár aktív),
  `mgwp-settings-v1`, `mgwp-done-v1` (erledigt pipák, 90 nap után törlődnek).

## Fájlok
| Fájl | Szerep |
|---|---|
| js/core.js | konstansok (THERAPEUT_MAP, TYPE_TO_ABT, ABT_COLORS…), idő/dátum függvények (parseTimeRange, sortEntriesByTime, isoWeek = desktop dayToWeekDay) |
| js/bp-import.js | BhP JSON → plan modell. A desktop v4 `importBehandlungsplan` 1:1 portja + extra mezők |
| js/plan.js | subsetPlan (verteiler), mergeWochenplanExport (desktop „JSON” export), dayConflicts (desktop konfliktlogika) |
| js/crypto.js | AES-GCM + PBKDF2 (310 000 iter.) |
| js/store.js | localStorage |
| js/app.js | UI: Tag, Woche, Team, Mehr, Verteiler, Lock, Patient-sheet |
| sw.js | cache-first app shell + Android share_target (POST ./share-target → cache → ?share=1) |

## Plan modell (fájlformátum is)
```json
{
  "format": "mogere-wochenplan", "version": 1,
  "kind": "team" | "personal", "owner": "J.Abraham" | null,
  "createdAt": "ISO", "stand": "ISO (BhP fájlnévből)", "source": "BhP_….json",
  "range": { "from": "2026-09-28", "to": "2026-10-24" },
  "groups": [{ "name": "Medizin", "color": "#c8e6c0" }],
  "staff":  [{ "key": "J.Abraham", "name": "Johnish Abraham", "abt": "Ergo" }],
  "patients": { "<row.id>": { "name", "address", "contact", "km", "minutes" } },
  "days": {
    "2026-09-28": {
      "holiday": false, "note": "BP dayNotes szöveg", "noteColor": "#fbcfe8",
      "staff": { "J.Abraham": { "status": "", "items": [
        { "k": "notiz", "kind": "auto", "plate": "M-OQ 396", "time": "", "text": "Auto: …", "privat": false },
        { "k": "entry", "src": "bp", "time": "08:40-09:50", "label": "Muster, Max", "pid": "…",
          "type": "Ergotherapie", "beh": "T5", "note": "Ergoaufnahme", "hint": "", "abt": "Ergo",
          "role": "lead" | "partner", "with": ["S.Jaballah"] },
        { "k": "entry", "src": "bp", "time": "11:20-11:50", "label": "Mittagspause", "pause": true },
        { "k": "notiz", "kind": "ende", "home": true, "text": "Das Auto darf …" }
      ]}}
    }
  }
}
```
Titkosított burok: `{ format, version, enc:{alg,kdf,iter,salt,iv}, meta:{kind,owner,range,createdAt,stand}, data:base64 }`.
A `meta` NEM tartalmaz betegadatot (csak munkatárs neve + időszak), a lock-képernyő ezt mutatja.

## Import-egyezés a desktoppal
`node tests/compare-desktop.mjs BhP.json desktop_state.json`
desktop_state = desktop v4 localStorage (`wochenplan-mogere-gold-state-v3`) BP-Import („alle Monate”) után.
2026-09-27: BhP_25.09.2026 → 427 Mitarbeiter-nap, 0 eltérés (859 Termin, 160 Auto, 48 gelöschte übersprungen).
Ha a desktop importlogika változik, ugyanazt a változtatást a js/bp-import.js-ben is meg kell csinálni, majd a tesztet futtatni.

Eltérés szándékosan: dayNotes sortörései megmaradnak (desktop: " · "), a desktop végén maradó " ·" nincs.

## Verzió
Minden változtatásnál: `sw.js` VERSION + `js/core.js` APP_VERSION emelése (különben a telepített appok nem frissülnek).

## Gotchák
1. iOS: share_target nem működik → fájl mentése a Fájlok appba, majd „Plan-Datei öffnen”.
2. navigator.share fájlokkal kattintásonként egyszer hívható (user activation) → verteilerben fájlonként külön gomb.
3. crypto.subtle csak https / localhost alatt → file:// alatt a titkosítás nem elérhető.
4. Vasárnap nincs a tervben; vasárnap az app a következő hétfőt mutatja.

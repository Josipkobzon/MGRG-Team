# Telepítés és használat – koordinátori útmutató (HU)

## 1. Feltöltés GitHubra (egyszer)

1. github.com → jobb felül „+” → New repository → név pl. `wochenplan` → Public → Create.
   (GitHub Pages ingyenes fióknál csak publikus repóval működik. Ez rendben van: a repóban csak programkód van, betegadat nincs.)
2. „uploading an existing file” → a ZIP kicsomagolt tartalmát (index.html, css/, js/, icons/, sw.js, manifest.webmanifest, .nojekyll stb.) húzd be → Commit changes.
   Fontos: a fájlok a repó gyökerébe kerüljenek, ne egy almappába.
3. Settings → Pages → Source: „Deploy from a branch” → Branch: `main`, mappa: `/(root)` → Save.
4. 1–2 perc múlva elérhető: `https://<felhasználónév>.github.io/wochenplan/`
   Ezt a linket kapják a munkatársak (akár QR-kódként).

## 2. Heti/kétheti menet

1. Behandlungsplanból mentés: `BhP_TT.MM.JJJJ_HH_MM.json`.
2. A saját telefonodon/tableteden/PC-den nyisd meg az appot → „Plan-Datei öffnen” → a BhP fájl → „Alle Monate übernehmen”.
   Első alkalommal javasolt PIN-zárat beállítani (a te eszközödön minden beteg adata ott van).
3. Opcionális: a desktop Wochenplanból a „JSON” gombbal exportált hetet is megnyithatod → bekerül az Urlaub/Krank státusz és a kézi bejegyzések.
4. Mehr → „Pläne an Mitarbeiter verteilen”:
   - Ab (hétfő) + hány hét,
   - munkatársak kijelölése („Alle mit Terminen”),
   - PIN (automatikusan generált 6 jegyű, átírható),
   - „Einzeldateien” → minden névnél Teilen (WhatsApp/E-Mail) vagy Speichern.
5. A PIN-t külön csatornán add át (szóban, SMS). Érdemes munkatársanként állandó PIN-t használni, akkor nem kell mindig újra közölni.

## 3. Mit lát a munkatárs

- Csak a saját időpontjait, a saját betegei címét/telefonját (kikapcsolható), az autó-beosztást, Mittagspause-t, Dienstende-hinweist, napi közleményeket és ünnepnapokat.
- Egy érintéssel útvonal (Google/Apple Maps) és hívás.
- „Erledigt” pipa – csak az ő készülékén tárolódik.
- Az adat csak a készüléken van, PIN-nel titkosítva; az app semmit nem küld szerverre.

## 4. Frissítés (új appverzió)

Ha a kódot módosítod: `sw.js` → `VERSION` és `js/core.js` → `APP_VERSION` emelése, majd feltöltés GitHubra. A telepített appok következő indításkor „Neue Version verfügbar – Aktualisieren” üzenetet mutatnak.

## 5. Új munkatárs / új rövidítés

A `js/core.js` → `THERAPEUT_MAP` (és szükség esetén `TYPE_TO_ABT`) ugyanaz, mint a desktop Wochenplan v4-ben. Ismeretlen rövidítés nem vész el: a rövidítéssel mint névvel jön létre, a cellatípus szerinti Abteilungban.

## Adatvédelem röviden

- GitHubra SOHA ne tölts fel BhP_*.json vagy Wochenplan_*.json fájlt (a `.gitignore` ezt kizárja, de a webes feltöltésnél figyelj rá).
- Titkosítás: AES-GCM 256 bit, PBKDF2-SHA256 310 000 iterációval. 6 számjegyű PIN elfogadható védelem, ha a fájl nem kerül idegen kézbe; hosszabb PIN/jelszó erősebb.
- A munkatársak telefonján javasolt a képernyőzár; a PIN-zár az appban alapból aktív titkosított fájl megnyitásakor.

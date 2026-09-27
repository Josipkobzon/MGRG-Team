# MoGeRe Gold · Wochenplan Mobil

Persönlicher Wochenplan für die Mitarbeiterinnen und Mitarbeiter der **MoGeRe Gold GmbH** (Mobile Geriatrische Rehabilitation) – für Smartphone und Tablet, installierbar als App (PWA), funktioniert offline.

Die App enthält **keine Patientendaten**. Jede Person öffnet ihre eigene, mit PIN verschlüsselte Plan-Datei, die sie von der Koordination bekommt. Alle Daten bleiben ausschließlich auf dem Gerät.

## Für Mitarbeiter

1. Link zur App öffnen (von der Koordination) und installieren:
   - **iPhone/iPad (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“
   - **Android (Chrome):** Menü ⋮ → „App installieren“
2. Plan-Datei (`Wochenplan_<Kürzel>_<Zeitraum>.json`) aus E-Mail/Messenger speichern.
3. In der App **„Plan-Datei öffnen“** → Datei wählen → PIN eingeben.
4. Neue Wochen: einfach die nächste Datei genauso öffnen.

Funktionen:

- **Tag** – Termine mit Uhrzeit, Behandlungsart, T-Nummer, Notizen/Hinweisen, Kollegen bei Doppelterminen, Auto-Einteilung, Mittagspause und Dienstende-Hinweis (Auto nach Hause / zurück). „Jetzt“/„Als Nächstes“-Markierung, Häkchen „erledigt“, **Route** (Google/Apple Karten) und **Anrufen** mit einem Tipp. Wischen = Tag vor/zurück.
- **Woche** – Montag bis Samstag auf einen Blick (auf dem Tablet als 6-Spalten-Raster).
- **Patient** – Tipp auf einen Termin: Adresse, Telefon, Entfernung und nächste Termine.
- **Tageshinweise, Feiertage, Urlaub/Krank** werden als Banner angezeigt.
- **PIN-Sperre**, Hell/Dunkel, große Schrift.

## Für die Koordination

Die App kann direkt die Behandlungsplan-Sicherung **`BhP_TT.MM.JJJJ_HH_MM.json`** öffnen (gleiche Import-Logik wie „06. Wochenplan alle Abteilung v4“, BP-Import). Danach:

- **Team** – alle Mitarbeiter eines Tages nach Abteilung, Suche nach Mitarbeiter/Patient, Konfliktwarnungen (Zeitüberschneidungen).
- **Mehr → Pläne an Mitarbeiter verteilen** – Zeitraum und Mitarbeiter wählen, PIN festlegen → je Mitarbeiter eine verschlüsselte Datei, die direkt per Teilen-Menü (WhatsApp, E-Mail, …) verschickt oder gespeichert werden kann. Jede Datei enthält nur die eigenen Termine und nur die Adressen der eigenen Patienten.
- **Desktop-Wochenplan-Export** (`Wochenplan_KW##_JJJJ_*.json`, Knopf „JSON“ im Desktop-Wochenplan) kann eingemischt werden: Urlaub/Krank/Frei/Fortbildung und manuell eingetragene Termine/Notizen werden übernommen.

**Die PIN immer getrennt von der Datei weitergeben** (mündlich oder per SMS).

## Technik

- Reines HTML/CSS/JavaScript (ES-Module), **kein Build-Schritt**, keine externen Bibliotheken, kein CDN.
- Offline über Service Worker (`sw.js`), installierbar über `manifest.webmanifest`.
- Verschlüsselung: AES-GCM 256 bit, Schlüssel aus PIN per PBKDF2-SHA256 (310 000 Iterationen), Web Crypto API.
- Speicherung: `localStorage` des Geräts. Content-Security-Policy verbietet Verbindungen zu fremden Servern.
- Android: Plan-Dateien können nach der Installation direkt an „Wochenplan“ geteilt werden (Share Target).

### Veröffentlichen (GitHub Pages)

Dateien in ein GitHub-Repository hochladen → *Settings → Pages → Deploy from a branch → `main` / `(root)`*. Die App ist dann unter `https://<benutzer>.github.io/<repo>/` erreichbar. Details auf Ungarisch: [TELEPITES_HU.md](TELEPITES_HU.md).

**Nach jeder Änderung** die Versionsnummer in `sw.js` (`VERSION`) und `js/core.js` (`APP_VERSION`) erhöhen – sonst sehen installierte Apps die Änderung nicht.

### Test

```bash
# Vergleich mit dem Desktop-Wochenplan v4 (desktop_state.json = localStorage nach BP-Import)
node tests/compare-desktop.mjs BhP_25.09.2026_09_29.json desktop_state.json
```

> ⚠️ Niemals echte `BhP_*.json`- oder Plan-Dateien ins Repository hochladen – `.gitignore` schließt sie aus.

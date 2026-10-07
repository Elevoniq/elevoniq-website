# Manuelle Prüfanleitung: GA4 und Cookie-Einwilligung

## Zweck

Diese Anleitung dokumentiert das manuelle Prüfverfahren für das Kernziel von PR #29: GA4-Anfragen dürfen ausschließlich nach expliziter Einwilligung des Nutzers ausgelöst werden. Kein automatisierter CI-Test prüft dieses Verhalten gegenwärtig. Die manuelle Prüfung ersetzt diesen Schutz und muss vor jedem Merge in main durchgeführt werden.

Das Verfahren ergänzt `tests/manual/ga4-consent-check.mjs`, ein referenzielles Headless-Chrome-Skript, das dieselben vier Fälle automatisiert prüft, aber nicht Teil von `npm test` ist.

## Wann ist diese Prüfung durchzuführen?

Vor jedem Merge in main und bei jeder Änderung an:

- `assets/js/cookie-consent.js`
- GA4-Inline-Blöcken in beliebigen HTML-Seiten (der Block zwischen den Kommentaren `GA4 Anfang` und `GA4 Ende`)
- dem Cookie-Banner (Markup, Texte, onclick-Handler)

## Vorbereitung

1. Lokalen Entwicklungsserver starten: `npx serve . -p 5500` im Repo-Wurzelverzeichnis.
2. Chrome öffnen, DevTools aktivieren (F12).
3. Tab "Netzwerk" (Network) öffnen.
4. Im Filterfeld oben "googletagmanager" eingeben. Damit werden ausschließlich Anfragen an `googletagmanager.com` und `google-analytics.com` angezeigt.
5. Anwendungsbereich (Application) in DevTools öffnen, dort unter "Storage" die Schaltfläche "Clear site data" betätigen, um alle Cookies und localStorage-Einträge zu löschen. Seite neu laden.

## Stichprobenseiten

Mindestens vier Seiten sind je Prüfung zu testen. Empfohlene Auswahl:

1. `/` (Homepage)
2. `/kontakt/`
3. `/einzelleistungen/angebotspruefung/`
4. `/laufende-betreuung/smart-flap/`

Zusätzlich bei Verdacht oder nach Änderungen an spezifischen Seiten: `/wissen/podcast/`, `/einzelleistungen/notruf-umruestung/`.

## Die vier Prüffälle

### Fall a: Seite laden ohne Einwilligung

Erwartetes Ergebnis: 0 Anfragen an googletagmanager oder google-analytics. Der Cookie-Banner erscheint.

Schritte:

1. Sicherstellen, dass keine Einwilligung gespeichert ist (Application, Storage, Clear site data).
2. Stichprobenseite im Browser laden.
3. Netzwerk-Tab prüfen: keine Treffer für "googletagmanager".
4. Cookie-Banner muss sichtbar sein.

### Fall b: GA4 startet nach Akzeptieren

Erwartetes Ergebnis: nach Klick auf "Alle akzeptieren" wird genau 1 Anfrage an googletagmanager ausgelöst.

Schritte:

1. Fortfahren nach Fall a (Banner sichtbar, 0 Anfragen).
2. Auf "Alle akzeptieren" klicken.
3. Netzwerk-Tab: genau 1 Treffer erscheint.
4. Optional: Application, localStorage prüfen. Der Schlüssel `elevoniq_consent` muss den Wert `all` enthalten.

### Fall c: Nach Ablehnen oder Widerruf wieder 0 Anfragen, Banner erscheint erneut

Erwartetes Ergebnis: nach Ablehnen oder Widerruf werden keine GA4-Anfragen ausgelöst. Nach Reload erscheint der Banner erneut.

Schritte (Ablehnen):

1. Speicher leeren (Clear site data), Seite neu laden.
2. Auf "Nur notwendige" oder "Ablehnen" klicken.
3. Netzwerk-Tab: 0 Treffer.
4. Seite neu laden: Banner erscheint wieder. Netzwerk-Tab: weiterhin 0 Treffer.

Schritte (Widerruf):

1. Einwilligung erteilen (Fall b), Netzwerk-Tab: 1 Treffer.
2. Footer-Link "Cookie-Einstellungen" klicken (alternativ: `localStorage.removeItem('elevoniq_consent'); location.reload()` in der Konsole ausführen).
3. Nach Reload: Banner erscheint, Netzwerk-Tab: 0 Treffer.

### Fall d: Reload mit gespeicherter Einwilligung startet GA4

Erwartetes Ergebnis: 1 Anfrage an googletagmanager ohne erneute Interaktion.

Schritte:

1. Einwilligung erteilen (Fall b).
2. Seite neu laden (F5).
3. Netzwerk-Tab: 1 Treffer ohne erneuten Klick auf den Banner. Banner erscheint nicht mehr.

## Ergebnistabelle

Datum, Prüfer und Ergebnis je Fall und Seite eintragen. "OK" bedeutet: Erwartetes Ergebnis eingetreten. "FAIL" bedeutet: Abweichung. Bei FAIL: Beschreibung in der Spalte Anmerkung.

| Datum | Prüfer | Seite | Fall a | Fall b | Fall c | Fall d | Anmerkung |
|---|---|---|---|---|---|---|---|
|  |  | / |  |  |  |  |  |
|  |  | /kontakt/ |  |  |  |  |  |
|  |  | /einzelleistungen/angebotspruefung/ |  |  |  |  |  |
|  |  | /laufende-betreuung/smart-flap/ |  |  |  |  |  |
|  |  | /wissen/podcast/ |  |  |  |  |  |
|  |  | /einzelleistungen/notruf-umruestung/ |  |  |  |  |  |

## Zuletzt durchgeführt

Datum: 2026-10-07. Prüfer: Ben. Branch: fix/ga4-consent-timing-v2. Ergebnis: alle vier Fälle auf 6 Seiten bestanden (siehe Bericht `Owners Inbox/ga4-fix-neu-aufsetzen/bericht.md`, Schritt 3, Tabelle). Verfahren: Headless Chrome via `tests/manual/ga4-consent-check.mjs`.

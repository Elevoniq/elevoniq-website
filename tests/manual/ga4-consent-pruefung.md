# Manuelle Prüfanleitung: GA4 und Cookie-Einwilligung

## Zweck

Diese Anleitung dokumentiert das manuelle Prüfverfahren für das Kernziel von PR #29: GA4-Anfragen dürfen ausschließlich nach expliziter Einwilligung des Nutzers ausgelöst werden.

Automatisiert: Die vier Fälle (plus Google-Fonts-Prüfung) laufen als Browser-Tests in `tests/e2e/consent.e2e.mjs` mit `npm run test:e2e`. Das ist die eine Quelle für die automatisierte Prüfung. Die statischen Regeln (cookie-consent.js eingebunden, Footer-Link "Cookie-Einstellungen", kein festes gtag-Skript) laufen in `npm test` über `tests/ga4-consent-static.test.mjs`.

Diese manuelle Anleitung bleibt für die Sichtprüfung im echten Browser, z.B. nach Änderungen am Banner-Layout oder wenn kein Chrome für `test:e2e` verfügbar ist.

## Wann ist diese Prüfung durchzuführen?

Bei jeder Änderung an den folgenden Stellen mindestens `npm run test:e2e` ausführen, bei sichtbaren Banner-Änderungen zusätzlich diese manuelle Prüfung:

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

### Fall c: Nach Ablehnen oder Widerruf 0 Anfragen

Erwartetes Ergebnis: nach Ablehnen oder Widerruf werden keine GA4-Anfragen ausgelöst. Nach Ablehnen ist die Entscheidung gespeichert (`elevoniq_consent` = `necessary`), der Banner erscheint beim Reload nicht erneut. Nach Widerruf (Footer-Link) ist die Entscheidung gelöscht und der Banner erscheint erneut.

Schritte (Ablehnen):

1. Speicher leeren (Clear site data), Seite neu laden.
2. Auf "Nur notwendige" oder "Ablehnen" klicken.
3. Netzwerk-Tab: 0 Treffer.
4. Seite neu laden: Banner erscheint nicht erneut (Ablehnung gespeichert). Netzwerk-Tab: weiterhin 0 Treffer.

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

Datum: 2026-10-07. Prüfer: Ben. Branch: test/consent-e2e-automatisiert (Stand origin/main 0ab1501). Ergebnis: `npm run test:e2e` 39/39 bestanden (7 Seiten x 5 Fälle, 4 Schriftseiten). Verfahren: `tests/e2e/consent.e2e.mjs` (ersetzt das frühere Referenzskript `tests/manual/ga4-consent-check.mjs`).

# Tests

## `npm test` (schnell, ohne Browser)

Führt `tests/**/*.test.mjs` mit `node:test` aus: Routing, PDF-Filter, Upload-API (57 Tests) und die statische GA4/Consent-Prüfung `ga4-consent-static.test.mjs` (4 Tests). Die statische Prüfung stellt für jede HTML-Seite mit GA4 sicher: `cookie-consent.js` ist mit gültigem Pfad eingebunden, der Footer enthält den Link "Cookie-Einstellungen", und gtag.js wird nicht per festem `<script src>` geladen.

## `npm run test:e2e` (Browser, getrennt)

Führt `tests/e2e/**/*.e2e.mjs` aus (nicht Teil von `npm test`). `consent.e2e.mjs` prüft im Headless-Chrome:

- (a) ohne Einwilligung 0 Anfragen an googletagmanager.com / google-analytics.com, Banner sichtbar
- (b) nach "Alle akzeptieren" genau 1 Anfrage (gtag.js)
- (c) nach "Nur notwendige" 0 Anfragen, auch nach Reload; nach Widerruf über den Footer-Link erscheint der Banner erneut, 0 Anfragen
- (d) Reload mit gespeicherter Einwilligung: 1 Anfrage ohne Klick
- (e) Seiten mit selbst gehosteten Schriften: keine Anfrage an fonts.googleapis.com / fonts.gstatic.com

Die Tests starten einen eigenen statischen Server auf einem freien Port und brechen jede Anfrage an fremde Hosts ab (sie werden nur gezählt). Es werden keine Daten an Google gesendet. Laufzeit ca. 20 s.

### Browser bereitstellen

Abhängigkeit ist nur `playwright-core` (devDependency). Das Paket lädt bei `npm install` keinen Browser herunter. Die Tests nutzen das installierte Google Chrome (`channel: "chrome"`).

- macOS/Windows: Google Chrome installieren, fertig.
- Andere Binary (Chromium, Chrome for Testing): `CHROME_PATH=/pfad/zur/binary npm run test:e2e`
- Ohne Browser bricht `test:e2e` mit der Meldung "Kein Browser fuer test:e2e verfuegbar" ab.

Manuelle Sichtprüfung im echten Browser: `tests/manual/ga4-consent-pruefung.md`.

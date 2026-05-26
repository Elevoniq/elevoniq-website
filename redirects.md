# ElevonIQ — 301 Redirect Map
*Erstellt: 2026-05-26 | Für Netlify `_redirects` und Vercel `vercel.json` Konfiguration*
*Quelle: SEO-Audit elevoniq.de, Rembert, 2026-05-25*

---

## Kritische Redirects (sofort, vor Go-Live)

Diese URLs haben nachweislichen SEO-Wert (Keyword-Ausrichtung, Canonical vorhanden, in Sitemap) und müssen mit 301 abgesichert werden.

| Alte URL (elevoniq.de) | Neue URL | Priorität | Grund |
|---|---|---|---|
| `/produkte/elevator-services/` | `/laufende-betreuung/` | KRITISCH | Stärkste Produktseite, hohe Keyword-Dichte "Aufzugsmanagement" |
| `/produkte/elevator-hub/` | `/laufende-betreuung/elevator-hub/` | KRITISCH | Direktes Produkt-Mapping, SEO-Equity vorhanden |
| `/vorteile/pflichten-gesetze/` | `/betreiberpflichten/` | KRITISCH | 1:1-Entsprechung, starkes Keyword "Betreiberpflichten Aufzug" |
| `/neuer-frequenzumrichter/` | `/wissen/frequenzumrichter/` | KRITISCH | Dedizierte Long-Tail-Campaign-Page mit Kaufabsicht — SEO-Equity erhalten |
| `/ueber-uns/podcast/` | `/wissen/podcast/` | KRITISCH | Inhaltsreichste Seite (5.400+ Wörter), höchste SEO-Equity der gesamten Site |

---

## Alle Redirects

| # | Alte URL | Neue URL | Priorität | Anmerkung |
|---|---|---|---|---|
| 1 | `/` | `/` | — | Homepage bleibt, kein Redirect nötig |
| 2 | `/produkte/` | `/laufende-betreuung/` | HOCH | Produkte-Übersicht → Laufende Betreuung als nächste logische Entsprechung |
| 3 | `/produkte/elevator-services/` | `/laufende-betreuung/` | KRITISCH | Hauptproduktseite |
| 4 | `/produkte/elevator-hub/` | `/laufende-betreuung/elevator-hub/` | KRITISCH | Direktes Mapping |
| 5 | `/produkte/elevator-live/` | `/laufende-betreuung/iot-monitoring/` | HOCH | IoT-Monitoring ist die nächste inhaltliche Entsprechung für Elevator LIVE |
| 6 | `/produkte/weitere-services/` | `/laufende-betreuung/` | MITTEL | Rundum-Service → Laufende Betreuung |
| 7 | `/vorteile/kostenoptimierung/` | `/laufende-betreuung/` | HOCH | "Aufzugskosten senken" Keyword — laufende Betreuung ist primäres Kosten-Produkt |
| 8 | `/vorteile/pflichten-gesetze/` | `/betreiberpflichten/` | KRITISCH | 1:1-Entsprechung |
| 9 | `/vorteile/nachhaltigkeit/` | `/betreiberpflichten/` | MITTEL | Kein direktes Pendant; Betreiberpflichten als nächste thematische Entsprechung |
| 10 | `/vorteile/verfugbarkeit-steigern/` | `/laufende-betreuung/iot-monitoring/` | MITTEL | Verfügbarkeit/Monitoring → IoT-Monitoring; URL-Slug-Typo wird bereinigt |
| 11 | `/ueber-uns/elevoniq/` | `/#ueber-uns` | NIEDRIG | Über uns wird als Abschnitt auf der Homepage geführt |
| 12 | `/ueber-uns/podcast/` | `/wissen/podcast/` | KRITISCH | Höchste SEO-Equity, Podcast bleibt als eigenständige Seite |
| 13 | `/ueber-uns/referenzen/` | `/` | NIEDRIG | Seite war nicht in Navigation, beschädigtes Branding (Simplifa) — Homepage als Fallback |
| 14 | `/kontakt/` | `/kontakt/` | — | Bleibt identisch, kein Redirect nötig |
| 15 | `/datenschutzerklaerung/` | `/datenschutz/` | HOCH | URL-Slug wird vereinfacht — altes Muster mit "erklarung" muss weitergeleitet werden |
| 16 | `/impressum/` | `/impressum/` | — | Bleibt identisch, kein Redirect nötig |
| 17 | `/agb/` | `/agb/` | NIEDRIG | AGB-Seite bleibt oder wird neu angelegt — bei Entscheidung anpassen |
| 18 | `/neuer-frequenzumrichter/` | `/wissen/frequenzumrichter/` | KRITISCH | Long-Tail-Keyword mit Kaufabsicht, SEO-Equity erhalten |

---

## Netlify `_redirects` Format

Für Deployment auf Netlify: Diese Datei als `_redirects` (ohne Extension) im Root des Build-Outputs ablegen.

```
# ElevonIQ — 301 Redirects
# Erstellt: 2026-05-26

# Kritische Redirects
/produkte/elevator-services/          /laufende-betreuung/                    301
/produkte/elevator-hub/               /laufende-betreuung/elevator-hub/       301
/vorteile/pflichten-gesetze/          /betreiberpflichten/                    301
/neuer-frequenzumrichter/             /wissen/frequenzumrichter/              301
/ueber-uns/podcast/                   /wissen/podcast/                        301

# Weitere Produktseiten
/produkte/                            /laufende-betreuung/                    301
/produkte/elevator-live/              /laufende-betreuung/iot-monitoring/     301
/produkte/weitere-services/           /laufende-betreuung/                    301

# Vorteile-Seiten
/vorteile/kostenoptimierung/          /laufende-betreuung/                    301
/vorteile/nachhaltigkeit/             /betreiberpflichten/                    301
/vorteile/verfugbarkeit-steigern/     /laufende-betreuung/iot-monitoring/     301

# Über uns
/ueber-uns/elevoniq/                  /#ueber-uns                             301
/ueber-uns/referenzen/                /                                       301

# Datenschutz — URL-Umbenennung
/datenschutzerklaerung/               /datenschutz/                           301
```

---

## Vercel `vercel.json` Format

Für Deployment auf Vercel: In `vercel.json` im Projekt-Root eintragen (oder in bestehende Konfiguration integrieren).

```json
{
  "redirects": [
    {
      "source": "/produkte/elevator-services/",
      "destination": "/laufende-betreuung/",
      "permanent": true
    },
    {
      "source": "/produkte/elevator-hub/",
      "destination": "/laufende-betreuung/elevator-hub/",
      "permanent": true
    },
    {
      "source": "/vorteile/pflichten-gesetze/",
      "destination": "/betreiberpflichten/",
      "permanent": true
    },
    {
      "source": "/neuer-frequenzumrichter/",
      "destination": "/wissen/frequenzumrichter/",
      "permanent": true
    },
    {
      "source": "/ueber-uns/podcast/",
      "destination": "/wissen/podcast/",
      "permanent": true
    },
    {
      "source": "/produkte/",
      "destination": "/laufende-betreuung/",
      "permanent": true
    },
    {
      "source": "/produkte/elevator-live/",
      "destination": "/laufende-betreuung/iot-monitoring/",
      "permanent": true
    },
    {
      "source": "/produkte/weitere-services/",
      "destination": "/laufende-betreuung/",
      "permanent": true
    },
    {
      "source": "/vorteile/kostenoptimierung/",
      "destination": "/laufende-betreuung/",
      "permanent": true
    },
    {
      "source": "/vorteile/nachhaltigkeit/",
      "destination": "/betreiberpflichten/",
      "permanent": true
    },
    {
      "source": "/vorteile/verfugbarkeit-steigern/",
      "destination": "/laufende-betreuung/iot-monitoring/",
      "permanent": true
    },
    {
      "source": "/ueber-uns/elevoniq/",
      "destination": "/#ueber-uns",
      "permanent": true
    },
    {
      "source": "/ueber-uns/referenzen/",
      "destination": "/",
      "permanent": true
    },
    {
      "source": "/datenschutzerklaerung/",
      "destination": "/datenschutz/",
      "permanent": true
    }
  ]
}
```

---

## GitHub Pages

GitHub Pages unterstützt keine serverseitigen Redirects nativ. Optionen:

1. **404.html Workaround:** Eine `404.html` mit JavaScript-Redirect erstellen — unzuverlässig für SEO, nicht empfohlen.
2. **Jekyll `jekyll-redirect-from` Plugin:** Nur für Jekyll-Seiten.
3. **Empfehlung:** Für Production-Redirects Netlify oder Vercel verwenden, nicht GitHub Pages.

---

## Hinweise

- Alle Redirects sind 301 (permanent) — nur 301 überträgt SEO-Equity.
- Trailing Slashes sind konsistent gehalten — neue Site verwendet durchgängig trailing slash.
- `/neuer-frequenzumrichter/` muss zwingend auf eine neue, inhaltlich gleichwertige Seite zeigen. Das Ziel `/wissen/frequenzumrichter/` muss vor Go-Live existieren, sonst SEO-Equity-Verlust.
- `/ueber-uns/podcast/` hat die höchste Content-Dichte der alten Site (5.400+ Wörter, 27+ Episodentexte). Das Redirect-Ziel `/wissen/podcast/` muss diese Inhalte aufnehmen.
- `/datenschutzerklaerung/` (alter WordPress-Slug) → `/datenschutz/` (neuer Slug): Dieser Redirect ist für alle eingehenden Links aus Cookie-Bannern, Formularen und externen Verweisen kritisch.
- Die Seite `/ueber-uns/referenzen/` enthält altes Simplifa-Branding. Redirect auf Homepage bis Seite neu erstellt wird.
- AGB: Aktuell als PDF-Direktlink ausgeliefert. Entscheidung vor Go-Live: HTML-Seite `/agb/` anlegen oder PDF-Pfad beibehalten. Anpassung der Redirects entsprechend.

*ElevonIQ – Web-Entwicklung | Ben | 2026-05-26*

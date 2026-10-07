// Browser-Tests fuer GA4-Einwilligung und selbst gehostete Schriften.
// Ausfuehren: `npm run test:e2e` (NICHT Teil von `npm test`, Dateiendung .e2e.mjs).
//
// Einzige Quelle fuer die automatisierte Consent-Pruefung (ersetzt das fruehere
// Referenzskript tests/manual/ga4-consent-check.mjs). Manuelle Anleitung:
// tests/manual/ga4-consent-pruefung.md.
//
// Ablauf:
//   - startet einen eigenen statischen Server auf einem freien Port (127.0.0.1),
//   - startet den installierten System-Chrome ueber playwright-core (kein Browser-Download),
//   - bricht JEDE Anfrage an einen fremden Host ab und zaehlt sie nur.
//     Es werden keine Daten an Google oder andere Dienste gesendet.
//
// Browser: standardmaessig Google Chrome (channel "chrome"). Alternativ einen
// Pfad setzen: CHROME_PATH=/pfad/zu/chrome npm run test:e2e
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONSENT_KEY = "elevoniq_consent";
const GA_HOST = /(^|\.)(googletagmanager\.com|google-analytics\.com)$/;
const FONT_HOST = /^fonts\.(googleapis|gstatic)\.com$/;
const SETTLE_MS = 400;

// Stichprobe fuer a bis d (wie in der manuellen Anleitung) plus die Lifecycle-Seite.
// Lifecycle hat Banner und Footer-Link, aber kein GA4: dort muss es auch nach
// Einwilligung bei 0 GA-Anfragen bleiben.
const CONSENT_PAGES = [
  "/",
  "/kontakt/",
  "/einzelleistungen/angebotspruefung/",
  "/laufende-betreuung/smart-flap/",
  "/wissen/podcast/",
  "/einzelleistungen/notruf-umruestung/",
  "/laufende-betreuung/elevator-hub/lifecycle/",
];

// Seiten mit selbst gehosteten Schriften (PR #30).
const FONT_PAGES = [
  "/einzelleistungen/frequenzumrichter/nachhaltigkeitsnachweis.html",
  "/laufende-betreuung/iot-monitoring/",
  "/laufende-betreuung/elevator-hub/",
  "/laufende-betreuung/elevator-hub/lifecycle/",
];

// ---------------------------------------------------------------------------
// Statischer Server
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};

function startServer() {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      const body = fs.readFileSync(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("playwright-core fehlt. Bitte `npm install` im Repo ausfuehren (devDependency).");
  }
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = "chrome";
  try {
    return await chromium.launch(opts);
  } catch (err) {
    throw new Error(
      "Kein Browser fuer test:e2e verfuegbar. Google Chrome installieren " +
        "(https://www.google.com/chrome/) oder CHROME_PATH auf eine Chrome/Chromium-Binary setzen.\n" +
        `Ursache: ${String(err.message).split("\n")[0]}`,
    );
  }
}

let server;
let baseUrl;
let browser;

before(async () => {
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
});

/**
 * Frischer Browser-Kontext je Test (leerer localStorage, keine Cookies).
 * Jede Anfrage an einen fremden Host wird abgebrochen und nur gezaehlt.
 */
async function withSession(fn) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const local = new URL(baseUrl).host;
  const s = {
    blocked: { ga: [], fonts: [], other: [] },
    reset() {
      s.blocked = { ga: [], fonts: [], other: [] };
    },
  };
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.host === local || url.protocol === "data:" || url.protocol === "blob:") {
      return route.continue();
    }
    if (GA_HOST.test(url.hostname)) s.blocked.ga.push(url.href);
    else if (FONT_HOST.test(url.hostname)) s.blocked.fonts.push(url.href);
    else s.blocked.other.push(url.href);
    return route.abort(); // nichts verlaesst den Rechner
  });
  const page = await context.newPage();
  s.page = page;
  // GA4 wird bei DOMContentLoaded registriert; danach kurz warten genuegt.
  s.settle = () => page.waitForTimeout(SETTLE_MS);
  s.open = async (p) => {
    await page.goto(baseUrl + p, { waitUntil: "domcontentloaded" });
    await s.settle();
  };
  s.reload = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await s.settle();
  };
  s.banner = () => page.locator("#cookie-banner");
  s.accept = async () => {
    await page.getByRole("button", { name: "Alle akzeptieren" }).click();
    await s.settle();
  };
  s.consent = () => page.evaluate((k) => localStorage.getItem(k), CONSENT_KEY);
  try {
    await fn(s);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// a bis d: GA4 nur nach Einwilligung
// ---------------------------------------------------------------------------
function pageHasGa4(p) {
  const rel = p.endsWith(".html") ? p : path.join(p, "index.html");
  return fs.readFileSync(path.join(root, rel), "utf8").includes("googletagmanager.com");
}

for (const p of CONSENT_PAGES) {
  const expectedGa = pageHasGa4(p) ? 1 : 0;
  describe(`Consent ${p}${expectedGa ? "" : " (Seite ohne GA4)"}`, { concurrency: true }, () => {
    test("(a) ohne Einwilligung: 0 GA-Anfragen, Banner sichtbar", () =>
      withSession(async (s) => {
        await s.open(p);
        assert.deepEqual(s.blocked.ga, [], "GA4 wurde ohne Einwilligung angefragt");
        assert.ok(await s.banner().isVisible(), "Cookie-Banner nicht sichtbar");
      }));

    test(`(b) nach "Alle akzeptieren": genau ${expectedGa} GA-Anfrage(n)`, () =>
      withSession(async (s) => {
        await s.open(p);
        assert.equal(s.blocked.ga.length, 0, "GA4 schon vor dem Klick angefragt");
        await s.accept();
        assert.equal(s.blocked.ga.length, expectedGa, `erwartet ${expectedGa} GA-Anfrage(n), erhalten: ${JSON.stringify(s.blocked.ga)}`);
        if (expectedGa) assert.match(s.blocked.ga[0], /googletagmanager\.com\/gtag\/js\?id=G-/);
        assert.equal(await s.consent(), "all");
        assert.equal(await s.banner().count(), 0, "Banner nach Akzeptieren noch vorhanden");
      }));

    test('(c) nach "Nur notwendige": 0 GA-Anfragen, auch nach Reload', () =>
      withSession(async (s) => {
        await s.open(p);
        await s.page.getByRole("button", { name: "Nur notwendige" }).click();
        await s.settle();
        assert.equal(await s.consent(), "necessary");
        assert.deepEqual(s.blocked.ga, [], "GA4 nach Ablehnen angefragt");
        await s.reload();
        assert.deepEqual(s.blocked.ga, [], "GA4 nach Ablehnen und Reload angefragt");
        // Die Ablehnung ist gespeichert: der Banner fragt nicht bei jedem Seitenaufruf neu.
        assert.equal(await s.banner().count(), 0, "Banner erscheint trotz gespeicherter Ablehnung");
      }));

    test('(c) Widerruf ueber Footer-Link "Cookie-Einstellungen": Banner erneut, 0 GA-Anfragen', () =>
      withSession(async (s) => {
        await s.open(p);
        await s.accept();
        assert.equal(s.blocked.ga.length, expectedGa, "Voraussetzung: GA4 nach Akzeptieren wie erwartet");
        s.reset(); // ab hier zaehlt nur, was nach dem Widerruf passiert
        const reloaded = s.page.waitForEvent("domcontentloaded");
        await s.page.locator("footer a", { hasText: "Cookie-Einstellungen" }).first().click({ timeout: 5000 });
        await reloaded;
        await s.settle();
        assert.equal(await s.consent(), null, "Einwilligung nach Widerruf noch gespeichert");
        assert.ok(await s.banner().isVisible(), "Banner erscheint nach Widerruf nicht erneut");
        assert.deepEqual(s.blocked.ga, [], "GA4 nach Widerruf angefragt");
      }));

    test(`(d) Reload mit gespeicherter Einwilligung: ${expectedGa} GA-Anfrage(n) ohne Klick`, () =>
      withSession(async (s) => {
        await s.open(p);
        await s.accept();
        s.reset();
        await s.reload();
        assert.equal(s.blocked.ga.length, expectedGa, `erwartet ${expectedGa} GA-Anfrage(n) nach Reload, erhalten: ${JSON.stringify(s.blocked.ga)}`);
        assert.equal(await s.banner().count(), 0, "Banner erscheint trotz gespeicherter Einwilligung");
      }));
  });
}

// ---------------------------------------------------------------------------
// e: keine Google-Fonts-Anfragen
// ---------------------------------------------------------------------------
describe("Selbst gehostete Schriften", { concurrency: true }, () => {
  for (const p of FONT_PAGES) {
    test(`(e) ${p}: keine Anfrage an fonts.googleapis.com/fonts.gstatic.com (vor und nach Einwilligung)`, () =>
      withSession(async (s) => {
        await s.page.goto(baseUrl + p, { waitUntil: "load" });
        await s.page.evaluate(() => document.fonts.ready);
        await s.settle();
        if (await s.banner().count()) await s.accept();
        assert.deepEqual(s.blocked.fonts, [], `Google-Fonts-Anfragen: ${s.blocked.fonts.join(", ")}`);
      }));
  }
});

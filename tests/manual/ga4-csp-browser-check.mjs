// Manuelles Browser-Skript: CSP-Wirkung auf GA4-Sammel-Anfragen pruefen.
//
// Ausfuehren: node tests/manual/ga4-csp-browser-check.mjs
// (NICHT Teil von `npm test` und `npm run test:e2e`.)
//
// Ablauf:
//   - Startet zwei lokale Server (127.0.0.1): einen mit der alten CSP
//     (origin/main) und einen mit der neuen CSP (aktuelles vercel.json).
//   - Faengt ALLE Netzwerkanfragen an GA4- und GTM-Hosts ab, zaehlt sie
//     nach Ressourcentyp und bricht sie ab. Kein Datenversand an Google.
//   - Hoert auf securitypolicyviolation-Events im Seitenkontext.
//   - Testet fuer jede CSP-Variante:
//       Direktprobe: fetch() zu region1.analytics.google.com prueft, ob
//         der Browser die Anfrage per CSP blockiert (Verstoss) oder
//         durchlaesst (abgefangen durch route.abort).
//       Fall (a) ohne Einwilligung: 0 GA-Anfragen, kein Verstoss.
//       Fall (b) nach "Alle akzeptieren": GA-Anfragen abgefangen; Typen
//         (fetch, xhr, beacon, script, image) werden gezaehlt.
//       Fall (c) "Nur notwendige" + Reload: 0 GA-Anfragen.
//   - Stichproben: Startseite (/) und /kontakt/.
//   - Bild-Pixel-Frage: Faellt gtag.js nach einem connect-src-Verstoss
//     auf einen Image-Beacon zurueck? Wird durch Zaehlen von image-Typ-
//     Anfragen an GA4-Hosts beantwortet.
//
// Browser: System-Chrome (channel "chrome"). Alternativ:
//   CHROME_PATH=/pfad/zu/chrome node tests/manual/ga4-csp-browser-check.mjs

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONSENT_KEY = "elevoniq_consent";
const SETTLE_MS = 800;

// ---------------------------------------------------------------------------
// CSP-Varianten
// ---------------------------------------------------------------------------

const OLD_CSP =
  "upgrade-insecure-requests; default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; " +
  "frame-src 'self' https://www.loom.com https://player.vimeo.com https://outlook.office.com https://challenges.cloudflare.com; " +
  "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://challenges.cloudflare.com; " +
  "object-src 'none'; base-uri 'self'; form-action 'self' mailto: https://webto.salesforce.com;";

function loadNewCsp() {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const entry = (json.headers ?? [])
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy");
  if (!entry) throw new Error("Kein CSP-Header in vercel.json");
  return entry.value;
}

// ---------------------------------------------------------------------------
// GA4/GTM-Host-Erkennung (Apex + alle Subdomains)
// ---------------------------------------------------------------------------

function isGa4Host(hostname) {
  return (
    hostname === "analytics.google.com" ||
    hostname.endsWith(".analytics.google.com") ||
    hostname === "www.google-analytics.com" ||
    hostname.endsWith(".google-analytics.com")
  );
}

function isGtmHost(hostname) {
  return hostname === "www.googletagmanager.com";
}

// ---------------------------------------------------------------------------
// Lokaler statischer Server mit konfigurierbarem CSP-Header
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
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function startServer(cspValue) {
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
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-security-policy": cspValue,
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

async function launchBrowser() {
  const { chromium } = await import(
    path.join(root, "node_modules", "playwright-core", "index.mjs")
  );
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = "chrome";
  return chromium.launch(opts);
}

// ---------------------------------------------------------------------------
// Anfragen-Zaehler
// ---------------------------------------------------------------------------

function makeCounter() {
  const c = {
    ga4: [],       // GA4-Collect-Anfragen (abgefangen)
    gtm: [],       // GTM-Skript-Anfragen (abgefangen)
    violations: [], // securitypolicyviolation-Events
    reset() { c.ga4 = []; c.gtm = []; c.violations = []; },
    ga4ByType() {
      const m = {};
      for (const r of c.ga4) m[r.type] = (m[r.type] ?? 0) + 1;
      return m;
    },
  };
  return c;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function withPage(browser, baseUrl, fn) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const local = new URL(baseUrl).host;
  const counter = makeCounter();

  // CSP-Violation-Listener wird vor jedem Seitenload injiziert.
  await context.addInitScript(() => {
    window.__cspV = window.__cspV || [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspV.push({
        blocked: e.blockedURI,
        directive: e.effectiveDirective,
      });
    });
  });

  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.host === local || url.protocol === "data:" || url.protocol === "blob:") {
      return route.continue();
    }
    if (isGa4Host(url.hostname)) {
      counter.ga4.push({ url: url.href, host: url.hostname, type: route.request().resourceType() });
    } else if (isGtmHost(url.hostname)) {
      counter.gtm.push({ url: url.href, type: route.request().resourceType() });
    }
    return route.abort();
  });

  const page = await context.newPage();

  async function flushViolations() {
    const v = await page.evaluate(() => {
      const r = window.__cspV || [];
      window.__cspV = [];
      return r;
    }).catch(() => []);
    counter.violations.push(...v);
  }

  async function open(p) {
    counter.reset();
    await page.goto(baseUrl + p, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);
    await flushViolations();
  }

  async function reload() {
    counter.reset();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);
    await flushViolations();
  }

  async function accept() {
    counter.reset();
    await page.getByRole("button", { name: "Alle akzeptieren" }).click();
    await page.waitForTimeout(SETTLE_MS);
    await flushViolations();
  }

  async function reject() {
    await page.getByRole("button", { name: "Nur notwendige" }).click();
    await page.waitForTimeout(400);
  }

  // Direktprobe: fetch() zu targetUrl aus dem Seitenkontext.
  // Bei CSP-Block: Verstoss in counter.violations, kein Netzwerktreffer.
  // Bei CSP-Allow: route.abort() faengt die Anfrage ab, Netzwerkfehler im Browser.
  async function probeFetch(targetUrl) {
    counter.reset();
    await page.evaluate(async (url) => {
      try { await fetch(url, { method: "POST", body: "probe=1", keepalive: true }); }
      catch { /* Netzwerkfehler erwartet (route.abort) oder CSP-Block */ }
    }, targetUrl);
    await page.waitForTimeout(400);
    await flushViolations();
  }

  try {
    await fn({ page, counter, open, reload, accept, reject, probeFetch });
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Ausgabe-Hilfsfunktionen
// ---------------------------------------------------------------------------

let totalFail = 0;

function row(label, ga4, gtm, violations, notes) {
  const imgCount = (ga4.filter((r) => r.type === "image")).length;
  const ga4Total = ga4.length;
  const vTotal = violations.length;
  const passA = notes.includes("PASS");
  if (!passA) totalFail++;
  console.log(
    `  ${label.padEnd(42)} | GA4: ${String(ga4Total).padStart(2)} | GTM: ${String(gtm.length).padStart(2)}` +
    ` | Verstoss: ${String(vTotal).padStart(2)} | Bild: ${String(imgCount).padStart(2)} | ${notes}`,
  );
  if (vTotal > 0) {
    for (const v of violations) {
      console.log(`    CSP-Verstoss: ${v.directive} -> ${v.blocked}`);
    }
  }
  if (ga4.length > 0) {
    const byType = {};
    for (const r of ga4) byType[r.type] = (byType[r.type] ?? 0) + 1;
    console.log(`    GA4-Anfragen: ${JSON.stringify(byType)}`);
    for (const r of ga4) console.log(`      ${r.type.padEnd(10)} ${r.host}  ${r.url.slice(0, 80)}`);
  }
}

function check(condition, label) {
  if (condition) {
    return "PASS";
  } else {
    totalFail++;
    return "FAIL";
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

async function run() {
  const newCsp = loadNewCsp();
  console.log("=== GA4-CSP-Browser-Pruefung ===");
  console.log(`Datum: ${new Date().toISOString().slice(0, 10)}`);
  console.log("\nAlte CSP (connect-src):");
  console.log(" ", OLD_CSP.match(/connect-src[^;]*/)?.[0]);
  console.log("\nNeue CSP (connect-src):");
  console.log(" ", newCsp.match(/connect-src[^;]*/)?.[0]);
  console.log();

  const [oldServer, newServer] = await Promise.all([
    startServer(OLD_CSP),
    startServer(newCsp),
  ]);

  const browser = await launchBrowser();

  console.log("  Spalten: GA4=abgefangene GA4-Anfragen | GTM=GTM-Skriptanfragen | Verstoss=CSP-Violation-Events | Bild=Image-Typ-Anfragen an GA4");
  console.log("  " + "-".repeat(100));

  const PAGES = ["/", "/kontakt/"];
  const PROBE_URL = "https://region1.analytics.google.com/g/collect";

  try {
    for (const [cspLabel, baseUrl, isOld] of [
      ["ALTE CSP (origin/main)", oldServer.address().port, true],
      ["NEUE CSP (Branch)", newServer.address().port, false],
    ]) {
      const base = `http://127.0.0.1:${baseUrl}`;
      console.log(`\n--- ${cspLabel} ---`);

      // Direktprobe: region1.analytics.google.com
      await withPage(browser, base, async ({ page, counter, open, probeFetch }) => {
        await open("/");
        await probeFetch(PROBE_URL);
        const blocked = counter.violations.some((v) => v.blocked.includes("region1"));
        const intercepted = counter.ga4.some((r) => r.host.includes("region1"));
        const note = isOld
          ? check(blocked, "region1 blockiert durch connect-src") + " region1-Verstoss (erwartet bei alter CSP)"
          : check(!blocked && intercepted, "region1 abgefangen (kein Verstoss)") + " region1-Verstoss=0, abgefangen=" + (intercepted ? "ja" : "nein");
        row("Direktprobe region1 (fetch-Probe)", counter.ga4, counter.gtm, counter.violations, note);
      });

      for (const p of PAGES) {
        // Fall (a): ohne Einwilligung
        await withPage(browser, base, async ({ counter, open }) => {
          await open(p);
          const note = check(counter.ga4.length === 0 && counter.violations.length === 0, "(a)") +
            " (a) 0 GA4-Anfragen, 0 Verstoesse";
          row(`${p} (a) ohne Einwilligung`, counter.ga4, counter.gtm, counter.violations, note);
        });

        // Fall (b): nach "Alle akzeptieren"
        // Strukturelle Testbedingung: gtm.js wird durch route.abort() abgefangen
        // und nie ausgefuehrt. Ohne gtm.js-Ausfuehrung sendet gtag.js keinen
        // /g/collect-Hit. GA4=0 ist daher eine unvermeidliche Einschraenkung
        // dieses Lokaltests, keine Eigenschaft der CSP. Die PASS-Bedingung
        // beruht auf counter.gtm >= 1 (GTM-Anfrage abgefangen), nicht auf GA4-Hits.
        // Der End-to-End-Nachweis (echte /g/collect, Status 204) erfordert einen
        // Live-Deploy (Beobachtung B-01 im Review).
        await withPage(browser, base, async ({ counter, open, accept }) => {
          await open(p);
          await accept();
          const hasGa4 = counter.ga4.length > 0 || counter.gtm.length > 0;
          const noViolation = counter.violations.length === 0;
          const imgCount = counter.ga4.filter((r) => r.type === "image").length;
          const note = isOld
            ? check(hasGa4, "(b)") + " (b) nach Accept: GA4/GTM-Anfragen=" + (counter.ga4.length + counter.gtm.length) +
              ", Verstoss=" + counter.violations.length + ", Bild-Fallback=" + (imgCount > 0 ? "JA" : "nein")
            : check(hasGa4 && noViolation, "(b)") + " (b) nach Accept: GA4/GTM=" + (counter.ga4.length + counter.gtm.length) +
              ", Verstoss=0 (erwartet), Bild-Fallback=" + (imgCount > 0 ? "JA" : "nein");
          row(`${p} (b) nach Alle akzeptieren`, counter.ga4, counter.gtm, counter.violations, note);
        });

        // Fall (c): ablehnen + Reload
        await withPage(browser, base, async ({ counter, open, reject, reload }) => {
          await open(p);
          await reject();
          await reload();
          const note = check(counter.ga4.length === 0 && counter.violations.length === 0, "(c)") +
            " (c) nach Ablehnen+Reload: 0 GA4, 0 Verstoss";
          row(`${p} (c) ablehnen + Reload`, counter.ga4, counter.gtm, counter.violations, note);
        });
      }
    }
  } finally {
    await browser.close();
    await Promise.all([
      new Promise((r) => oldServer.close(r)),
      new Promise((r) => newServer.close(r)),
    ]);
  }

  console.log("\n" + "=".repeat(50));
  if (totalFail === 0) {
    console.log("Ergebnis: PASS (alle Erwartungen erfuellt)");
  } else {
    console.log(`Ergebnis: ${totalFail} Erwartung(en) nicht erfuellt (siehe FAIL oben)`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("Fehler:", err.message, err.stack);
  process.exit(1);
});

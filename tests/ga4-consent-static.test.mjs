// Statische Absicherung der GA4-Einwilligung (ohne Browser, laeuft in `npm test`).
// Gegenstueck zu den Browser-Tests in tests/e2e/consent.e2e.mjs (`npm run test:e2e`).
//
// Regel: Jede HTML-Seite, die GA4 enthaelt, muss
//   1. cookie-consent.js einbinden (Pfad muss auf assets/js/cookie-consent.js zeigen),
//   2. im <footer> den Widerrufs-Link "Cookie-Einstellungen" haben,
//   3. GA4 nicht per festem <script src="...googletagmanager..."> laden
//      (das wuerde vor jeder Einwilligung feuern).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", ".claude", ".superpowers", "tests"]);
const CONSENT_SCRIPT = path.join(root, "assets", "js", "cookie-consent.js");

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listHtmlFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".html")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const ga4Pages = listHtmlFiles(root)
  .map((file) => ({ file, rel: path.relative(root, file), html: fs.readFileSync(file, "utf8") }))
  .filter((p) => p.html.includes("googletagmanager.com"));

test("GA4-Seiten werden gefunden (Schutz gegen leeren Durchlauf)", () => {
  assert.ok(ga4Pages.length >= 30, `nur ${ga4Pages.length} GA4-Seiten gefunden, erwartet mindestens 30`);
});

test("jede GA4-Seite bindet cookie-consent.js mit gueltigem Pfad ein", () => {
  const failures = [];
  for (const { file, rel, html } of ga4Pages) {
    const srcs = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']*cookie-consent\.js)["']/g)].map((m) => m[1]);
    if (srcs.length === 0) {
      failures.push(`${rel}: kein <script src=".../cookie-consent.js">`);
      continue;
    }
    const resolved = srcs.map((src) =>
      src.startsWith("/") ? path.join(root, src) : path.resolve(path.dirname(file), src),
    );
    if (!resolved.includes(CONSENT_SCRIPT)) {
      failures.push(`${rel}: cookie-consent.js-Pfad zeigt nicht auf assets/js/cookie-consent.js (${srcs.join(", ")})`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test('jede GA4-Seite hat im Footer den Link "Cookie-Einstellungen"', () => {
  const failures = [];
  for (const { rel, html } of ga4Pages) {
    const footers = [...html.matchAll(/<footer[\s\S]*?<\/footer>/g)].map((m) => m[0]);
    const ok = footers.some((f) => /<a\b[^>]*>\s*Cookie-Einstellungen\s*<\/a>/.test(f));
    if (!ok) failures.push(footers.length ? `${rel}: Link fehlt im <footer>` : `${rel}: kein <footer>`);
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("keine GA4-Seite laedt gtag.js per festem <script src> (nur dynamisch nach Einwilligung)", () => {
  const failures = ga4Pages
    .filter(({ html }) => /<script[^>]*\ssrc=["'][^"']*googletagmanager\.com/i.test(html))
    .map(({ rel }) => rel);
  assert.deepEqual(failures, [], `GA4 ohne Einwilligung eingebunden in:\n${failures.join("\n")}`);
});

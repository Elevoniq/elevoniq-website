// Statischer CSP-Test: GA4-Endpunkte muss connect-src erlauben.
//
// Hintergrund: gtag.js waehlt fuer deutsche Besucher den regionalen Sammel-
// Endpunkt region1.analytics.google.com (Konfig "region1" fuer DE/DE-BE).
// Fuer Besucher ohne regionalen Routing-Eintrag lautet der Host
// analytics.google.com (Apex). Beide Hosts muessen in connect-src stehen.
//
// Wildcard-Einschraenkung: https://*.analytics.google.com deckt den Apex-
// Host analytics.google.com nach CSP Level 3 NICHT ab. Der Apex muss
// explizit aufgefuehrt werden. www.google-analytics.com ist dagegen eine
// Subdomain von google-analytics.com und wird durch *.google-analytics.com
// korrekt abgedeckt; kein zusaetzlicher Apex-Eintrag noetig.
//
// Quellen:
//   https://developers.google.com/tag-platform/security/guides/csp
//   (Abschnitt "Google Analytics", Stand 2026-09-18)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// CSP-Parser (Minimal-Implementierung nach RFC 9239 und WHATWG CSP Level 3)
// ---------------------------------------------------------------------------

/** Extrahiert den Wert einer CSP-Direktive aus einem CSP-Header-String. */
function parseDirective(cspValue, directiveName) {
  const lower = cspValue.toLowerCase();
  const start = lower.indexOf(directiveName.toLowerCase());
  if (start === -1) return [];
  const afterName = cspValue.slice(start + directiveName.length).trimStart();
  const semicolon = afterName.indexOf(";");
  const raw = semicolon === -1 ? afterName : afterName.slice(0, semicolon);
  return raw.trim().split(/\s+/).filter(Boolean);
}

/**
 * Prueft, ob eine URL durch mindestens eine CSP-Quellenangabe abgedeckt wird.
 *
 * Host-Matching nach CSP Level 3:
 * - "*.example.com" deckt Subdomains ab (foo.example.com), NICHT den Apex
 *   (example.com). Nur urlHost.endsWith(".example.com") ist erlaubt.
 * - Scheme muss uebereinstimmen.
 * - Port wird nur geprueft, wenn explizit in der Quellenangabe enthalten.
 */
function cspConnectAllows(sources, urlStr) {
  const url = new URL(urlStr);
  for (const src of sources) {
    if (src.startsWith("'")) continue; // Keywords ('self', 'none', ...)
    let srcUrl;
    try {
      srcUrl = new URL(src.startsWith("http") ? src : "https://" + src);
    } catch {
      continue;
    }
    if (srcUrl.protocol !== url.protocol) continue;
    const srcHost = srcUrl.hostname;
    const urlHost = url.hostname;
    if (srcHost.startsWith("*.")) {
      // Wildcard: "*.example.com" -> suffix = ".example.com"
      // "foo.example.com".endsWith(".example.com") -> true  (Subdomain OK)
      // "example.com".endsWith(".example.com")     -> false (Apex NICHT OK)
      const suffix = srcHost.slice(1);
      if (urlHost.endsWith(suffix)) {
        return { allowed: true, matchedSource: src };
      }
    } else if (srcHost === urlHost) {
      return { allowed: true, matchedSource: src };
    }
  }
  return { allowed: false };
}

/** Laedt den CSP-Eintrag aus vercel.json. */
function loadCspEntry() {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  return (json.headers ?? [])
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy") ?? null;
}

// ---------------------------------------------------------------------------
// Testdaten
// ---------------------------------------------------------------------------

// Alle bekannten GA4-Sammel-URLs; alle muessen von connect-src erlaubt sein.
//   - analytics.google.com     : Apex, kein Region-Praefix; muss explizit stehen
//   - www.google-analytics.com : Subdomain, durch *.google-analytics.com abgedeckt
//   - region1.*                : Regionale Endpunkte, durch Wildcard abgedeckt
const ALL_GA4_ENDPOINTS = [
  "https://analytics.google.com/g/collect",
  "https://www.google-analytics.com/g/collect",
  "https://region1.analytics.google.com/g/collect",
  "https://region1.google-analytics.com/g/collect",
];

// analytics.google.com ist der einzige GA4-Endpunkt, dessen Host nicht durch
// einen Wildcard-Eintrag abgedeckt werden kann. Er muss explizit in
// connect-src stehen.
const REQUIRES_EXPLICIT_ENTRY = "analytics.google.com";

const GTM_ENDPOINT = "https://www.googletagmanager.com/gtm.js";

// ---------------------------------------------------------------------------
// Selbsttest der Matcher-Logik
// ---------------------------------------------------------------------------

test("CSP-Matcher: Wildcard deckt Apex-Host nicht ab (Selbsttest)", () => {
  // *.analytics.google.com darf analytics.google.com (Apex) nicht matchen.
  assert.deepEqual(
    cspConnectAllows(["https://*.analytics.google.com"], "https://analytics.google.com/g/collect"),
    { allowed: false },
    "*.analytics.google.com muss analytics.google.com ablehnen",
  );
  // *.analytics.google.com muss region1.analytics.google.com akzeptieren.
  assert.ok(
    cspConnectAllows(["https://*.analytics.google.com"], "https://region1.analytics.google.com/g/collect").allowed,
    "*.analytics.google.com muss region1.analytics.google.com akzeptieren",
  );
  // *.google-analytics.com muss www.google-analytics.com akzeptieren.
  assert.ok(
    cspConnectAllows(["https://*.google-analytics.com"], "https://www.google-analytics.com/g/collect").allowed,
    "*.google-analytics.com muss www.google-analytics.com akzeptieren",
  );
  // *.google-analytics.com darf google-analytics.com (Apex) nicht matchen.
  assert.deepEqual(
    cspConnectAllows(["https://*.google-analytics.com"], "https://google-analytics.com/g/collect"),
    { allowed: false },
    "*.google-analytics.com muss google-analytics.com ablehnen",
  );
});

// ---------------------------------------------------------------------------
// Tests gegen vercel.json
// ---------------------------------------------------------------------------

test("vercel.json enthaelt Content-Security-Policy-Header", () => {
  assert.ok(loadCspEntry(), "Kein Content-Security-Policy-Header in vercel.json");
});

test("connect-src deckt alle GA4-Sammel-Endpunkte ab", () => {
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "connect-src");
  assert.ok(sources.length > 0, "connect-src ist leer oder fehlt");

  const failures = [];
  for (const endpoint of ALL_GA4_ENDPOINTS) {
    const result = cspConnectAllows(sources, endpoint);
    if (!result.allowed) {
      failures.push(`BLOCKIERT: ${endpoint}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Diese GA4-Endpunkte sind nicht in connect-src erlaubt:\n${failures.join("\n")}\nconnect-src: ${sources.join(" ")}`,
  );
});

test("connect-src enthaelt analytics.google.com als expliziten Eintrag (kein Wildcard-Ersatz)", () => {
  // analytics.google.com ist der Apex-Host; *.analytics.google.com deckt
  // ihn per CSP-Spezifikation nicht ab. Er muss explizit stehen.
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "connect-src");
  const explicitFound = sources.some((src) => {
    if (src.startsWith("'") || src.includes("*")) return false;
    try {
      return new URL(src.startsWith("http") ? src : "https://" + src).hostname === REQUIRES_EXPLICIT_ENTRY;
    } catch {
      return false;
    }
  });
  assert.ok(
    explicitFound,
    `${REQUIRES_EXPLICIT_ENTRY} fehlt als expliziter Eintrag in connect-src.\nconnect-src: ${sources.join(" ")}`,
  );
});

test("connect-src erlaubt https://www.googletagmanager.com (GTM-Laufzeitanfragen)", () => {
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "connect-src");
  const result = cspConnectAllows(sources, GTM_ENDPOINT);
  assert.ok(
    result.allowed,
    `https://www.googletagmanager.com fehlt in connect-src.\nconnect-src: ${sources.join(" ")}`,
  );
});

test("script-src enthaelt https://www.googletagmanager.com (GTM-Skriptladen)", () => {
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "script-src");
  const result = cspConnectAllows(sources, GTM_ENDPOINT);
  assert.ok(
    result.allowed,
    `https://www.googletagmanager.com fehlt in script-src.\nscript-src: ${sources.join(" ")}`,
  );
});

test("connect-src enthaelt https://*.google.com (Google-Pflichtangabe fuer GA4 ohne Ads)", () => {
  // Quelle: Google Tag Platform CSP Guide, Abschnitt "Google Analytics",
  // "To use Google Analytics without any Ads features":
  //   connect-src muss https://*.google.com enthalten.
  // Hinweis: *.google.com deckt analytics.google.com (eine Ebene tief) ab,
  // aber NICHT region1.analytics.google.com (zwei Ebenen tief). Der Eintrag
  // *.analytics.google.com bleibt deshalb weiterhin erforderlich.
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "connect-src");
  const hasGoogleDotCom = sources.some((src) => {
    return src === "https://*.google.com";
  });
  assert.ok(
    hasGoogleDotCom,
    `https://*.google.com fehlt in connect-src (Google-Pflichtangabe fuer GA4 ohne Ads).\nconnect-src: ${sources.join(" ")}`,
  );
});

test("connect-src enthaelt 'self' und Cloudflare (Regressionswache)", () => {
  const cspEntry = loadCspEntry();
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const sources = parseDirective(cspEntry.value, "connect-src");
  assert.ok(sources.includes("'self'"), "connect-src: 'self' fehlt");
  assert.ok(
    cspConnectAllows(sources, "https://challenges.cloudflare.com/turnstile").allowed,
    "connect-src: https://challenges.cloudflare.com fehlt",
  );
});

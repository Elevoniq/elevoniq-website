// Statischer CSP-Test: GA4-Regionsendpunkte muss connect-src erlauben.
//
// Hintergrund: gtag.js waehlt fuer deutsche Besucher den regionalen Sammel-
// Endpunkt region1.analytics.google.com (Konfig "region1" fuer DE/DE-BE).
// Eine CSP mit nur https://www.google-analytics.com und
// https://analytics.google.com deckt diese Subdomain nicht ab. Der Browser
// blockiert navigator.sendBeacon() / fetch() an diesen Host still; GA4
// bekommt keine Treffer, obwohl das Skript geladen wurde.
//
// Dieser Test liest den CSP-Wert direkt aus vercel.json und prueft, ob
// connect-src die bekannten Regionsendpunkte abdeckt.
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
  // Wert endet am naechsten Semikolon oder am Ende
  const semicolon = afterName.indexOf(";");
  const raw = semicolon === -1 ? afterName : afterName.slice(0, semicolon);
  return raw.trim().split(/\s+/).filter(Boolean);
}

/**
 * Prueft, ob eine URL durch mindestens eine CSP-Quellenangabe abgedeckt wird.
 * Implementiert Host-Matching nach CSP Level 3:
 * - "*.example.com" deckt any-subdomain.example.com ab (einstufiger Wildcard
 *   laut Spezifikation, in der Praxis aber suffix-basiert: jede Subdomain).
 * - Scheme muss uebereinstimmen.
 * - Port wird nur geprueft, wenn explizit angegeben.
 */
function cspConnectAllows(sources, urlStr) {
  const url = new URL(urlStr);
  for (const src of sources) {
    // Keyword-Tokens ueberspringen
    if (src.startsWith("'")) continue;
    let srcUrl;
    try {
      srcUrl = new URL(src.startsWith("http") ? src : "https://" + src);
    } catch {
      continue;
    }
    // Scheme-Pruefung
    if (srcUrl.protocol !== url.protocol) continue;
    // Host-Pruefung
    const srcHost = srcUrl.hostname;
    const urlHost = url.hostname;
    if (srcHost.startsWith("*.")) {
      const suffix = srcHost.slice(1); // z. B. ".google-analytics.com"
      if (urlHost === suffix.slice(1) || urlHost.endsWith(suffix)) {
        return { allowed: true, matchedSource: src };
      }
    } else if (srcHost === urlHost) {
      return { allowed: true, matchedSource: src };
    }
  }
  return { allowed: false };
}

// ---------------------------------------------------------------------------
// Testdaten
// ---------------------------------------------------------------------------

// Bekannte GA4-Sammel-Endpunkte. Der regionale Endpunkt fuer DE ist
// region1.analytics.google.com; weitere Regionen folgen demselben Schema.
const GA4_COLLECT_ENDPOINTS = [
  "https://analytics.google.com/g/collect",
  "https://region1.analytics.google.com/g/collect",
  "https://region1.google-analytics.com/g/collect",
  "https://www.google-analytics.com/g/collect",
];

// GTM laedt Ressourcen auch via connect-src (lt. Google-Dokumentation).
const GTM_CONNECT_ENDPOINT = "https://www.googletagmanager.com/gtm.js";

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test("vercel.json enthaelt Content-Security-Policy-Header", () => {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const headers = json.headers ?? [];
  const found = headers.flatMap((h) => h.headers ?? []).some((h) => h.key === "Content-Security-Policy");
  assert.ok(found, "Kein Content-Security-Policy-Header in vercel.json gefunden");
});

test("connect-src deckt alle GA4-Sammel-Endpunkte ab (inkl. regionaler Endpunkte)", () => {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const headers = json.headers ?? [];
  const cspEntry = headers
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy");

  assert.ok(cspEntry, "Kein CSP-Header gefunden");

  const connectSources = parseDirective(cspEntry.value, "connect-src");
  assert.ok(connectSources.length > 0, "connect-src ist leer oder fehlt");

  const failures = [];
  for (const endpoint of GA4_COLLECT_ENDPOINTS) {
    const result = cspConnectAllows(connectSources, endpoint);
    if (!result.allowed) {
      failures.push(
        `BLOCKIERT: ${endpoint}\n  connect-src: ${connectSources.join(" ")}`,
      );
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Diese GA4-Endpunkte werden von connect-src blockiert:\n${failures.join("\n")}`,
  );
});

test("connect-src erlaubt https://www.googletagmanager.com (GTM-Laufzeitanfragen)", () => {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const headers = json.headers ?? [];
  const cspEntry = headers
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy");
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const connectSources = parseDirective(cspEntry.value, "connect-src");
  const result = cspConnectAllows(connectSources, GTM_CONNECT_ENDPOINT);
  assert.ok(
    result.allowed,
    `https://www.googletagmanager.com ist nicht in connect-src erlaubt.\n  connect-src: ${connectSources.join(" ")}`,
  );
});

test("script-src enthaelt https://www.googletagmanager.com (GTM-Skriptladen)", () => {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const headers = json.headers ?? [];
  const cspEntry = headers
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy");
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const scriptSources = parseDirective(cspEntry.value, "script-src");
  const result = cspConnectAllows(scriptSources, "https://www.googletagmanager.com/gtm.js");
  assert.ok(
    result.allowed,
    `https://www.googletagmanager.com fehlt in script-src.\n  script-src: ${scriptSources.join(" ")}`,
  );
});

test("connect-src enthaelt weiterhin 'self' und Cloudflare (Regression)", () => {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const json = JSON.parse(raw);
  const headers = json.headers ?? [];
  const cspEntry = headers
    .flatMap((h) => h.headers ?? [])
    .find((h) => h.key === "Content-Security-Policy");
  assert.ok(cspEntry, "Kein CSP-Header gefunden");
  const connectSources = parseDirective(cspEntry.value, "connect-src");
  assert.ok(connectSources.includes("'self'"), "connect-src: 'self' fehlt");
  const cfAllowed = cspConnectAllows(connectSources, "https://challenges.cloudflare.com/turnstile");
  assert.ok(cfAllowed.allowed, "connect-src: https://challenges.cloudflare.com fehlt");
});

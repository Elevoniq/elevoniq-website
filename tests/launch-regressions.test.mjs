import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Portabel: Repo-Wurzel relativ zum Speicherort dieser Testdatei (tests/ -> Repo-Root),
// nicht mehr gegen einen fremden Klon per Absolutpfad.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Betreiberpflichten GBU CTAs no longer point to missing /gutachten", () => {
  const html = read("betreiberpflichten/index.html");

  assert.ok(
    !html.includes('href="/gutachten"'),
    "GBU CTAs should not point to the missing /gutachten route",
  );
  assert.ok(
    html.includes('href="/einzelleistungen/gefaehrdungsbeurteilung/"'),
    "GBU CTAs should point to the Gefaehrdungsbeurteilung service page",
  );
});

test("Vercel redirects legacy /gutachten requests to the GBU service page", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const redirect = (vercel.redirects || []).find(
    (entry) => entry.source === "/gutachten",
  );

  assert.ok(redirect, "Missing legacy redirect for /gutachten");
  assert.equal(
    redirect.destination,
    "/einzelleistungen/gefaehrdungsbeurteilung/",
    "Legacy /gutachten should redirect to the GBU service page",
  );
});

// INT-03/04-Regression: Sticky-CTA sprang hinter die fixierte Nav. Gewählte Lösung ist
// die globale CSS-Regel scroll-padding-top (nicht ein JS-scrollIntoView-Interceptor).
// Diese Tests sichern die tatsächlich ausgelieferte Lösung ab.
test("Global CSS offsets in-page anchor jumps below the sticky nav (INT-03/04)", () => {
  const css = read("assets/css/style.css");

  assert.ok(
    /scroll-padding-top\s*:/.test(css),
    "Expected global scroll-padding-top so anchor jumps land below the fixed nav",
  );
});

test("Pruefbericht sticky CTA anchors to the form section", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    html.includes('href="#pruefbericht-formular"'),
    "Expected sticky CTA to link to the pruefbericht form anchor",
  );
  assert.ok(
    html.includes('id="pruefbericht-formular"'),
    "Expected the pruefbericht form section to expose the matching anchor id",
  );
});

test("Angebotspruefung sticky CTA anchors to the form section", () => {
  const html = read("einzelleistungen/angebotspruefung/index.html");

  assert.ok(
    html.includes('href="#angebotspruefung-formular"'),
    "Expected sticky CTA to link to the angebot form anchor",
  );
  assert.ok(
    html.includes('id="angebotspruefung-formular"'),
    "Expected the angebot form section to expose the matching anchor id",
  );
});

test("Pruefbericht form validates required fields before upload fetch", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    html.includes("function getFirstInvalidField(form){"),
    "Expected pruefbericht form to include a deterministic required-field validator",
  );
  assert.ok(
    html.includes("Bitte füllen Sie alle Pflichtfelder aus und laden Sie Ihren Prüfbericht hoch."),
    "Expected pruefbericht form to show a validation message before upload",
  );
});

test("Angebotspruefung form validates required fields before upload fetch", () => {
  const html = read("einzelleistungen/angebotspruefung/index.html");

  assert.ok(
    html.includes("function getFirstInvalidField(form){"),
    "Expected angebotspruefung form to include a deterministic required-field validator",
  );
  assert.ok(
    html.includes("Bitte füllen Sie alle Pflichtfelder aus und laden Sie Ihr Angebot hoch."),
    "Expected angebotspruefung form to show a validation message before upload",
  );
});

test("Kontakt form no longer fakes a successful empty submission", () => {
  const html = read("kontakt/index.html");

  assert.ok(
    html.includes("var firstInvalid = form.querySelector(':invalid');"),
    "Expected kontakt form to validate required fields before submit",
  );
  assert.ok(
    html.includes("mailto:info@elevoniq.de"),
    "Expected kontakt form to use an explicit mail fallback instead of fake success",
  );
  assert.ok(
    !html.includes("this.querySelector('.btn-submit').textContent = 'Gesendet';"),
    "Kontakt form should no longer mark empty submissions as sent",
  );
});

test("Vertragscheck uses explicit mail fallback instead of backend placeholder submit", () => {
  const html = read("einzelleistungen/vertragscheck/index.html");

  assert.ok(
    html.includes('id="vertragscheck-form"'),
    "Expected vertragscheck form to have a concrete JS hook id",
  );
  assert.ok(
    html.includes("mailto:info@elevoniq.de"),
    "Expected vertragscheck form to open a mail fallback",
  );
  assert.ok(
    html.includes("Bitte hängen Sie den Wartungsvertrag und weitere Unterlagen in Ihrer E-Mail an"),
    "Expected vertragscheck form to explain the attachment fallback",
  );
  assert.ok(
    !html.includes('onsubmit="return false;"'),
    "Vertragscheck form should no longer rely on a dead placeholder submit",
  );
});

test("Ueber uns no longer shows fake testimonial placeholders", () => {
  const html = read("ueber-uns/index.html");

  assert.ok(
    !html.includes("Kundenlogo einsetzen"),
    "Expected ueber-uns to remove visible customer-logo placeholder copy",
  );
  assert.ok(
    !html.includes("„Beispiel:"),
    "Expected ueber-uns to remove fake example quote wording",
  );
  assert.ok(
    html.includes("Anonymisierter Projektfall aus dem Bestand von ElevonIQ"),
    "Expected ueber-uns to use anonymized case references instead",
  );
});

test("Datenschutz no longer exposes internal go-live review notes", () => {
  const html = read("datenschutz/index.html");

  assert.ok(
    !html.includes("Vor Go-Live sind folgende Punkte zu klären"),
    "Expected datenschutz page to remove visible internal go-live checklist copy",
  );
  assert.ok(
    !html.includes("Ohne unterzeichnete AVVs darf diese Erklärung nicht veröffentlicht werden"),
    "Expected datenschutz page to remove internal publication warning text",
  );
  assert.ok(
    !html.includes('class="pending-note"'),
    "Expected datenschutz page to remove the pending-note block from rendered content",
  );
});

// Nachhaltigkeitsnachweis-iframe (Frequenzumrichter): drei Schichten muessen zusammen
// stimmen, sonst zeigt der Browser ein leeres Feld oder ein kaputtes Datei-Icon.
// 1. iframe-src relativ (gleicher Host wie die Seite, egal ob elevoniq.de, www oder Preview)
// 2. CSP frame-src enthaelt 'self' (die Seite darf eigene Inhalte einbetten)
// 3. X-Frame-Options SAMEORIGIN fuer den Nachweis (statt des globalen DENY)
// Vorfall 2026-09-24: absolute src https://elevoniq.de/... brach auf www.elevoniq.de.
function listHtmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(full);
    return entry.name.endsWith(".html") ? [full] : [];
  });
}

test("Own-site iframes use host-independent src (no fixed elevoniq.de host)", () => {
  const offenders = [];
  for (const file of listHtmlFiles(root)) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/<iframe\b[^>]*?\bsrc="([^"]*)"/gis)) {
      if (/^(https?:)?\/\/(www\.)?elevoniq\.de/i.test(match[1])) {
        offenders.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "iframes to own pages must use a relative src, otherwise CSP frame-src 'self' and X-Frame-Options SAMEORIGIN block them on www/preview hosts",
  );
});

test("Nachhaltigkeitsnachweis iframe points to the existing same-origin document", () => {
  const html = read("einzelleistungen/frequenzumrichter/index.html");
  const match = html.match(/<iframe\b[^>]*\bid="nachweis-iframe"[^>]*>/is);

  assert.ok(match, "Expected the nachweis-iframe on the Frequenzumrichter page");
  const src = match[0].match(/\bsrc="([^"]*)"/i)?.[1];
  assert.equal(
    src,
    "/einzelleistungen/frequenzumrichter/nachhaltigkeitsnachweis.html",
    "Nachweis iframe must use the root-relative path",
  );
  assert.ok(
    fs.existsSync(path.join(root, src)),
    "Embedded Nachhaltigkeitsnachweis document must exist in the repo",
  );
});

test("Vercel headers allow the Nachhaltigkeitsnachweis self-embed", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const headers = vercel.headers || [];
  const globalIndex = headers.findIndex((entry) => entry.source === "/(.*)");
  const nachweisIndex = headers.findIndex(
    (entry) => entry.source === "/einzelleistungen/frequenzumrichter/nachhaltigkeitsnachweis.html",
  );
  const valueOf = (entry, key) =>
    entry?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

  const csp = valueOf(headers[globalIndex], "Content-Security-Policy") || "";
  const frameSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src"));
  assert.ok(
    frameSrc && frameSrc.split(/\s+/).includes("'self'"),
    "CSP frame-src must include 'self' so the page can embed its own Nachweis",
  );
  assert.ok(!/frame-ancestors\s+'none'/.test(csp), "CSP frame-ancestors 'none' would block the self-embed");

  assert.ok(nachweisIndex > globalIndex, "Nachweis header rule must come after the global rule to override DENY");
  assert.equal(
    valueOf(headers[nachweisIndex], "X-Frame-Options"),
    "SAMEORIGIN",
    "Nachweis document must allow same-origin framing",
  );
});

test("Smart Flap no longer ships unused placeholder styles", () => {
  const html = read("laufende-betreuung/smart-flap/index.html");

  assert.ok(
    !html.includes(".problem-graphic-placeholder"),
    "Expected smart-flap page to remove old problem placeholder styles",
  );
  assert.ok(
    !html.includes(".video-placeholder"),
    "Expected smart-flap page to remove old video placeholder styles",
  );
});

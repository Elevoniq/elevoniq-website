import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "/Users/ludwigv.busse/Documents/mirofish-market-research/elevoniq-website-repo";

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

test("Pruefbericht sticky CTA uses explicit form scrolling", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    html.includes("querySelectorAll('a[href=\"#pruefbericht-formular\"]')"),
    "Expected explicit sticky/form anchor handling for pruefbericht form links",
  );
  assert.ok(
    html.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"),
    "Expected pruefbericht form links to scroll explicitly to the form",
  );
});

test("Angebotspruefung sticky CTA uses explicit form scrolling", () => {
  const html = read("einzelleistungen/angebotspruefung/index.html");

  assert.ok(
    html.includes("querySelectorAll('a[href=\"#angebotspruefung-formular\"]')"),
    "Expected explicit sticky/form anchor handling for angebot form links",
  );
  assert.ok(
    html.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"),
    "Expected angebot form links to scroll explicitly to the form",
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

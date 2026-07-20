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

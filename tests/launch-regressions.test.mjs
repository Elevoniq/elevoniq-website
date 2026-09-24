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

// Sammelupload: Das Formular versprach "Sammelupload", liess aber nur eine Datei zu.
// Vercel lehnt Requests ueber 4,5 MB mit 413 ab (gemessen 24.09.2026), daher 4 MiB gesamt im Client.
test("Pruefbericht upload accepts multiple files within the Vercel payload limit", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    /<input type="file" id="pb-file-input"[^>]*\bmultiple\b/.test(html),
    "Expected the pruefbericht file input to allow selecting multiple files",
  );
  assert.ok(
    html.includes("bis zu 5 Dateien · max. 4 MB gesamt"),
    "Expected the dropzone hint to state the real file count and total size limit",
  );
  assert.ok(
    !html.includes("max. 9 MB"),
    "The 9 MB claim exceeds the 4.5 MB Vercel request limit and must not be shown",
  );
  assert.ok(
    html.includes("var PB_MAX_FILES=5;") && html.includes("var PB_MAX_TOTAL_BYTES=4*1024*1024;"),
    "Expected client-side limits matching api/upload.js (5 files) and the Vercel payload limit",
  );
  assert.ok(
    html.includes('id="pb-file-status" class="ev-file-status" aria-live="polite"'),
    "Expected the file selection to be announced via a polite live region",
  );
  assert.ok(
    html.includes("r.status===413"),
    "Expected a dedicated message when Vercel rejects the payload as too large",
  );
  assert.ok(
    html.includes(".toFixed(1).replace('.',',')") &&
      html.includes("' MB groß, erlaubt sind max. 4 MB.") &&
      html.includes("' Alternativ senden Sie Ihre Unterlagen an '"),
    "Expected the approved error wording with a German decimal comma",
  );
});

// Preise im Anliegen-Dropdown (Muster Frequenzumrichter-Seite, Copy von Nora).
// Kurze Labels, weil ein geschlossenes Select auf 360-px-Geraeten nur ca. 230 px Text zeigt.
// value-Attribute muessen unveraendert bleiben, der Hub wertet sie aus.
test("Pruefbericht Anliegen dropdown shows prices without changing option values", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    html.includes('<option value="einordnen">Prüfbericht einordnen: kostenlos</option>'),
    "Expected the free option to state that it is free",
  );
  assert.ok(
    html.includes('<option value="angebot_pruefen">Angebot prüfen: 148 €</option>'),
    "Expected the Angebot pruefen option to show 148 €",
  );
  assert.ok(
    html.includes('<option value="angebote_einholen">Angebote einholen: 249 €</option>'),
    "Expected the Angebote einholen option to show 249 €",
  );
  assert.ok(
    html.includes('aria-describedby="pb-anliegen-hint"') &&
      html.includes('<p id="pb-anliegen-hint" class="ev-field-hint">Preis je Aufzug, zzgl. MwSt.</p>'),
    "Expected the per-elevator and VAT note to be linked to the dropdown",
  );
});

test("Pruefbericht file input stays keyboard reachable (WCAG 2.1.1)", () => {
  const html = read("einzelleistungen/pruefbericht-check/index.html");

  assert.ok(
    !html.includes('.ev-field-upload input[type="file"]{display:none;}'),
    "display:none removes the file input from the tab order",
  );
  assert.ok(
    html.includes(".ev-field-upload:focus-within{"),
    "Expected a visible focus indicator on the dropzone when the file input has focus",
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

/**
 * ga4-consent-check.mjs — Referenzskript für manuelle GA4/Consent-Prüfung
 *
 * Dieses Skript ist KEIN Bestandteil von `npm test`.
 * Es wird nicht von `node --test "tests/**\/*.test.mjs"` erfasst, da die
 * Datei nicht auf `.test.mjs` endet.
 *
 * Zweck:
 *   Automatisierte Headless-Chrome-Prüfung der vier Consent-Szenarien
 *   (a) ohne Einwilligung, (b) nach Akzeptieren, (c) nach Ablehnen/Widerruf,
 *   (d) Reload mit gespeicherter Einwilligung.
 *   Alle Anfragen an fremde Hosts werden blockiert (Request-Interception, abort).
 *   GA-Anfragen werden ausschließlich gezählt. Es werden keine Daten an Google
 *   oder andere externe Dienste gesendet.
 *
 * Voraussetzungen (lokal, außerhalb des Projekts installieren):
 *   npm install -g playwright
 *   npx playwright install chromium
 *
 * Ausführen:
 *   1. Lokalen Server starten: npx serve . -p 5500
 *   2. In einem zweiten Terminal: node tests/manual/ga4-consent-check.mjs
 *
 * Ausgabe:
 *   Für jede Seite und jeden Fall die Anzahl der GA-Anfragen und Pass/Fail.
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5500';
const CONSENT_KEY = 'elevoniq_consent';

const PAGES = [
  '/',
  '/kontakt/',
  '/einzelleistungen/angebotspruefung/',
  '/laufende-betreuung/smart-flap/',
  '/wissen/podcast/',
  '/einzelleistungen/notruf-umruestung/',
];

const GA_PATTERN = /googletagmanager\.com|google-analytics\.com/;

/**
 * Zaehlt GA-Anfragen fuer einen einzelnen Lauf.
 * Alle Anfragen an externe Hosts werden abgebrochen (kein Datenversand).
 *
 * @param {import('playwright').Page} page
 * @param {string} path
 * @param {object} opts
 * @param {string|null} opts.presetConsent  Wert fuer localStorage vor dem Laden
 * @param {boolean}     opts.clickAccept    "Alle akzeptieren" nach dem Laden klicken
 * @param {boolean}     opts.clickReject    "Nur notwendige" nach dem Laden klicken
 * @param {boolean}     opts.revokeConsent  localStorage loeschen und neu laden
 * @returns {Promise<number>} Anzahl der GA-Anfragen
 */
async function countGaRequests(page, path, opts = {}) {
  const { presetConsent = null, clickAccept = false, clickReject = false, revokeConsent = false } = opts;

  let gaCount = 0;

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (GA_PATTERN.test(url)) {
      gaCount++;
    }
    // Alle Anfragen abbrechen: kein Netzwerkverkehr nach aussen
    route.abort();
  });

  if (presetConsent) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(([key, val]) => localStorage.setItem(key, val), [CONSENT_KEY, presetConsent]);
    await page.reload({ waitUntil: 'networkidle' });
  } else {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
  }

  if (clickAccept) {
    const btn = page.locator('button:has-text("Alle akzeptieren"), button:has-text("Akzeptieren")').first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  }

  if (clickReject) {
    const btn = page.locator('button:has-text("Nur notwendige"), button:has-text("Ablehnen")').first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  }

  if (revokeConsent) {
    await page.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);
    await page.reload({ waitUntil: 'networkidle' });
  }

  await page.unroute('**/*');
  return gaCount;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  let allPass = true;

  for (const path of PAGES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = {};
    let pass = true;

    // Fall a: ohne Einwilligung
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    results.a = await countGaRequests(page, path);
    if (results.a !== 0) pass = false;

    // Fall b: nach Akzeptieren
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    results.b = await countGaRequests(page, path, { clickAccept: true });
    if (results.b !== 1) pass = false;

    // Fall c: nach Ablehnen + Reload
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    results.c = await countGaRequests(page, path, { clickReject: true });
    if (results.c !== 0) pass = false;

    // Fall d: Reload mit gespeicherter Einwilligung
    results.d = await countGaRequests(page, path, { presetConsent: 'all' });
    if (results.d !== 1) pass = false;

    allPass = allPass && pass;
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${path}  a=${results.a} b=${results.b} c=${results.c} d=${results.d}`);

    await context.close();
  }

  await browser.close();
  console.log(allPass ? '\nErgebnis: alle Faelle bestanden.' : '\nErgebnis: Fehler gefunden, siehe FAIL-Zeilen oben.');
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

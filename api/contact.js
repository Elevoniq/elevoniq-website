/**
 * api/contact.js — ElevonIQ Buchungsformular Backend
 * Muster: api/upload.js (Validierung, Turnstile, Rate-Limit, CORS, kein PII-Logging)
 * Env-Vars: RESEND_API_KEY, CONTACT_MAIL_TO, TURNSTILE_SECRET_KEY, CONTACT_AUTOREPLY
 */

import { kv } from '@vercel/kv';

export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://elevoniq.de',
  'https://www.elevoniq.de',
];

// Allowlist gültiger Produktkennungen — angreiferkontrollierter Wert
const ALLOWED_PRODUCTS = [
  'gefaehrdungsbeurteilung',
  'zustandsbericht',
  'betriebskontrolle',
  'wartungsvertrag-ausschreiben',
  'modernisierung',
  'smart-flap',
  'all-inclusive',
  'sonstiges',
];

const RATE_LIMIT = 5;              // max. Anfragen pro IP pro Fenster
const RATE_LIMIT_WINDOW_S = 3_600; // 60 Minuten

function err(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// S-03: IP-basiertes Fixed-Window-Rate-Limiting (60 min) via Vercel KV
async function checkRateLimit(ip) {
  const windowKey = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_S * 1000));
  const key = `rl:contact:${ip}:${windowKey}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW_S * 2);
    }
    return count <= RATE_LIMIT;
  } catch {
    // KV nicht konfiguriert: Turnstile übernimmt als Fallback
    console.warn('[contact-rate-limit] KV nicht konfiguriert — Fallback auf Turnstile');
    return true;
  }
}

function buildMailBody(fields) {
  const lines = [
    `Produkt: ${fields.produkt}`,
    `Name: ${fields.name}`,
    `E-Mail: ${fields.email}`,
    fields.telefon ? `Telefon: ${fields.telefon}` : null,
    fields.anzahl_aufzuege ? `Anzahl Aufzüge: ${fields.anzahl_aufzuege}` : null,
    fields.standort ? `Standort: ${fields.standort}` : null,
    fields.leistungsempfaenger ? `Leistungsempfänger: ${fields.leistungsempfaenger}` : null,
    fields.rechnungsempfaenger ? `Rechnungsempfänger: ${fields.rechnungsempfaenger}` : null,
    fields.nachricht ? `\nNachricht:\n${fields.nachricht}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildAutoreplyBody(fields) {
  return (
    `Sehr geehrte Dame, sehr geehrter Herr ${fields.name},\n\n` +
    `vielen Dank für Ihre Anfrage. Wir haben Ihre Nachricht erhalten und melden uns in der Regel innerhalb von 24 Stunden (Werktage) bei Ihnen.\n\n` +
    `Falls Sie Fragen haben oder Ihre Anfrage ergänzen möchten, antworten Sie einfach auf diese E-Mail.\n\n` +
    `Mit freundlichen Grüßen\nElevonIQ GmbH\nanfragen@elevoniq.de`
  );
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Methode nicht erlaubt.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';

  const originAllowed = ALLOWED_ORIGINS.includes(origin);
  const refererAllowed = ALLOWED_ORIGINS.some(o => referer.startsWith(o));

  if (!originAllowed && !refererAllowed) {
    return err(403, 'Anfragen von dieser Quelle werden nicht akzeptiert.');
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  if (!clientIp) {
    return err(400, 'Anfrage konnte nicht verarbeitet werden.');
  }

  const rateLimitOk = await checkRateLimit(clientIp);
  if (!rateLimitOk) {
    return err(429, 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.');
  }

  const resendKey = process.env.RESEND_API_KEY;
  const mailTo = process.env.CONTACT_MAIL_TO || 'anfragen@elevoniq.de';
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const autoreply = process.env.CONTACT_AUTOREPLY === '1';

  if (!resendKey || !turnstileSecret) {
    return err(500, 'Serverkonfiguration unvollständig.');
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return err(400, 'Ungültiges Formular-Format.');
  }

  // Honeypot: wird von echten Nutzern nicht ausgefüllt
  const honeypot = formData.get('website') || '';
  if (honeypot.trim() !== '') {
    // Stille 200-Antwort — Bot-Aktivität nicht bestätigen
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Turnstile-Verifizierung
  const turnstileToken = formData.get('cf-turnstile-response') || '';
  if (!turnstileToken) {
    return err(400, 'Sicherheitsverifikation fehlt. Bitte Seite neu laden und erneut versuchen.');
  }

  let turnstileOk = false;
  try {
    const tv = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: turnstileSecret, response: turnstileToken }),
    });
    const tvData = await tv.json();
    turnstileOk = tvData.success === true;
  } catch {
    return err(502, 'Sicherheitsverifikation konnte nicht geprüft werden. Bitte erneut versuchen.');
  }

  if (!turnstileOk) {
    return err(403, 'Sicherheitsverifikation fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.');
  }

  // Feldextraktion und Validierung (kein PII im Log)
  const raw = {
    produkt:             (formData.get('produkt') || '').trim(),
    name:                (formData.get('name') || '').trim(),
    email:               (formData.get('email') || '').trim(),
    telefon:             (formData.get('telefon') || '').trim(),
    anzahl_aufzuege:     (formData.get('anzahl_aufzuege') || '').trim(),
    standort:            (formData.get('standort') || '').trim(),
    leistungsempfaenger: (formData.get('leistungsempfaenger') || '').trim(),
    rechnungsempfaenger: (formData.get('rechnungsempfaenger') || '').trim(),
    nachricht:           (formData.get('nachricht') || '').trim(),
  };

  // Produkt-Allowlist
  if (!ALLOWED_PRODUCTS.includes(raw.produkt)) {
    return err(400, 'Ungültiges Produktfeld.');
  }

  // Pflichtfelder
  if (!raw.name || raw.name.length < 2) {
    return err(400, 'Bitte geben Sie Ihren Namen an.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!raw.email || !emailRegex.test(raw.email)) {
    return err(400, 'Bitte geben Sie eine gültige E-Mail-Adresse an.');
  }

  // Längen-Limits (kein PII-Logging bei Überschreitung)
  if (raw.name.length > 200 || raw.email.length > 254 || raw.nachricht.length > 5000) {
    return err(400, 'Ein Feld überschreitet die maximale Länge.');
  }

  const subject = `Neue Anfrage: ${raw.produkt} — ElevonIQ`;
  const body = buildMailBody(raw);

  // Mail senden via Resend (EU-Region Frankfurt)
  let sendOk = false;
  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'ElevonIQ Formular <noreply@elevoniq.de>',
        to: [mailTo],
        reply_to: raw.email,
        subject,
        text: body,
      }),
    });
    sendOk = resendResp.status >= 200 && resendResp.status < 300;
  } catch {
    return err(502, 'Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es per E-Mail.');
  }

  if (!sendOk) {
    return err(502, 'Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es per E-Mail.');
  }

  // Automatische Bestätigungsmail (opt-in via Env-Var)
  if (autoreply) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'ElevonIQ <anfragen@elevoniq.de>',
          to: [raw.email],
          subject: 'Ihre Anfrage bei ElevonIQ ist eingegangen',
          text: buildAutoreplyBody(raw),
        }),
      });
    } catch {
      // Autoreply-Fehler ist nicht kritisch — Hauptmail wurde gesendet
      console.warn('[contact] Autoreply-Versand fehlgeschlagen');
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = { runtime: 'nodejs' };

const ALLOWED_ORIGINS = [
  'https://elevoniq.de',
  'https://www.elevoniq.de',
];

const MAX_FILE_SIZE = 9 * 1024 * 1024;
const MAX_FILES = 5;

const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46];
const MAGIC_JPEG = [0xFF, 0xD8, 0xFF];
const MAGIC_PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const PDF_THREAT_PATTERN = /\/JS\s|\/JavaScript\s|\/OpenAction\s|\/AA\s/i;

function err(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function matchesMagic(bytes, magic) {
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function detectFileType(bytes) {
  if (matchesMagic(bytes, MAGIC_PDF)) return 'pdf';
  if (matchesMagic(bytes, MAGIC_JPEG)) return 'jpeg';
  if (matchesMagic(bytes, MAGIC_PNG)) return 'png';
  return null;
}

async function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return `Datei "${file.name}" überschreitet das Limit von 9 MB.`;
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const fileType = detectFileType(bytes);
  if (!fileType) {
    return `Datei "${file.name}" ist kein gültiges PDF, JPEG oder PNG.`;
  }

  if (fileType === 'pdf') {
    // Prüfe erste 64 KB auf eingebettetes JavaScript
    const checkLength = Math.min(bytes.length, 65536);
    const pdfText = new TextDecoder('latin1').decode(bytes.subarray(0, checkLength));
    if (PDF_THREAT_PATTERN.test(pdfText)) {
      return `Datei "${file.name}" enthält aktive Inhalte und wurde abgelehnt.`;
    }
  }

  return null;
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

  // Für echtes Rate Limiting ist Vercel KV erforderlich (persistenter State über Edge-Instanzen hinweg).
  // Ohne KV ist kein zuverlässiges IP-basiertes Zählen möglich — dieser Check ist nur eine Heuristik.
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  if (!clientIp) {
    return err(400, 'Anfrage konnte nicht verarbeitet werden.');
  }

  const apiKey = process.env.HUB_API_KEY;
  if (!apiKey) {
    return err(500, 'Serverkonfiguration unvollständig.');
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return err(400, 'Ungültiges Formular-Format.');
  }

  const turnstileToken = formData.get('cf-turnstile-response');
  if (!turnstileToken) {
    return err(400, 'Sicherheitsverifikation fehlt. Bitte Seite neu laden und erneut versuchen.');
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    return err(500, 'Serverkonfiguration unvollständig.');
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

  const files = [];
  for (const [, value] of formData.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return err(400, 'Keine Datei übermittelt.');
  }

  if (files.length > MAX_FILES) {
    return err(400, `Maximal ${MAX_FILES} Dateien pro Anfrage erlaubt.`);
  }

  for (const file of files) {
    const validationError = await validateFile(file);
    if (validationError) {
      return err(400, validationError);
    }
  }

  const queueType = formData.get('queueType') || 'other-documents';

  const upstreamData = new FormData();
  const meta = {};

  for (const [key, value] of formData.entries()) {
    if (key === 'queueType') continue;
    if (value instanceof File) {
      upstreamData.append('files', value);
    } else if (key === 'userInfo') {
      upstreamData.set('userInfo', value);
    } else {
      meta[key] = value;
    }
  }

  if (!upstreamData.get('userInfo') && Object.keys(meta).length > 0) {
    const name = [
      meta['sf_vorname'] || meta['vorname'] || '',
      meta['sf_nachname'] || meta['nachname'] || '',
    ].filter(Boolean).join(' ');
    const userInfo = {
      email: meta['sf_email'] || meta['email'] || '',
      name,
      ...meta,
    };
    upstreamData.set('userInfo', JSON.stringify(userInfo));
  }

  let upstream;
  try {
    upstream = await fetch(
      `https://hub-backend.elevoniq.de/api/v1/documents/upload/${queueType}`,
      {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: upstreamData,
      }
    );
  } catch {
    return err(502, 'Weiterleitung an den Dokumenten-Service fehlgeschlagen.');
  }

  const result = await upstream.text();
  return new Response(result, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

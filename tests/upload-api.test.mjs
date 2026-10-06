import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Verhaltenstest fuer api/upload.js: echter Handler, echter Multipart-Parser, kein Netz.
// @vercel/kv ist lokal nicht installiert und wuerde ohnehin ein Netz brauchen, daher ein
// Stub nur fuer diese Testdatei (node --test startet jede Datei in einem eigenen Prozess).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@vercel/kv") {
      return {
        url: "data:text/javascript,export const kv = { incr: async () => 1, expire: async () => 1 };",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { default: handler } = await import("../api/upload.js");

const UPSTREAM_BASE = "https://hub-backend.elevoniq.de/api/v1/landing-page-documents/upload/";
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PDF_BYTES = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n";

// Baut den Request so, wie ein Browser ihn schickt. Wichtig: Ein leer gelassenes
// <input type="file"> erscheint als Teil mit filename="" und leerem Inhalt.
// new FormData() in Node serialisiert so einen Eintrag anders, deshalb Rohformat.
// Dateiinhalt darf ein String (je Zeichen ein Byte, latin1) oder ein Uint8Array (Binaerdaten) sein.
// Formularfelder gehen wie im Browser als UTF-8 raus.
function browserRequest(parts) {
  const boundary = "----ElevonIQTestBoundary7MA4YWxkTrZu0gW";
  const chunks = [];
  const text = (s) => chunks.push(Buffer.from(s, "utf8"));
  for (const part of parts) {
    if ("filename" in part) {
      text(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
        `Content-Type: ${part.type || "application/octet-stream"}\r\n\r\n`,
      );
      if (part.content instanceof Uint8Array) chunks.push(part.content);
      else chunks.push(Buffer.from(part.content || "", "latin1"));
      text("\r\n");
    } else {
      text(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
        `${part.value}\r\n`,
      );
    }
  }
  text(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);
  return new Request("https://www.elevoniq.de/api/upload", {
    method: "POST",
    headers: {
      origin: "https://www.elevoniq.de",
      "x-forwarded-for": "203.0.113.10",
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

// Faengt Turnstile- und Hub-Aufrufe ab. Jeder andere Host laesst den Test scheitern.
function withMockedNetwork(run) {
  return async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { hub: process.env.HUB_API_KEY, ts: process.env.TURNSTILE_SECRET_KEY };
    const upstreamCalls = [];
    process.env.HUB_API_KEY = "dummy-hub-key-for-tests";
    process.env.TURNSTILE_SECRET_KEY = "dummy-turnstile-secret-for-tests";
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target === TURNSTILE_URL) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (target.startsWith(UPSTREAM_BASE)) {
        upstreamCalls.push({ url: target, body: init.body });
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }
      throw new Error(`Unerwarteter Netzaufruf im Test: ${target}`);
    };
    try {
      await run(upstreamCalls);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.hub === undefined) delete process.env.HUB_API_KEY;
      else process.env.HUB_API_KEY = originalEnv.hub;
      if (originalEnv.ts === undefined) delete process.env.TURNSTILE_SECRET_KEY;
      else process.env.TURNSTILE_SECRET_KEY = originalEnv.ts;
    }
  };
}

const TURNSTILE_PART = { name: "cf-turnstile-response", value: "dummy-turnstile-token" };

test(
  "Angebotspruefung: leerer optionaler Pruefbericht-Upload wird akzeptiert und nicht weitergeleitet",
  withMockedNetwork(async (upstreamCalls) => {
    const response = await handler(
      browserRequest([
        { name: "sf_angebot_datei", filename: "angebot.pdf", type: "application/pdf", content: PDF_BYTES },
        { name: "sf_pruefbericht_datei", filename: "" },
        { name: "sf_vorname", value: "Max" },
        { name: "sf_nachname", value: "Mustermann" },
        { name: "sf_email", value: "max@example.com" },
        TURNSTILE_PART,
        { name: "queueType", value: "quotation" },
      ]),
    );

    assert.equal(response.status, 201, `Erwartet Weiterleitung an den Hub, erhalten: ${await response.clone().text()}`);
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, `${UPSTREAM_BASE}quotation`);

    const forwarded = upstreamCalls[0].body.getAll("files");
    assert.deepEqual(forwarded.map((f) => f.name), ["angebot.pdf"], "Nur die echte Datei darf an den Hub gehen");

    const userInfo = JSON.parse(upstreamCalls[0].body.get("userInfo"));
    assert.ok(
      !("sf_pruefbericht_dateiname" in userInfo),
      "Ohne Pruefbericht darf kein leerer Dateiname im userInfo landen",
    );
  }),
);

test(
  "Frequenzumrichter: Anfrage ohne optionalen Anhang wird akzeptiert",
  withMockedNetwork(async (upstreamCalls) => {
    const response = await handler(
      browserRequest([
        { name: "sf_service", value: "express-angebot" },
        { name: "files", filename: "" },
        { name: "sf_vorname", value: "Max" },
        { name: "sf_nachname", value: "Mustermann" },
        { name: "sf_firma", value: "Beispiel Hausverwaltung GmbH" },
        { name: "sf_email", value: "max@example.com" },
        TURNSTILE_PART,
        { name: "queueType", value: "other-documents" },
        { name: "userInfo", value: JSON.stringify({ name: "Max Mustermann", email: "max@example.com" }) },
      ]),
    );

    assert.equal(response.status, 201, `Erwartet Weiterleitung an den Hub, erhalten: ${await response.clone().text()}`);
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, `${UPSTREAM_BASE}other-documents`);
    assert.equal(upstreamCalls[0].body.getAll("files").length, 0, "Der leere Eintrag darf nicht als Datei weitergehen");
  }),
);

for (const queueType of ["quotation", "assessment-report"]) {
  test(
    `Pflicht-Upload bleibt Pflicht: ${queueType} nur mit leerem Dateifeld wird abgelehnt`,
    withMockedNetwork(async (upstreamCalls) => {
      const response = await handler(
        browserRequest([
          { name: queueType === "quotation" ? "sf_angebot_datei" : "sf_pruefbericht_datei", filename: "" },
          { name: "sf_email", value: "max@example.com" },
          TURNSTILE_PART,
          { name: "queueType", value: queueType },
        ]),
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Keine Datei übermittelt." });
      assert.equal(upstreamCalls.length, 0);
    }),
  );
}

test(
  "Eine echte 0-Byte-Datei mit Namen wird weiterhin validiert und abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const response = await handler(
      browserRequest([
        { name: "sf_angebot_datei", filename: "leer.pdf", type: "application/pdf" },
        TURNSTILE_PART,
        { name: "queueType", value: "quotation" },
      ]),
    );

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /kein gültiges PDF, JPEG oder PNG/);
    assert.equal(upstreamCalls.length, 0);
  }),
);

// ---------------------------------------------------------------------------
// PDF-Filter "aktive Inhalte" (Sekur-Review 29.09.2026, Stufe 1)
//
// Regel: Abgelehnt wird nur der PDF-Name /JavaScript (case-sensitiv, grenzzeichen-bewusst,
// #xx-Escapes aufgeloest, gesamter Datei-Puffer). /OpenAction, /AA und /JS allein sind nur
// Ausloeser- bzw. Feldmarker und fuehrten auf echten Dokumenten ausschliesslich zu Fehlalarmen.
//
// Alle Testdateien sind synthetisch und werden hier im Code erzeugt. Keine echten
// Kundendokumente ins Repo: Es liegt auf GitHub, Kundendokumente enthalten personenbezogene Daten.
//
// Bekanntes Restrisiko, bewusst NICHT Teil dieses Fixes: JavaScript in komprimierten
// Objekt-Streams (/ObjStm, z.B. FlateDecode) sieht der Proxy nicht, weil er nicht dekomprimiert.
// Das adressiert erst Sekurs Stufe 2 (Backend-Malware-Scan mit Quarantaene im Hub).
// Ebenfalls bewusst ohne Block: /Launch (wurde auch vorher nicht erkannt, Stufe 2) und
// /EmbeddedFile (legitime ZUGFeRD-/XRechnung-Dokumente muessen durchgehen).
// ---------------------------------------------------------------------------

const ACTIVE_CONTENT_ERROR = 'Datei "dokument.pdf" enthält aktive Inhalte und wurde abgelehnt.';
const JS_PAYLOAD = "(app.alert(1))";

// Minimales, strukturell plausibles PDF. Die Einschuebe landen im Katalog bzw. auf der Seite.
function syntheticPdf({ catalog = "", page = "", objects = "" } = {}) {
  return (
    "%PDF-1.7\n" +
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${catalog}>>\nendobj\n` +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ${page}>>\nendobj\n` +
    objects +
    "trailer\n<< /Root 1 0 R >>\n%%EOF\n"
  );
}

// Deterministische Pseudo-Zufallsbytes (mulberry32), damit der Test reproduzierbar bleibt.
function seededBytes(length, seed) {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = (t ^ (t >>> 14)) >>> 24;
  }
  return out;
}

function uploadPdf(content) {
  return handler(
    browserRequest([
      { name: "sf_angebot_datei", filename: "dokument.pdf", type: "application/pdf", content },
      TURNSTILE_PART,
      { name: "queueType", value: "quotation" },
    ]),
  );
}

async function assertRejectedAsActiveContent(response, upstreamCalls) {
  assert.equal(response.status, 400, `Erwartet Ablehnung, erhalten: ${await response.clone().text()}`);
  // Fehlermeldung bleibt wortgleich (Frontend zeigt daneben den Mail-Ausweg documents@elevoniq.de).
  assert.deepEqual(await response.json(), { error: ACTIVE_CONTENT_ERROR });
  assert.equal(upstreamCalls.length, 0, "Eine abgelehnte Datei darf nicht an den Hub gehen");
}

async function assertAccepted(response, upstreamCalls) {
  assert.equal(response.status, 201, `Erwartet Weiterleitung an den Hub, erhalten: ${await response.clone().text()}`);
  assert.equal(upstreamCalls.length, 1);
  assert.deepEqual(upstreamCalls[0].body.getAll("files").map((f) => f.name), ["dokument.pdf"]);
}

// --- Muss abgelehnt werden --------------------------------------------------

test(
  "PDF-Filter: naive Angriffsvariante mit Leerzeichen am Dateianfang wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({ catalog: `/OpenAction << /S /JavaScript /JS ${JS_PAYLOAD} >> ` });
    assert.ok(pdf.indexOf("/JavaScript") < 200, "Payload liegt direkt am Dateianfang");
    await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: kompakte gueltige Syntax ohne Leerzeichen wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({ catalog: `/OpenAction<</S/JavaScript/JS${JS_PAYLOAD}>>` });
    await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
  }),
);

for (const escapedName of ["/Java#53cript", "/#4a#61#76#61#53#63#72#69#70#74"]) {
  test(
    `PDF-Filter: Hex-Escape im Namen (${escapedName}) wird aufgeloest und abgelehnt`,
    withMockedNetwork(async (upstreamCalls) => {
      const pdf = syntheticPdf({ catalog: `/OpenAction<</S${escapedName}/JS${JS_PAYLOAD}>>` });
      await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
    }),
  );
}

test(
  "PDF-Filter: Payload hinter Byte 65.536 (inkrementelles Update am Dateiende) wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const filler = "0 0 m 595 842 l S\n".repeat(4000); // 72.000 Byte Seiteninhalt
    const pdf =
      syntheticPdf({ objects: `4 0 obj\n<< /Length ${filler.length} >>\nstream\n${filler}endstream\nendobj\n` }) +
      // Angehaengtes Update: neuer Katalog mit Ausloeser und JavaScript-Aktion, beides hinter 64 KB.
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>\nendobj\n" +
      `5 0 obj\n<< /S /JavaScript /JS ${JS_PAYLOAD} >>\nendobj\n` +
      "trailer\n<< /Root 1 0 R >>\n%%EOF\n";
    assert.ok(pdf.indexOf("/OpenAction") > 65536, "Ausloeser liegt hinter dem alten 64-KB-Fenster");
    assert.ok(pdf.indexOf("/JavaScript") > 65536, "Payload liegt hinter dem alten 64-KB-Fenster");
    await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: kompakte /AA-Seiten-Trigger-Variante wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({ page: `/AA<</O<</S/JavaScript/JS${JS_PAYLOAD}>>>>` });
    await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: dokumentweites Skript im /Names-Baum wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({
      catalog: "/Names<</JavaScript<</Names[(init)6 0 R]>>>>",
      objects: `6 0 obj\n<</S/JavaScript/JS${JS_PAYLOAD}>>\nendobj\n`,
    });
    await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
  }),
);

// Ein PDF-Name endet an PDF-Whitespace, an einem Delimiter oder am Dateiende (ISO 32000-1, 7.2.2).
const NAME_TERMINATORS = [" ", "\n", "\r", "\t", "\f", "\0", "/", "[", "]", "<", ">", "(", ")", "{", "}", "%"];
for (const terminator of NAME_TERMINATORS) {
  test(
    `PDF-Filter: /JavaScript gefolgt von ${JSON.stringify(terminator)} wird abgelehnt`,
    withMockedNetwork(async (upstreamCalls) => {
      const pdf = `%PDF-1.7\n5 0 obj\n<</S/JavaScript${terminator}/JS${JS_PAYLOAD}>>\nendobj\n%%EOF\n`;
      await assertRejectedAsActiveContent(await uploadPdf(pdf), upstreamCalls);
    }),
  );
}

test(
  "PDF-Filter: /JavaScript direkt am Dateiende wird abgelehnt",
  withMockedNetwork(async (upstreamCalls) => {
    await assertRejectedAsActiveContent(await uploadPdf("%PDF-1.7\n5 0 obj\n<</S/JavaScript"), upstreamCalls);
  }),
);

// --- Muss durchgehen ---------------------------------------------------------

test(
  "PDF-Filter: legitimes /OpenAction [3 0 R /XYZ ...] (Word/Scanner-typisch) geht durch",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({ catalog: "/OpenAction [3 0 R /XYZ null null 0] " });
    await assertAccepted(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: legitime GoTo-Aktion (per /OpenAction und /AA ausgeloest) geht durch",
  withMockedNetwork(async (upstreamCalls) => {
    const pdf = syntheticPdf({
      catalog: "/OpenAction << /S /GoTo /D [3 0 R /Fit] >> ",
      page: "/AA << /O << /S /GoTo /D [3 0 R /FitH 842] >> >> ",
    });
    await assertAccepted(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: zufaellige /JS-, /AA- und /OpenAction-Bytes in Binaerdaten loesen nicht aus",
  withMockedNetwork(async (upstreamCalls) => {
    // Typischer Fehlalarm des alten Filters: Marker-Bytefolgen mitten in Bild- oder Streamdaten.
    const noise = Buffer.from(seededBytes(32 * 1024, 7));
    const markers = Buffer.from("/JS /AA /OpenAction /js\n/aa\t", "latin1");
    const streamData = Buffer.concat([noise.subarray(0, 1024), markers, noise.subarray(1024)]).toString("latin1");
    const pdf = syntheticPdf({
      page: "/Contents 4 0 R ",
      objects: `4 0 obj\n<< /Length ${streamData.length} /Filter /FlateDecode >>\nstream\n${streamData}\nendstream\nendobj\n`,
    });
    await assertAccepted(await uploadPdf(pdf), upstreamCalls);
  }),
);

test(
  "PDF-Filter: 4 MB Zufallsbytes mit %PDF-Header (fester Seed) gehen durch",
  withMockedNetwork(async (upstreamCalls) => {
    const size = 4 * 1024 * 1024;
    const pdf = seededBytes(size, 20260929);
    pdf.set(Buffer.from("%PDF-1.7\n", "latin1"), 0);
    await assertAccepted(await uploadPdf(pdf), upstreamCalls);
    assert.equal(upstreamCalls[0].body.getAll("files")[0].size, size, "Datei geht unveraendert an den Hub");
  }),
);

test(
  "PDF-Filter: ZUGFeRD-/XRechnung-PDF mit /EmbeddedFile geht durch",
  withMockedNetwork(async (upstreamCalls) => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice/>';
    const pdf = syntheticPdf({
      catalog: "/Names << /EmbeddedFiles << /Names [(factur-x.xml) 7 0 R] >> >> /AF [7 0 R] ",
      objects:
        "7 0 obj\n<< /Type /Filespec /F (factur-x.xml) /UF (factur-x.xml) /EF << /F 8 0 R >> /AFRelationship /Alternative >>\nendobj\n" +
        `8 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length ${xml.length} >>\nstream\n${xml}\nendstream\nendobj\n`,
    });
    await assertAccepted(await uploadPdf(pdf), upstreamCalls);
  }),
);

// PDF-Namen sind case-sensitiv (ISO 32000-1, 7.3.5): Diese Namen sind keine JavaScript-Aktion.
for (const otherName of ["/JavaScripts", "/JavaScrip", "/javascript", "/JAVASCRIPT"]) {
  test(
    `PDF-Filter: anderer PDF-Name ${otherName} loest nicht aus`,
    withMockedNetwork(async (upstreamCalls) => {
      const pdf = syntheticPdf({ catalog: `/Metadata << /Label ${otherName} >> ` });
      await assertAccepted(await uploadPdf(pdf), upstreamCalls);
    }),
  );
}

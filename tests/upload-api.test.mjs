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
function browserRequest(parts) {
  const boundary = "----ElevonIQTestBoundary7MA4YWxkTrZu0gW";
  let body = "";
  for (const part of parts) {
    if ("filename" in part) {
      body +=
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
        `Content-Type: ${part.type || "application/octet-stream"}\r\n\r\n` +
        `${part.content || ""}\r\n`;
    } else {
      body +=
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
        `${part.value}\r\n`;
    }
  }
  body += `--${boundary}--\r\n`;
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

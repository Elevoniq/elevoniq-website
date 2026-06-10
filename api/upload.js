// api/upload.js — Vercel Serverless Function
// Proxy for ElevonIQ Hub Document Upload API
// API key is stored in Vercel Environment Variables (HUB_API_KEY)
export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const formData = await request.formData();
  const queueType = formData.get('queueType') || 'other-documents';

  const apiKey = process.env.HUB_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build upstream FormData: rename all file fields to 'files', collect text fields for userInfo
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

  // Build userInfo JSON from form fields if not already provided by the frontend
  if (!upstreamData.get('userInfo') && Object.keys(meta).length > 0) {
    const name = [meta['sf_vorname'] || meta['vorname'] || '', meta['sf_nachname'] || meta['nachname'] || ''].filter(Boolean).join(' ');
    const userInfo = {
      email: meta['sf_email'] || meta['email'] || '',
      name,
      ...meta
    };
    upstreamData.set('userInfo', JSON.stringify(userInfo));
  }

  const upstream = await fetch(
    `https://hub-backend.elevoniq.de/api/v1/documents/upload/${queueType}`,
    {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: upstreamData,
    }
  );

  const result = await upstream.text();
  return new Response(result, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' }
  });
}

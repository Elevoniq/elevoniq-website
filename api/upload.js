// api/upload.js — Vercel Serverless Function
// Proxy for Simplifa Document Upload API
// API key is stored in Vercel Environment Variables (SIMPLIFA_API_KEY)
export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const formData = await request.formData();
  const queueType = formData.get('queueType') || 'assessment-report';

  const apiKey = process.env.SIMPLIFA_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Forward to Simplifa — remove queueType from formData since it goes in the URL
  const upstreamData = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key !== 'queueType') {
      upstreamData.append(key, value);
    }
  }

  const upstream = await fetch(
    `https://api-customer.simplifa.de/api/v1/documents/upload/${queueType}`,
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

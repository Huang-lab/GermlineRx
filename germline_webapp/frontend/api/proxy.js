/**
 * /api/proxy.js — Vercel Edge Function
 *
 * Transparent CORS proxy for the GermlineRx static frontend.
 * Acts as a server-side relay so the browser can reach external APIs
 * that may block cross-origin requests.
 *
 * Usage:
 *   GET  /api/proxy?url=https%3A%2F%2Fapi.example.com%2Fpath
 *   POST /api/proxy  body: { url, method?, body?, headers? }
 *
 * Only the hosts in ALLOWED_HOSTS are reachable via this proxy to
 * prevent open-relay abuse.
 */

export const config = { runtime: 'edge' }

// Allowlist — only these hostnames may be proxied
const ALLOWED_HOSTS = new Set([
  'eutils.ncbi.nlm.nih.gov',
  'clinicaltrials.gov',
  'api.fda.gov',
  'myvariant.info',
  'gnomad.broadinstitute.org',
  'dgidb.org',
  'api.platform.opentargets.org',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export default async function handler(req) {
  // Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  let targetUrl, method = 'GET', bodyText = null, extraHeaders = {}

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url)
    targetUrl = searchParams.get('url')
  } else if (req.method === 'POST') {
    let parsed
    try {
      parsed = await req.json()
    } catch {
      return jsonError('Request body must be valid JSON')
    }
    targetUrl = parsed.url
    method = (parsed.method || 'GET').toUpperCase()
    bodyText = parsed.body != null ? JSON.stringify(parsed.body) : null
    extraHeaders = parsed.headers || {}
  } else {
    return jsonError('Only GET and POST are supported', 405)
  }

  if (!targetUrl) return jsonError('Missing "url" parameter')

  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    return jsonError('Invalid URL')
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return jsonError(`Host "${parsed.hostname}" is not allowed`, 403)
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: bodyText,
      signal: AbortSignal.timeout(15000),
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream request failed', detail: String(err) }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
}

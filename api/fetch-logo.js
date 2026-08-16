const dns = require('dns').promises;
const net = require('net');
const { getAuthenticatedUser } = require('./_firebaseAdmin');

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.split(':').pop();
      if (net.isIPv4(v4)) return isPrivateIp(v4);
    }
    return false;
  }
  return true; // unrecognized format -- fail closed
}

// Blocks requests to loopback/private/link-local addresses, including via
// a public hostname that resolves to one (DNS rebinding) -- this endpoint
// fetches arbitrary user-supplied URLs from the server, which is a new
// attack surface this app didn't previously have.
async function assertPublicHost(hostname) {
  if (hostname === 'localhost') throw new Error('That URL is not allowed.');
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) {
    throw new Error('That URL is not allowed.');
  }
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'PAYE-Calc-Kenya-LogoFetcher/1.0' } });
  } finally {
    clearTimeout(timer);
  }
}

async function readBufferWithLimit(res, maxBytes = MAX_BYTES) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error('That image is too large.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Regex-based extraction is good enough here: we only need the href of the
// best-looking <link rel="...icon..."> tag or an og:image meta tag, not a
// full DOM, and pulling in an HTML parser dependency for that is overkill.
function extractIconUrl(html, baseUrl) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  let best = null;
  let bestScore = -1;
  for (const tag of linkTags) {
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!relMatch || !hrefMatch) continue;
    const rel = relMatch[1].toLowerCase();
    if (!rel.includes('icon')) continue;
    const score = rel.includes('apple-touch-icon') ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = hrefMatch[1];
    }
  }
  if (best) {
    try { return new URL(best, baseUrl).href; } catch { /* fall through */ }
  }
  const ogMatch = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogMatch) {
    try { return new URL(ogMatch[1], baseUrl).href; } catch { /* fall through */ }
  }
  return null;
}

async function fetchImage(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error('Not an image');
  const buffer = await readBufferWithLimit(res);
  return { buffer, contentType: contentType.split(';')[0].trim() };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let target;
  try {
    target = new URL(req.body?.url);
  } catch {
    res.status(400).json({ error: 'Enter a valid URL.' });
    return;
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    res.status(400).json({ error: 'Only http/https URLs are supported.' });
    return;
  }

  try {
    await assertPublicHost(target.hostname);

    let image = null;

    // If the pasted URL is already a direct image, use it as-is.
    try {
      image = await fetchImage(target.href);
    } catch {
      image = null;
    }

    // Otherwise treat it as a webpage: fetch the HTML and look for a
    // favicon/apple-touch-icon/og:image link, falling back to /favicon.ico.
    if (!image) {
      const pageRes = await fetchWithTimeout(target.href);
      if (!pageRes.ok) throw new Error(`Could not load that page (${pageRes.status})`);
      const html = await pageRes.text();
      const iconUrl = extractIconUrl(html, target.href) || new URL('/favicon.ico', target.origin).href;
      try {
        await assertPublicHost(new URL(iconUrl).hostname);
        image = await fetchImage(iconUrl);
      } catch {
        image = null;
      }
    }

    // Last resort: a public favicon service, so pasting almost any
    // ordinary website URL still "just works".
    if (!image) {
      const fallbackUrl = `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(target.hostname)}`;
      image = await fetchImage(fallbackUrl);
    }

    const dataUrl = `data:${image.contentType};base64,${image.buffer.toString('base64')}`;
    res.status(200).json({ dataUrl });
  } catch (err) {
    console.error('fetch-logo failed', err);
    res.status(502).json({ error: err.message || 'Could not fetch an image from that URL.' });
  }
};

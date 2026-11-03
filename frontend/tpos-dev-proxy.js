// Resolve the browser-facing origin for Vite's private /api/v2 development proxy.
// Forwarded headers can only identify an HTTPS Dev Tunnel when they arrive from
// loopback and independently agree with the browser's Origin on write requests.
// This file is executed by Node/Vite only. It is never imported into the browser.

const LOOPBACK = new Set(['127.0.0.1', '::1']);

function isLoopback(value) {
  const address = String(value ?? '').replace(/^::ffff:/, '');
  return LOOPBACK.has(address);
}

function parseHost(raw) {
  if (typeof raw !== 'string' || !raw || /[\s,\\/?#@%]/.test(raw)) return null;
  try {
    const url = new URL(`http://${raw}`);
    if (url.host.toLowerCase() !== raw.toLowerCase() || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.hostname.endsWith('.')) return null;
    return { host: url.host, hostname: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

function parseOrigin(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== raw) return null;
    return url;
  } catch {
    return null;
  }
}

function isLocalTarget(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || LOOPBACK.has(hostname);
}

function isMicrosoftDevTunnel(hostname) {
  // Match regional subdomains too, e.g. id-5174.asse.devtunnels.ms.
  // A suffix check is insufficient without a trusted local forwarder and exact
  // matching Origin; those checks are enforced by getPublicProxyContext below.
  return hostname.endsWith('.devtunnels.ms') && hostname !== '.devtunnels.ms';
}

export function getPublicProxyContext(request, explicitHosts = []) {
  const rawHeaders = request.headers ?? {};
  const direct = parseHost(rawHeaders.host);
  const fallback = { host: direct?.host ?? null, proto: request.socket?.encrypted ? 'https' : 'http' };
  if (!direct) return fallback;

  const peerIsLoopback = isLoopback(request.socket?.remoteAddress);
  const declaredOrigin = parseOrigin(rawHeaders.origin);
  const forwardedRaw = rawHeaders['x-forwarded-host'];
  const forwarded = parseHost(forwardedRaw);
  const forwardedProto = rawHeaders['x-forwarded-proto'];
  const validForwardedProto = forwardedProto === 'http' || forwardedProto === 'https';
  const hostAllowlist = new Set(explicitHosts.map(host => String(host).trim().toLowerCase()).filter(Boolean));

  if (peerIsLoopback && forwarded && validForwardedProto) {
    const forwardedOrigin = new URL(`${forwardedProto}://${forwarded.host}`).origin;
    const trustedTunnel = isMicrosoftDevTunnel(forwarded.hostname) && forwardedProto === 'https';
    const explicitlyAllowed = hostAllowlist.has(forwarded.hostname) || hostAllowlist.has(forwarded.host);
    if ((trustedTunnel || explicitlyAllowed) &&
        (!rawHeaders.origin || declaredOrigin?.origin === forwardedOrigin)) {
      return { host: forwarded.host, proto: forwardedProto };
    }
  }

  // Some forwarding configurations rewrite Host to localhost and do not send
  // X-Forwarded-Host. In this case an exact user-configured hostname is required;
  // never trust a dynamic external hostname merely because Origin claims it.
  if (peerIsLoopback && forwardedRaw === undefined && isLocalTarget(direct.hostname) &&
      declaredOrigin && (hostAllowlist.has(declaredOrigin.hostname) || hostAllowlist.has(declaredOrigin.host)) &&
      ['http:', 'https:'].includes(declaredOrigin.protocol)) {
    return { host: declaredOrigin.host, proto: declaredOrigin.protocol.slice(0, -1) };
  }

  // A direct LAN request or normal localhost browser uses Host as-is. Only
  // derive HTTPS from forwarded headers if they came from the local relay and
  // agree with that Host; untrusted LAN clients cannot spoof the public scheme.
  if (peerIsLoopback && validForwardedProto &&
      (!forwardedRaw || forwarded?.host === direct.host) &&
      (!rawHeaders.origin || declaredOrigin?.origin === new URL(`${forwardedProto}://${direct.host}`).origin)) {
    return { host: direct.host, proto: forwardedProto };
  }
  return fallback;
}

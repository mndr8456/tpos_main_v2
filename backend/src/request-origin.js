// Authenticate the browser's same-origin write context without trusting arbitrary
// X-Forwarded-* headers from the public network.
const LOOPBACK = new Set(['127.0.0.1', '::1']);

function normalizeAddress(value) {
  const address = String(value || '').trim();
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function isTrustedProxyAddress(address, additional = process.env.TPOS_TRUSTED_PROXY_IPS || '') {
  const addressValue = normalizeAddress(address);
  if (LOOPBACK.has(addressValue)) return true;
  return String(additional).split(',').some(value => value.trim() !== '' && normalizeAddress(value) === addressValue);
}

function singleHeader(value) {
  return typeof value === 'string' && value !== '' && !/[\r\n,\s]/.test(value) ? value : null;
}

export function isAllowedRequestOrigin(request, trustedProxyIps = process.env.TPOS_TRUSTED_PROXY_IPS || '') {
  const suppliedOrigin = request.headers?.origin;
  // Same-origin programmatic clients and browser GET/HEAD normally omit Origin.
  if (suppliedOrigin === undefined) return true;
  if (typeof suppliedOrigin !== 'string') return false;

  let origin;
  try {
    origin = new URL(suppliedOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== suppliedOrigin) return false;
  } catch {
    return false;
  }

  const trusted = isTrustedProxyAddress(request.socket?.remoteAddress, trustedProxyIps);
  const forwardedHost = request.headers['x-forwarded-host'];
  const forwardedProto = request.headers['x-forwarded-proto'];
  // A malformed forwarding chain is never accepted even from a trusted hop.
  if (trusted && forwardedHost !== undefined && !singleHeader(forwardedHost)) return false;
  if (trusted && forwardedProto !== undefined && !['http', 'https'].includes(forwardedProto)) return false;

  const targetHost = trusted && forwardedHost ? forwardedHost : request.headers.host;
  const targetProto = trusted && forwardedProto ? forwardedProto : request.socket?.encrypted ? 'https' : 'http';
  if (!singleHeader(targetHost)) return false;
  try {
    const target = new URL(`${targetProto}://${targetHost}`);
    return target.origin === origin.origin && !target.username && !target.password;
  } catch {
    return false;
  }
}

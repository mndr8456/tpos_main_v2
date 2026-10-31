// Public business registration needs abuse controls even without a manual administrator key.
// This is a per-process safeguard; production deployments should add an edge rate limit,
// verified email ownership and anti-automation controls before opening registration publicly.
export function createRegistrationRateLimit({now = () => Date.now(), maxAttempts = 10, windowMs = 60 * 60 * 1000, maxClients = 10000} = {}) {
 const clients = new Map();
 return function registrationRateLimit(request, response, next) {
  // Do not trust user-provided X-Forwarded-For in this standalone deployment.
  const client = String(request.socket?.remoteAddress || request.ip || 'unknown');
  const current = now();
  const previous = clients.get(client) || [];
  const attempts = previous.filter(time => current - time >= 0 && current - time < windowMs);
  if (attempts.length >= maxAttempts) {
   const retrySeconds = Math.max(1, Math.ceil((windowMs - (current - attempts[0])) / 1000));
   response.set('Retry-After', String(retrySeconds));
   return response.status(429).json({error: 'REGISTRATION_RATE_LIMIT', message: 'Too many registration attempts. Please try again later.'});
  }
  // Keep the map bounded even if requests arrive from many different addresses.
  if (!clients.has(client) && clients.size >= maxClients) clients.delete(clients.keys().next().value);
  attempts.push(current);
  clients.delete(client);
  clients.set(client, attempts);
  return next();
 };
}

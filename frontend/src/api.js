// The browser always talks to its own origin. Vite dev/preview and the
// production reverse proxy forward /api/v2 to the private backend.
export const apiOrigin = '';
export const apiUrl = path => `/api/v2${path.startsWith('/') ? path : `/${path}`}`;

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      cache:(options.method||'GET').toUpperCase()==='GET'?'no-store':'default',
      credentials:'include',
      headers: {
        ...(options.body ? {'Content-Type': 'application/json'} : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error('Cannot reach TPOS API. Check that the backend and /api/v2 proxy are running.');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`TPOS API unavailable (HTTP ${response.status}). Check the backend and /api/v2 proxy.`);
  }
  const payload = await response.json().catch(() => ({error: 'INVALID_SERVER_RESPONSE'}));
  if (!response.ok) {
    const detail = payload.issues?.map(item => `${item.field}: ${item.message}`).join('; ');
    throw new Error(detail || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

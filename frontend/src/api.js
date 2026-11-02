const base = import.meta.env.DEV 
  ? 'http://127.0.0.1:5100' 
  : (import.meta.env.VITE_BACKEND_URL || 'https://tpos-main-v2.onrender.com');

export async function request(path, options = {}) {
  const response = await fetch(`${base}/api/v2${path}`, {
    method: options.method || 'GET',
    cache: (options.method || 'GET').toUpperCase() === 'GET' ? 'no-store' : 'default',
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  
  const payload = await response.json().catch(() => ({ error: 'INVALID_SERVER_RESPONSE' }));
  if (!response.ok) {
    const detail = payload.issues?.map(x => `${x.field}: ${x.message}`).join('; ');
    throw new Error(detail || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}
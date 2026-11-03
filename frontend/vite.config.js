import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.TPOS_BACKEND_TARGET || 'http://127.0.0.1:5100';
const allowedHosts = (process.env.TPOS_DEV_ALLOWED_HOSTS || '')
  .split(',').map(host => host.trim()).filter(Boolean);

// The browser sees the frontend host. Forward that host and protocol to the
// loopback backend so its same-origin write guard works over LAN and HTTPS tunnels.
function publicHost(request) {
  const directHost = request.headers.host;
  // Some tunnel providers connect to localhost but preserve the public host in
  // X-Forwarded-Host. Trust it only from loopback and when explicitly allowed.
  const forwardedHost = request.headers['x-forwarded-host'];
  const peer = String(request.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  if (!['127.0.0.1', '::1'].includes(peer) || typeof forwardedHost !== 'string' ||
      /[,\s\r\n/]/.test(forwardedHost)) return directHost;
  try {
    const hostname = new URL(`http://${forwardedHost}`).hostname;
    if (allowedHosts.includes(hostname)) return forwardedHost;
  } catch { /* Malformed forwarded host is never trusted. */ }
  return directHost;
}

function publicProtocol(request, publicHostName) {
  const forwarded = request.headers['x-forwarded-proto'];
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  if (request.socket?.encrypted) return 'https';
  try {
    const origin = new URL(request.headers.origin);
    if (origin.host === publicHostName && ['http:', 'https:'].includes(origin.protocol)) {
      return origin.protocol.slice(0, -1);
    }
  } catch { /* GET requests do not usually include Origin */ }
  return 'http';
}

function apiProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    // Never rewrite cookies or bypass access controls in Vite.
    configure(proxy) {
      proxy.on('proxyReq', (proxyRequest, request) => {
        const host = publicHost(request);
        if (host) proxyRequest.setHeader('X-Forwarded-Host', host);
        proxyRequest.setHeader('X-Forwarded-Proto', publicProtocol(request, host));
      });
    }
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    // npm run dev stays loopback-only; npm run dev:lan enables LAN explicitly.
    allowedHosts,
    proxy: {'/api/v2': apiProxy()}
  },
  preview: {
    allowedHosts,
    proxy: {'/api/v2': apiProxy()}
  }
});

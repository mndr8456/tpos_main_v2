import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getPublicProxyContext } from './tpos-dev-proxy.js';
import { getClockGatewayHeaders } from './tpos-clock-gateway.js';

const backendTarget = process.env.TPOS_BACKEND_TARGET || 'http://127.0.0.1:5100';
const allowedHosts = (process.env.TPOS_DEV_ALLOWED_HOSTS || '')
  .split(',').map(host => host.trim()).filter(Boolean);

// Dev Tunnels often rewrite Host to localhost but provide the actual HTTPS
// hostname in X-Forwarded-Host. The helper validates the local relay, domain,
// protocol and browser Origin before forwarding that public address to Node.
// Production must use a separately configured trusted HTTPS reverse proxy.
function apiProxy() {
  return {
    target: backendTarget,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyRequest, request) => {
        const context = getPublicProxyContext(request, allowedHosts);
        const { host, proto } = context;
        // Overwrite any caller-supplied clock-IP headers using the socket observed by Vite.
        proxyRequest.removeHeader('X-TPOS-Clock-Client-IP');
        proxyRequest.removeHeader('X-TPOS-Clock-Channel');
        const observed = getClockGatewayHeaders(request, context);
        if (observed) {
          proxyRequest.setHeader('X-TPOS-Clock-Client-IP', observed.ip);
          proxyRequest.setHeader('X-TPOS-Clock-Channel', observed.channel);
        }
        if (host) proxyRequest.setHeader('X-Forwarded-Host', host);
        proxyRequest.setHeader('X-Forwarded-Proto', proto);
      });
    }
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    // npm run dev stays loopback-only; npm run dev:lan enables LAN explicitly.
    // Keep the Vite Host allowlist exact; do not allow arbitrary Host values.
    allowedHosts,
    proxy: {'/api/v2': apiProxy()}
  },
  preview: {
    allowedHosts,
    proxy: {'/api/v2': apiProxy()}
  }
});

# TPOS Main V2 — Network and Deployment Guide (R2)

## What changed

All browser API calls use the **current frontend origin** (`/api/v2`). Vite proxies API calls to the private Node backend during local/LAN/tunnel development. In production, your HTTPS reverse proxy must forward the same prefix to Node. A developer's existing `frontend/.env` `VITE_BACKEND_URL` is **intentionally ignored**, so an old loopback URL cannot be embedded into the browser build. No existing `.env` files are changed by this patch.

Node session cookies remain HttpOnly and SameSite=Strict, with Secure enabled when NODE_ENV=production. Write requests validate the browser Origin against the public request origin forwarded **only by trusted network hops**. No wildcard CORS is used.

## Prerequisites

1. Start backend `npm run dev` in `backend/`; keep `BACKEND_HOST=127.0.0.1` and `BACKEND_PORT=5100` in your **local** existing `.env`.
2. Verify directly on the host PC: `http://127.0.0.1:5100/api/v2/health` should be JSON with `status: "OK"`.
3. Start frontend separately. Verify `http://127.0.0.1:5174/api/v2/health` also returns JSON, through the Vite proxy.
4. Use the browser's developer tools Network tab: login should POST to **the same host** under `/api/v2/auth/login`, not `127.0.0.1:5100` from a remote device.

## A. Local-only developer mode

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run dev
```

Second terminal:

```cmd
cd /d D:\www\tpos_main_v2\frontend
npm run dev
```

Open `http://127.0.0.1:5174` on that PC. No active `.env` change required.

## B. Private LAN development (example 192.168.0.156)

Keep backend in its first terminal. In a second terminal use:

```cmd
cd /d D:\www\tpos_main_v2\frontend
npm run dev:lan
```

Open `http://192.168.0.156:5174` on the **other device**. Configure Windows Defender Firewall to allow **TCP 5174 only** on a trusted Private network as needed; leave TCP 5100 and MySQL TCP 3306 blocked from the LAN. If the PC's DHCP IP changes, use its current LAN address. A browser label "Not secure" on HTTP is expected; avoid entering real customer/payment data over unencrypted LAN.

From the remote device open `http://192.168.0.156:5174/api/v2/health`. If the page loads but health fails, check the backend host PC process or Vite proxy first. Sign in again on each host: cookies are host-scoped, not shared between 127.0.0.1 and 192.168.0.156.

## C. Microsoft Dev Tunnels / VS Code Port Forwarding (R2)

**Current R2 behavior:** when Microsoft Dev Tunnels connects to Vite over loopback,
replaces `Host` with `localhost:5174`, and supplies its HTTPS public hostname in
`X-Forwarded-Host` / `X-Forwarded-Proto`, the Vite `/api/v2` proxy recognizes the
public origin. On browser writes it also requires **exact** agreement with the
browser's `Origin`. Rotating tunnel IDs are supported only with that trusted
forwarded-header pair. This is **not** a wildcard Vite Host allowlist.

1. Start the backend with `npm run dev` on the host PC; keep port **5100** private.
2. Start the frontend with `npm run dev:tunnel` from `frontend/`.
3. In VS Code **Ports**, forward TCP **5174** only; preferably keep tunnel
   visibility **Private / authenticated** and sign in with Microsoft when prompted.
4. Open the provided `https://<id>-5174.<region>.devtunnels.ms` address.
5. Verify `<tunnel URL>/api/v2/health` returns JSON. Then attempt **Sign In**.
   The browser login request must use the same HTTPS tunnel hostname and the path
   `/api/v2/auth/login`.

No active `.env` change is necessary when the tunnel provider supplies trustworthy
`X-Forwarded-Host` and `X-Forwarded-Proto` through the local relay.

**Fallback when the provider omits forwarded host headers:** The origin cannot be
verified automatically and `INVALID_ORIGIN` is intentional. Explicitly pin the
assigned hostname for this Vite process **in Windows CMD** (not `.env`):

```cmd
cd /d D:\www\tpos_main_v2\frontend
set "TPOS_DEV_ALLOWED_HOSTS=your-exact-hostname.asse.devtunnels.ms"
npm run dev:tunnel
```

Replace the example with the precise current hostname printed by your tunnel;
restart Vite after changing it. This explicit allowlist also supports relays
that replace `Host` with localhost without providing `X-Forwarded-Host`, as long
as they preserve the browser's exact HTTPS `Origin`. For providers preserving the
public `Host`, the same exact setting makes Vite willing to serve that hostname.
Do not set `allowedHosts: true`, and do not add `.devtunnels.ms` as a Vite
allowlist entry: unrelated tunnel subdomains are not under your control.

**Safe diagnosis:** If the login page loads but `Sign In` returns
`INVALID_ORIGIN`, look at the browser Network tab for
`POST /api/v2/auth/login` (status 403). The Dev Tunnels host/protocol probably
disagrees with the reverse-proxy header. If `/api/v2/health` is unavailable,
check frontend/backend processes and the forwarded port first. The tunnel service
may rewrite host and Origin headers depending on its version and mode. Keep the
backend bound to loopback and expose neither TCP 5100 nor MySQL TCP 3306.

Dev Tunnels is for temporary development and does not replace HTTPS production
hosting, domain verification, firewall, authentication, TLS configuration or
regular security reviews. Never expose an unrestricted Vite source server to
untrusted public users.

## D. Real online hosting / production (future, separate from current developer .env)

- Use a public HTTPS domain and valid certificate with a real reverse proxy (for example nginx; see `docs/nginx-tpos-v2.example.conf`). Serve the built frontend `dist` directory as static files; never publish Vite dev/preview or the git repository.
- Forward `/api/v2/` to backend `127.0.0.1:5100` **without stripping the path**. Forward `X-Forwarded-Host` and `X-Forwarded-Proto` from your trusted reverse proxy. With a remote reverse proxy, explicitly configure its private IP in `TPOS_TRUSTED_PROXY_IPS` and block direct public access to backend.
- In a **separate production environment**, configure `NODE_ENV=production` to enable `Secure` session cookies. Keep `.env` secret and out of git; protect MySQL, encryption keys, backups, and tenant records. Keep `BACKEND_HOST` bound to loopback when reverse proxy is on the same host.
- Restrict public registration / tenant provisioning in production as part of operational go-live approval; audit database least-privilege credentials, TLS verification and provider-specific payments separately. This network patch is **not a certification that TPOS is ready for public Internet payment processing**.
- Verify the production browser's Network tab requests only `https://your-domain/api/v2/...`, never a local IP or mixed-content HTTP. Test login, logout, refresh, protected POST, receipt, image/PDF downloads, held order, and remote sessions before go-live.

## E. GitHub and source hygiene

The supplied source ZIP contained `.git/` objects; **this patch ZIP deliberately excludes `.git`, `.env`, node_modules and dist**. Apply to your working tree, inspect `git diff`, run tests, and commit via your normal GitHub workflow. `.gitignore` includes `.env`, but verify no secrets were committed previously; `.gitignore` does not remove historically tracked secrets. Never commit real tunnel tokens, production keys, or database passwords.

## Troubleshooting map

| Symptom | First check |
| --- | --- |
| `Failed to fetch` from LAN browser | Network request is not `http://LAN-IP:5174/api/v2`; check same-origin build and firewall |
| HTTP 502 / non-JSON response | Node backend on port 5100, Vite proxy or reverse proxy target |
| HTTP 403 `INVALID_ORIGIN` | Upstream forwarding Host/Proto or untrusted proxy; do not bypass CSRF |
| HTTP 401 `UNAUTHENTICATED` | Host-scoped cookie / session / Secure over HTTPS / expired login |
| Vite `Blocked request. This host is not allowed` | Add the **exact** tunnel hostname using `TPOS_DEV_ALLOWED_HOSTS` |
| App opens but images/exports fail | Confirm all `/api/v2` endpoints traverse the same origin and proxy |
| Browser says `Not secure` | LAN HTTP has no TLS; move to HTTPS with certificates before production |

## Validation commands

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

No SQL migrations are introduced by this change. Do not rerun 023/024. No existing TPOS business workflows, price calculations, checkout logic, or tenant schemas are changed.

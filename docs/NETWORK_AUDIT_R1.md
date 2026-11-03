# TPOS Main V2 — Network Audit R1

Source: `tpos_main_v2 - LATEST_03112026_1226.zip` (provided Nov 3, 2026).
Reference: `tpos_main_v2-v1-reference-backup.zip` (read-only V1 baseline).

## Findings from source

| Severity | Source finding | Impact | Remediation in R1 |
| --- | --- | --- | --- |
| Critical | `frontend/src/api.js` used `VITE_BACKEND_URL` or hardcoded `http://127.0.0.1:5100` | Browser from a different device calls its own loopback, causing `Failed to fetch` | Use same-origin `/api/v2` for all request calls |
| High | Eight frontend components bypassed `api.js` for images, templates or exports | Login might work while images/exports silently fail over LAN/tunnel | Use shared `apiOrigin` in all direct frontend network paths |
| High | Vite had no API proxy | Same-origin browser API could not reach Node during development | Proxy `/api/v2` to private backend for dev and preview |
| High | Express permitted only one `FRONTEND_ORIGIN` | LAN/tunnel/public domain origins would be rejected for writes | Validate same-origin against trusted proxy's forwarded public host and protocol |
| Medium | Vite npm dev command only bound to 127.0.0.1 | Second device cannot reach frontend | Add opt-in `dev:lan`; keep default dev local-only |
| High | Public dev host allowlist and deployment routing undocumented | DNS rebinding risk if arbitrary hosts allowed | Explicit `TPOS_DEV_ALLOWED_HOSTS` and HTTPS nginx example |
| Medium | Network error message was generic browser fetch failure | Hard to tell API/proxy outage from credentials | Explain backend/proxy unavailable when fetch fails or returns HTML |

V1 frontend reference used a direct `http://localhost:5000/api` URL with token authentication. That **is not adopted for V2**: V2 uses per-tenant HttpOnly cookies, SameSite=Strict and same-origin APIs. V1 is used for context only.

## Preserved behaviors

- Existing active `.env` developer settings are not included or overwritten.
- Node backend port 5100 and frontend dev port 5174 stay unchanged.
- No tenant SQL/migrations, tenant provisioning or business transactions altered.
- Existing POS / Stock / Cash Shift / receipts and user roles remain untouched.
- Git remote configuration and `.git/` contents are neither included nor modified.

## Production follow-up risk register (not claimed complete by this patch)

1. Real deployment needs verified TLS, DNS, trusted proxy headers, firewall rules and production-only secrets. The browser's `Not secure` label on HTTP LAN is expected; only HTTPS with a valid certificate addresses it.
2. The current source's database config uses `ssl.rejectUnauthorized: false`. This must be audited separately before using remote MySQL/TLS in production; do not interpret this network routing patch as database transport hardening.
3. Publishing a repository on GitHub is not the same as hosting the Node backend and MySQL; deploy those to a supported runtime/private database. GitHub Pages alone cannot provide this API route.
4. Do not put Vite's development server or the original source ZIP (which includes `.git/`) on the public Internet. Use an authenticated tunnel temporarily or a properly configured static server and HTTPS reverse proxy.
5. Test login/session and permitted/denied writes, image/CSV/PDF downloads, inventory and POS payment on an isolated staging environment before treating a domain as production ready.

## Evidence boundary

- Backend regression with added network tests: 387/387 PASS in the audit workspace.
- `npm run check` PASS (syntax only).
- Frontend production Vite build: NOT RUN in the audit workspace because Vite dependencies are not present (`vite: not found`). Must be run on the user's installed PC.
- Live tests with their Windows firewall, LAN machine, Dev Tunnel and future online hosting: NOT performed in this workspace.

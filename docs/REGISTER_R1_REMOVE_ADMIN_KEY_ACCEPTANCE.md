# TPOS Main V2 — Registration R1 correction

## Changed files

- `frontend/src/App.jsx` — remove unrequested Administrator Registration Key field and header.
- `backend/src/tenants.js` — remove secret-key requirement; preserve business validation and tenant provisioning.
- `backend/src/app.js` — add registration-only rate limiting middleware.
- `backend/src/registration-rate-limit.js` — in-memory per-client limit of 10 registration attempts per hour.
- `backend/src/config.js` — remove unused registration key setting.
- `backend/tests/registration-no-key-r1.test.js` — contract and rate limit tests.

## Installation

Extract to the project root, **replace only matching files**, and restart backend.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Open `http://127.0.0.1:5174/register` and confirm there is no Administrator Registration Key.
Test one NEW business with a unique email and real business details. Verify tenant activation and Owner login.
Do not re-run migrations 001–014. No database migration and no change to `.env` is needed. Existing `REGISTRATION_ACCESS_KEY` environment entries, if any, are simply ignored after this change.

## Important security note

Open self-service registration creates databases on a privileged backend. The in-process throttling included here is a local safeguard, not production-grade fraud prevention. Before public internet deployment, add durable infrastructure rate limiting, email verification, CAPTCHA/anti-bot protection and tenant provisioning quotas.

Do not mark registration end-to-end PASS until a real PC registration and login succeeds.

# TPOS Main V2 — HR Attendance Clock R1: Office IP and Remote Duty

## Scope and approved dependencies

Based on the accepted V1 Attendance Clock page and the existing tenant Attendances R1.3 (schema 026) and Staff Profile R1.5 (schema 025). These accepted modules, data and approvals are not migrated or overwritten. This module adds tenant schema 027, backend endpoints, UI and a development-only client-IP gateway adapter.

## Access: default deny until office network is configured

Clock In and Clock Out are permitted only when the authenticated active staff profile has an eligible scheduled Attendance session and the request meets one of these two conditions:

1. **Office / Shop:** the client IP observed by the local Vite gateway matches an active tenant office IP/CIDR for a branch assigned to that staff login. Owner, Admin or HR must register the office IP/CIDR explicitly in Attendance Clock → Office IP & Remote Duty Settings. Examples: `192.168.0.0/24` for the actual office Wi-Fi subnet or `127.0.0.1/32` for development *on the host PC*. Any external public IP or other private address must be explicitly configured if appropriate. Avoid broad network ranges. No office network is provisioned automatically.
2. **Remote Duty / Open IP:** Owner, Admin or HR explicitly approves a named staff member for a specific start/end interval (Asia/Kuala_Lumpur) with a reason. This permits that staff member to punch outside the allowed office CIDRs while the approval is active. Maximum grant interval: 30 days. The permission is tenant-scoped, audited and revocable; an expired or revoked grant is ignored. This is NOT a wildcard role permission, a global IP bypass or an unbounded time window.

Dev Tunnels and public hostnames are always classified as remote, even when the local tunnel relay connects to Vite from `127.0.0.1`. This prevents a remote tunnel visitor from being treated as physically in the office merely because the Node backend sees a loopback socket. Staff at the office should access the *LAN address* to use the office rule, not the public tunnel address. Tunnel traffic requires an active Remote Duty approval.

### Trusted client IP forwarding

In development, Vite obtains the remote peer address from its HTTP socket, overwrites incoming `X-TPOS-Clock-Client-IP` and `X-TPOS-Clock-Channel`, and forwards these to the backend over the existing private loopback `/api/v2` proxy. The backend accepts these values **only from a loopback peer in development**, with a valid IP and allowed channel. It never treats arbitrary caller-supplied `X-Forwarded-For` as office proof. In `NODE_ENV=production`, client-IP forwarding is denied by default. When production hosting is eventually approved, configure a trusted reverse proxy that replaces both headers from a verified connection; only then configure `TPOS_CLOCK_TRUSTED_GATEWAY=loopback` on the private backend and test the complete proxy chain. Never directly expose the backend to the public network. The current developer `.env` does NOT need changing.

**Limits:** IP/CIDR is a network access control, not GPS proof of a person's location. VPN access into the office network, remote desktop to an office PC, mobile carrier NAT, and routing changes can affect the observed address. Dev Tunnels generally only reveal the relay IP to the local application; its audit records the relay channel and the authorized grant, NOT an asserted physical user location. Stronger attendance geofencing requires an independently approved second factor/device policy.

## Punch workflow

- Only the logged-in user can punch their own active Staff Profile. The API never accepts another staff ID, a manually supplied clock timestamp or an attendance ID from the browser.
- Existing scheduled sessions in `hr_attendances` must exist. Without a schedule there is no Clock In. Rest Day, Public Holiday, Absent or Leave-linked sessions cannot be punched. Attendance source becomes `Web` at the first self-service punch.
- Clock In and Clock Out read the server's authoritative Malaysian time from MySQL `UTC_TIMESTAMP(6) + INTERVAL 8 HOUR`. Sessions, staff identity, permissions and network policy are rechecked inside a database transaction.
- Each punch locks the staff and Attendance session using `FOR UPDATE`. An immutable record in `hr_clock_events` is inserted in the same transaction. The unique `(attendance_id,event_type)` key prevents a duplicate. Clock Out requires Clock In and a sensible break duration.
- After Clock Out, attendance remains `Pending` until Owner/Admin/HR approves using the already accepted Attendances R1.3 workflow. Final Approved/Rejected decisions stay protected by that module.
- If the user has an overnight open session, Clock Out still targets the actual open session. A second session can start when a valid scheduled session exists.

## Schema and permissions

New tenant tables: `hr_clock_office_networks`, `hr_clock_remote_grants`, `hr_clock_events`, `hr_clock_policy_audit`.

Permission codes: `attendance_clock.view`, `attendance_clock.punch` (personal use for active staff roles), and `attendance_clock.manage` (Owner/Admin/HR only). Manager has no manual editing or approval rights. The existing Attendances, Staff Profile, POS and Network R2 business logic is unchanged.

## Installation / PC verification

Backup the source and tenant databases. Extract the *Changed Files Only* ZIP into `D:\www\` preserving `tpos_main_v2/...` paths. Do not overwrite `.env`, `.git` or tenant database content.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:attendance-clock
npm run db:attendance-clock -- --apply
npm run db:attendance-clock
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
npm run dev:lan
```

Do **not** run `--apply` unless the initial inspection reports `MISSING` and backups have been made. The final inspection should be `CURRENT` with `failed:0`. Restart the backend and Vite processes to pick up the updated gateway and permission grants. For Dev Tunnels use the already accepted `npm run dev:tunnel` workflow.

Suggested live tests:

1. Owner/Admin/HR configures the actual office Wi-Fi subnet (e.g. `192.168.0.0/24`) for Main Branch.
2. HR creates an active, Pending scheduled session in Attendances for a staff member.
3. With the same staff account on office Wi-Fi/LAN, verify Clock In enabled. Clock In, then Clock Out; server times and Attendance R1.3 records must match. Attempt duplicate punches (must be rejected).
4. Access the *public HTTPS Dev Tunnel* without remote approval: both buttons disabled. It must not treat relay `127.0.0.1` as an office IP.
5. Owner/Admin/HR grants that staff a bounded Remote Duty with reason. Tunnel Clock In/Out becomes available; a different staff member stays blocked. After revocation or expiry, both actions are blocked again.
6. Manager and other staff can read their own history, but cannot create/revoke office networks or remote grants, nor manually edit other staff's Clock In/Out.
7. Verify no changes to Staff Profiles R1.5, Attendances R1.3 approvals, POS, Inventory, Cash Shifts or Network Access R2.

## Status

Development package only. Targeted code tests and JavaScript/JSX syntax checks are not proof of live MySQL/Vite operation. PC migration, full backend regression, frontend build and live LAN/tunnel clock punch must be verified by the user before status LULUS/LOCKED. Production deployment remains HOLD.

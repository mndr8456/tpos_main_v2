// Dashboard R1.1 role access for existing ACTIVE tenants.
// Default read-only; use --apply to grant dashboard.view to ACCOUNTANT and SUPERVISOR.
// Does not rerun 005 or alter Discounts, CASHIER, or existing Dashboard roles.
import { centralPool, tenantPool, executeSchema, closePools } from '../src/database.js';

const apply = process.argv.includes('--apply');
const requiredRoles = ['ACCOUNTANT', 'SUPERVISOR'];
let failures = 0;
let tenantsCount = 0;

async function inspect(pool) {
 const [rows] = await pool.execute(`SELECT r.code AS role_code, rp.permission_code
  FROM roles AS r
  LEFT JOIN role_permissions AS rp
    ON rp.role_id = r.id AND rp.permission_code = 'dashboard.view'
  WHERE r.code IN ('ACCOUNTANT', 'SUPERVISOR')`);
 return requiredRoles.every(role => rows.some(row => row.role_code === role && row.permission_code === 'dashboard.view'));
}

try {
 const [tenants] = await centralPool().execute("SELECT id, db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 tenantsCount = tenants.length;
 for (const tenant of tenants) {
  try {
   const pool = tenantPool(tenant.id);
   const current = await inspect(pool);
   if (apply && !current) await executeSchema(tenant.db_name, '011_tenant_dashboard_accountant_supervisor.sql');
   const verified = apply ? await inspect(pool) : current;
   if (!verified && apply) throw new Error('DASHBOARD_ROLE_GRANT_NOT_APPLIED');
   console.log(JSON.stringify({
    tenantId: String(tenant.id),
    status: verified ? (apply && !current ? 'APPLIED' : 'CURRENT') : 'MISSING',
    mode: apply ? 'apply' : 'read-only'
   }));
  } catch (error) {
   failures++;
   console.error(JSON.stringify({tenantId: String(tenant.id), status: 'FAILED', error: error.code || error.message}));
  }
 }
 console.log(JSON.stringify({module: 'dashboard-roles-r11', tenants: tenantsCount, failures, applied: apply}));
} catch (error) {
 failures++;
 console.error('DASHBOARD_ROLE_SETUP_FAILED', error.code || error.message);
} finally {
 await closePools();
}
if (failures) process.exitCode = 1;

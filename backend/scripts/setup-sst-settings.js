// SST tenant setup and older-schema compatibility repair.
// Read-only by default. --apply repairs ONLY missing SST registration columns
// and applies 018 only if its own tables/seed data are missing.
import {centralPool,tenantPool,executeSchema,closePools,tenantDatabase} from '../src/database.js';
import {ensureSstRegistrationColumns} from '../src/sst-registration-schema.js';

const apply = process.argv.includes('--apply');
let failures = 0;
let changedTenants = 0;
try {
  const [tenants] = await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
  for (const tenant of tenants) {
    try {
      if (String(tenant.db_name) !== tenantDatabase(tenant.id)) {
        throw Object.assign(new Error('SST_TENANT_DATABASE_MISMATCH'), {code:'SST_TENANT_DATABASE_MISMATCH'});
      }
      const pool = tenantPool(tenant.id);
      const [tables] = await pool.execute(`SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME IN ('company_registrations','products','sst_tax_settings','sst_settings_audit_logs')`);
      const names = new Set(tables.map(row => row.TABLE_NAME));
      if (!names.has('company_registrations') || !names.has('products')) {
        throw Object.assign(new Error('SST_BASE_SCHEMA_REQUIRED'), {code:'SST_BASE_SCHEMA_REQUIRED'});
      }
      const tablesMissing = ['sst_tax_settings','sst_settings_audit_logs'].filter(name => !names.has(name));
      let moduleApplied = false;
      if (apply && tablesMissing.length) {
        await executeSchema(tenant.db_name, '018_tenant_sst_settings.sql');
        moduleApplied = true;
      }
      const columns = await ensureSstRegistrationColumns(pool, {apply});
      const [settingsTables] = await pool.execute(`SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('sst_tax_settings','sst_settings_audit_logs')`);
      const settingsNames = new Set(settingsTables.map(row => row.TABLE_NAME));
      const remainingTables = ['sst_tax_settings','sst_settings_audit_logs'].filter(name => !settingsNames.has(name));
      let missingTaxTypes = [];
      if (!remainingTables.length) {
        const [settings] = await pool.execute("SELECT tax_type FROM sst_tax_settings WHERE tax_type IN ('SALES_TAX','SERVICE_TAX')");
        const types = new Set(settings.map(row => row.tax_type));
        missingTaxTypes = ['SALES_TAX','SERVICE_TAX'].filter(name => !types.has(name));
        if (apply && missingTaxTypes.length) {
          // Re-seed only the missing rows without changing existing tax settings.
          await pool.execute(`INSERT IGNORE INTO sst_tax_settings(tax_type,is_enabled,tax_rate)
            VALUES('SALES_TAX',0,0.000),('SERVICE_TAX',0,0.000)`);
          const [recheck] = await pool.execute("SELECT tax_type FROM sst_tax_settings WHERE tax_type IN ('SALES_TAX','SERVICE_TAX')");
          const rechecked = new Set(recheck.map(row => row.tax_type));
          missingTaxTypes = ['SALES_TAX','SERVICE_TAX'].filter(name => !rechecked.has(name));
          if (missingTaxTypes.length) throw Object.assign(new Error('SST_SETTINGS_SEED_INCOMPLETE'), {code:'SST_SETTINGS_SEED_INCOMPLETE'});
          moduleApplied = true;
        }
      }
      const changed = Boolean(moduleApplied || columns.changed);
      if (changed) changedTenants++;
      const missing = remainingTables.length || columns.missingColumns.length || missingTaxTypes.length;
      const status = missing ? 'MISSING' : changed ? 'APPLIED' : 'CURRENT';
      console.log(JSON.stringify({tenantId:String(tenant.id),status,mode:apply?'apply':'read-only',
        missingRegistrationColumns:columns.missingColumns,missingTables:remainingTables,missingTaxTypes}));
      if (apply && missing) failures++;
    } catch (error) {
      failures++;
      console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:error.code||error.message}));
    }
  }
  console.log(JSON.stringify({module:'sst-settings-schema-r12',tenants:tenants.length,failures,applied:apply,changedTenants}));
} catch (error) {
  failures++;
  console.error('SST_SETTINGS_SETUP_FAILED',error.code||error.message);
} finally {
  await closePools();
}
if (failures) process.exitCode = 1;

// Compatibility check for older V2 tenants whose company_registrations table
// predates the two separate SST registration fields in 002_tenant_foundation.sql.
// The original SSM and TIN fields, all existing registration values and the
// original migration files must remain untouched.

export const SST_REGISTRATION_COLUMNS = Object.freeze([
  'sst_sales_tax_number',
  'sst_service_tax_number'
]);

const columnMetadataSql = `SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_registrations'
 AND COLUMN_NAME IN ('sst_sales_tax_number','sst_service_tax_number')`;

function schemaError(code) {
  return Object.assign(new Error(code), {code});
}

export function classifySstRegistrationColumns(rows) {
  const columns = new Map(rows.map(row => [String(row.COLUMN_NAME).toLowerCase(), row]));
  const missingColumns = SST_REGISTRATION_COLUMNS.filter(name => !columns.has(name));
  const incompatibleColumns = SST_REGISTRATION_COLUMNS.filter(name => {
    const row = columns.get(name);
    if (!row) return false;
    return String(row.DATA_TYPE).toLowerCase() !== 'varchar'
      || Number(row.CHARACTER_MAXIMUM_LENGTH) < 80
      || String(row.IS_NULLABLE).toUpperCase() !== 'YES';
  });
  return {missingColumns, incompatibleColumns};
}

export async function ensureSstRegistrationColumns(pool, {apply = false} = {}) {
  const [beforeRows] = await pool.execute(columnMetadataSql);
  const before = classifySstRegistrationColumns(beforeRows);
  if (before.incompatibleColumns.length) throw schemaError('SST_REGISTRATION_COLUMNS_INCOMPATIBLE');

  if (apply && before.missingColumns.length) {
    // Use one atomic ALTER statement for all missing columns. The identifiers
    // come exclusively from the hard-coded allowlist above; never from input.
    const additions = before.missingColumns.map(name => `ADD COLUMN \`${name}\` VARCHAR(80) NULL`);
    try {
      await pool.query(`ALTER TABLE company_registrations ${additions.join(', ')}`);
    } catch (error) {
      // A parallel setup may have added the column first. Validate the final
      // schema below; never suppress any other DDL error or pretend success.
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  const [afterRows] = await pool.execute(columnMetadataSql);
  const after = classifySstRegistrationColumns(afterRows);
  if (after.incompatibleColumns.length) throw schemaError('SST_REGISTRATION_COLUMNS_INCOMPATIBLE');
  if (apply && after.missingColumns.length) throw schemaError('SST_REGISTRATION_COLUMNS_REPAIR_INCOMPLETE');

  return {
    missingColumns: after.missingColumns,
    changed: apply && before.missingColumns.length > 0 && after.missingColumns.length === 0
  };
}

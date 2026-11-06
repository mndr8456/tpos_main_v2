// Safe, resumable migration 035. Default mode is inspection ONLY.
// Fixes the original 035 installer that did not diagnose partially applied DDL.
import {readFile} from 'node:fs/promises';
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
import {FEATURE_035,TABLE_COLUMNS,assess035,extract035TableCreations,NEW_SALE_CHECK,expandedEnumType,EXPECTED_SALE_METHODS,EXPECTED_JOURNAL_SOURCES} from '../src/pos-multi-payment-migration.js';
const apply=process.argv.includes('--apply');
const requiredTables=Object.keys(TABLE_COLUMNS);
let failed=0;

async function inspect(pool){
 const [[{n:historyExists}]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='tpos_feature_setup_history'");
 if(!Number(historyExists))throw Error('ROLE_PERMISSION_034_REQUIRED');
 const [hist]=await pool.execute('SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN (?,?)',['role_permissions_r1_034',FEATURE_035]);
 const keys=new Set(hist.map(r=>String(r.feature_code)));
 const [tableRows]=await pool.execute("SELECT table_name AS tpos_table FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens')");
 const tables=tableRows.map(r=>String(r.tpos_table).toLowerCase());
 const [columns]=await pool.execute("SELECT table_name AS tpos_table,column_name AS tpos_column,column_type AS tpos_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens','pos_sales','accounting_journals')");
 const tableColumns={},columnTypes={};
 for(const row of columns){
  const t=String(row.tpos_table).toLowerCase(),c=String(row.tpos_column).toLowerCase();
  (tableColumns[t]??=[]).push(c);
  columnTypes[`${t}.${c}`]=row.tpos_type;
 }
 const [indexes]=await pool.execute("SELECT table_name AS tpos_table,index_name AS tpos_index FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens')");
 const tableIndexes={};
 for(const row of indexes){const t=String(row.tpos_table).toLowerCase();(tableIndexes[t]??=[]).push(String(row.tpos_index));}
 const [checkRows]=await pool.execute(`SELECT tc.CONSTRAINT_NAME AS name,cc.CHECK_CLAUSE AS clause FROM information_schema.TABLE_CONSTRAINTS tc
 JOIN information_schema.CHECK_CONSTRAINTS cc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
 WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='pos_sales' AND tc.CONSTRAINT_TYPE='CHECK'`);
 const [[{n:permissionCount}]]=await pool.execute("SELECT COUNT(*) AS n FROM permissions WHERE code='pos.checkout.manual'");
 const named=checkRows.find(row=>String(row.name).toLowerCase()==='chk_pos_sale_amounts');
 const otherPaymentChecks=checkRows.filter(row=>String(row.name).toLowerCase()!=='chk_pos_sale_amounts'&&/payment_method|cash_received|cash_change/i.test(String(row.clause)));
 const facts={has034:keys.has('role_permissions_r1_034'),hasMarker:keys.has(FEATURE_035),tables,columns:tableColumns,indexes:tableIndexes,saleColumnType:columnTypes['pos_sales.payment_method'],journalColumnType:columnTypes['accounting_journals.source_type'],cashCheckClause:named?.clause,otherPaymentChecks:otherPaymentChecks.map(x=>({name:x.name,clause:x.clause})),hasPermission:Number(permissionCount)===1};
 return assess035(facts);
}
async function verifySaleAmounts(pool){
 const [[{n}]]=await pool.execute(`SELECT COUNT(*) AS n FROM pos_sales WHERE NOT(total>=0 AND cost_of_goods>=0 AND ((payment_method='CASH' AND cash_received>=total AND cash_change=cash_received-total) OR (payment_method<>'CASH' AND cash_received=0 AND cash_change=0)))`);
 if(Number(n)>0)throw Error('POS_035_SALES_VIOLATE_REQUIRED_CHECK');
}
async function recover(pool,tenantId,before){
 if(!before.repairable)throw Error(`POS_035_MANUAL_REVIEW:${JSON.stringify(before)}`);
 // Check all existing sale amounts before changing ANY schema.
 await verifySaleAmounts(pool);
 const sql=await readFile(new URL('../../database/035_tenant_pos_multi_payment.sql',import.meta.url),'utf8');
 const createStatements=extract035TableCreations(sql);
 // All three CREATE TABLE operations are additive. Existing rows are never removed.
 for(const table of requiredTables){if(before.missingTables.includes(table))await pool.query(createStatements.get(table));}
 let state=await inspect(pool);
 if(!state.repairable)throw Error(`POS_035_MANUAL_REVIEW:${JSON.stringify(state)}`);
 if(state.saleEnum==='LEGACY'){
  const type=expandedEnumType(state.schema.saleColumnType,EXPECTED_SALE_METHODS,['CASH']);
  // Append only; never renumber or remove existing ENUM elements (numeric ENUM ordinals are persisted).
  await pool.query(`ALTER TABLE pos_sales MODIFY COLUMN payment_method ${type} NOT NULL`);
 }
 state=await inspect(pool);
 if(state.check==='LEGACY'||state.check==='MISSING'){
  await verifySaleAmounts(pool);
  const cmd=state.check==='LEGACY'?'DROP CHECK chk_pos_sale_amounts, ':'';
  await pool.query(`ALTER TABLE pos_sales ${cmd}ADD CONSTRAINT chk_pos_sale_amounts ${NEW_SALE_CHECK}`);
 }
 state=await inspect(pool);
 if(!state.repairable)throw Error(`POS_035_MANUAL_REVIEW:${JSON.stringify(state)}`);
 if(state.journalEnum==='LEGACY'){
  const type=expandedEnumType(state.schema.journalColumnType,EXPECTED_JOURNAL_SOURCES,['POS_CASH_SALE']);
  await pool.query(`ALTER TABLE accounting_journals MODIFY COLUMN source_type ${type} NOT NULL`);
 }
 // Do not reset operator-customized Role Permission grants when history 035 already exists.
 await pool.execute("INSERT IGNORE INTO permissions(code,description) VALUES('pos.checkout.manual','Confirm a non-cash sale only after merchant verification')");
 if(!before.markerRecorded){
  await pool.query("INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT role_id,'pos.checkout.manual' FROM role_permissions WHERE permission_code='pos.checkout.cash'");
 }
 await pool.execute('INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES(?)',[FEATURE_035]);
 const after=await inspect(pool);
 if(!after.current)throw Error(`POS_035_VERIFY_INCOMPLETE:${JSON.stringify(after)}`);
 return after;
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  const tenantId=String(tenant.id);
  try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('POS_035_TENANT_DB_IDENTITY_MISMATCH');
   quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId);
   const before=await inspect(pool);
   if(!apply){
    console.log(JSON.stringify({event:'pos_multi_payment_tenant',tenantId,status:before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW',applied:false,diagnostic:before}));
    if(!before.repairable)failed++;
    continue;
   }
   if(!before.current)await recover(pool,tenantId,before);
   console.log(JSON.stringify({event:'pos_multi_payment_tenant',tenantId,status:before.current?'CURRENT':before.markerRecorded?'RECOVERED':'APPLIED',applied:!before.current}));
  }catch(e){failed++;console.error(JSON.stringify({event:'pos_multi_payment_tenant',tenantId,status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'pos_multi_payment_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;

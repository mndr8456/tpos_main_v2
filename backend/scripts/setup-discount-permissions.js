// Discount R1.3 role grants: read-only by default; --apply updates only Discount permissions.
import { centralPool, tenantPool, executeSchema, closePools } from '../src/database.js';

const apply = process.argv.includes('--apply');
const managedRoles=['OWNER','ADMIN','MANAGER','ACCOUNTANT','SUPERVISOR'];
const elevated=['OWNER','ADMIN'];
const readOnly=['MANAGER','ACCOUNTANT','SUPERVISOR'];
const expectedCodes=['discounts.view','discounts.create','discounts.update','discounts.delete','discounts.import','discounts.export','discounts.audit','discounts.calculate'];
let failures=0;
let total=0;

async function inspect(pool){
 const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('discounts','discount_targets','discount_audit_logs')");
 if(tables.length!==3)return false;
 const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'discounts.%'");
 if(!expectedCodes.every(code=>perms.some(row=>row.code===code)))return false;
 const [grants]=await pool.execute(`SELECT r.code AS role_code, rp.permission_code
  FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id AND rp.permission_code LIKE 'discounts.%'
  WHERE r.code IN ('OWNER','ADMIN','MANAGER','ACCOUNTANT','SUPERVISOR')`);
 const roles=new Set(grants.map(x=>x.role_code));
 if(!managedRoles.every(x=>roles.has(x)))return false;
 for(const code of elevated){
  const actual=new Set(grants.filter(x=>x.role_code===code).map(x=>x.permission_code));
  if(!expectedCodes.every(x=>actual.has(x)))return false;
 }
 for(const code of readOnly){
  const actual=grants.filter(x=>x.role_code===code).map(x=>x.permission_code).filter(Boolean);
  if(actual.length!==1||actual[0]!=='discounts.view')return false;
 }
 return true;
}
try{
 const [tenants]=await centralPool().execute("SELECT id, db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 total=tenants.length;
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   const current=await inspect(pool);
   if(apply&&!current){
    // Refuse partial or absent Discount R1 schema; do not silently install/reinstall SQL 009.
    const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('discounts','discount_targets','discount_audit_logs')");
    if(tables.length!==3)throw new Error('DISCOUNT_R1_REQUIRED');
    await executeSchema(tenant.db_name,'010_tenant_discount_role_permissions.sql');
   }
   const verified=apply?await inspect(pool):current;
   if(!verified&&apply)throw new Error('DISCOUNT_ROLE_POLICY_NOT_APPLIED');
   console.log(JSON.stringify({tenantId:String(tenant.id),status:verified?(apply&&!current?'APPLIED':'CURRENT'):'MISSING',mode:apply?'apply':'read-only'}));
  }catch(err){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:err.code||err.message}));}
 }
 console.log(JSON.stringify({module:'discount-role-r13',tenants:total,failures,applied:apply}));
}catch(err){failures++;console.error('DISCOUNT_ROLE_SETUP_FAILED',err.code||err.message);}
finally{await closePools();}
if(failures)process.exitCode=1;

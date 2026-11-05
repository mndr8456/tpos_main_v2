// HR Leave Requests R1.5: read-only inspection of EL distinct Attendance status.
// --apply is explicit and operates only on ACTIVE V2 tenants; V1 is untouched.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const statusValues=[
 'Present','Late','Absent','Half Day','Annual Leave','Medical Leave',
 'Unpaid Leave','Rest Day','Public Holiday'
];
const leaveValues=['Annual Leave','Medical Leave','Unpaid Leave'];
const enumType=items=>`enum(${items.map(v=>`'${v}'`).join(',')})`.toLowerCase();
let failed=0;
async function inspect(pool){
 const [columns]=await pool.execute(`SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col,COLUMN_TYPE AS kind
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND (TABLE_NAME='hr_attendances' AND COLUMN_NAME='attendance_status'
 OR TABLE_NAME='hr_leave_types' AND COLUMN_NAME='attendance_status')`);
 const cols=new Map(columns.map(x=>[x.tbl,String(x.kind).toLowerCase()]));
 if(cols.size!==2)throw Error('LEAVE_REQUESTS_R15_SCHEMA_MISSING');
 const expected={hr_attendances:statusValues,hr_leave_types:leaveValues};
 const missing=[];
 for(const [table,items] of Object.entries(expected)){
  const existing=cols.get(table);
  const before=enumType(items),after=enumType([...items,'Emergency Leave']);
  if(existing!==before&&existing!==after)throw Error(`LEAVE_REQUESTS_R15_UNEXPECTED_ENUM_${table}`);
  if(existing===before)missing.push(`${table}.attendance_status`);
 }
 const [[el]]=await pool.execute("SELECT COUNT(*) AS n FROM hr_leave_types WHERE leave_code='EL' AND is_paid=0 AND attendance_status='Annual Leave'");
 return {missingColumns:missing,provisionalElMappings:Number(el.n)};
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   const before=await inspect(pool);
   const current=before.missingColumns.length===0&&before.provisionalElMappings===0;
   if(apply&&!current)await executeSchema(tenant.db_name,'032_tenant_hr_leave_emergency_attendance.sql');
   const after=apply?await inspect(pool):before;
   if(apply&&(after.missingColumns.length||after.provisionalElMappings))throw Error('LEAVE_REQUESTS_R15_MIGRATION_NOT_CURRENT');
   console.log(JSON.stringify({event:'leave_requests_attendance_policy_tenant',tenantId:String(tenant.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current,...(!current&&!apply?after:{})}));
  }catch(e){failed++;console.error(JSON.stringify({event:'leave_requests_attendance_policy_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'leave_requests_attendance_policy_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('LEAVE_REQUESTS_R15_SETUP_FAILED',e.code||e.message);}
finally{await closePools();}
if(failed)process.exitCode=1;

// Inventory R1.3: inspect first, --apply only after database backup and backend stopped.
// Never silently round physical quantities or historical cost/ledger amounts.
import {centralPool,tenantPool,closePools} from '../src/database.js';

const apply=process.argv.includes('--apply');
const definitions={
 inventory_branch_balances:['quantity_on_hand','carrying_value','average_cost'],
 inventory_movements:['quantity_delta','value_delta','quantity_after','carrying_value_after','average_cost_after']
};
const original={
 quantity_on_hand:[18,6],carrying_value:[24,8],average_cost:[18,8],
 quantity_delta:[18,6],value_delta:[24,8],quantity_after:[18,6],
 carrying_value_after:[24,8],average_cost_after:[18,8]
};
let failed=0;
const describeColumn=r=>`${r.data_type}(${r.numeric_precision},${r.numeric_scale})`;
async function inspect(pool){
 const allNames=Object.values(definitions).flat();
 const [columns]=await pool.execute(`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
    DATA_TYPE AS data_type, NUMERIC_PRECISION AS numeric_precision,
    NUMERIC_SCALE AS numeric_scale, IS_NULLABLE AS is_nullable
  FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('inventory_branch_balances','inventory_movements')`);
 const changes={};
 const pendingColumns={};
 for(const [table,names] of Object.entries(definitions)){
  const states=names.map(name=>{
   const column=columns.find(c=>c.table_name===table&&c.column_name===name);
   if(!column)throw Error(`INVENTORY_022_SCHEMA_MISSING:${table}.${name}`);
   const pair=[Number(column.numeric_precision),Number(column.numeric_scale)];
   if(column.data_type!=='decimal'||column.is_nullable!=='NO')throw Error(`INVENTORY_SCHEMA_INCOMPATIBLE:${table}.${name}:${describeColumn(column)}`);
   const expected=original[name];
   const current=pair[0]===18&&pair[1]===2;
   const legacy=pair[0]===expected[0]&&pair[1]===expected[1];
   // R1.6: a previous interrupted/partial migration may already have changed
   // monetary values from DECIMAL(24,8) to DECIMAL(24,2). The scale is safe,
   // but precision still needs conversion to the approved DECIMAL(18,2).
   const partiallyConverted=expected[0]===24&&pair[0]===24&&pair[1]===2;
   if(!current&&!legacy&&!partiallyConverted)throw Error(`INVENTORY_SCHEMA_INCOMPATIBLE:${table}.${name}:${describeColumn(column)}`);
   return {name,current};
  });
  pendingColumns[table]=states.filter(c=>!c.current).map(c=>c.name);
  changes[table]=pendingColumns[table].length>0;
 }
 let violations=[];
 let rangeViolations=[];
 for(const [table,names] of Object.entries(definitions)){
  if(!changes[table])continue;
  // SQL identifier fragments are constants from this file, never user input.
  const selects=names.map(n=>`SUM(CASE WHEN ${n} <> ROUND(${n},2) THEN 1 ELSE 0 END) AS ${n}, SUM(CASE WHEN ABS(${n}) >= 10000000000000000 THEN 1 ELSE 0 END) AS range_${n}`).join(',');
  const [[counts]]=await pool.query(`SELECT ${selects} FROM ${table}`);
  for(const name of names){
   if(Number(counts[name]??0)>0)violations.push({column:`${table}.${name}`,rows:Number(counts[name])});
   if(Number(counts[`range_${name}`]??0)>0)rangeViolations.push({column:`${table}.${name}`,rows:Number(counts[`range_${name}`])});
  }
 }
 return {changes,pendingColumns,violations,rangeViolations,columnsChecked:allNames.length};
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   const pool=tenantPool(t.id);
   const before=await inspect(pool);
   if(before.violations.length||before.rangeViolations.length){
    failed++;
    console.error(JSON.stringify({tenantId:String(t.id),status:before.violations.length?'BLOCKED_PRECISION_LOSS':'BLOCKED_DECIMAL_OVERFLOW',applied:false,violations:before.violations,rangeViolations:before.rangeViolations,action:'Review historical values before migration; no rounding or narrowing of out-of-range amounts.'}));
    continue;
   }
   const pending=Object.entries(before.changes).filter(([,required])=>required).map(([name])=>name);
   if(!pending.length){
    console.log(JSON.stringify({tenantId:String(t.id),status:'CURRENT',applied:false,columnsChecked:before.columnsChecked}));
    continue;
   }
   if(apply){
    // MySQL DDL commits implicitly. Each table is converted as one operation;
    // if interrupted, rerun the installer to finish only the remaining table.
    // Preflight is repeated for each table directly before ALTER to detect late writes.
    for(const table of pending){
     const now=await inspect(pool);
     if(now.violations.length||now.rangeViolations.length)throw Error('INVENTORY_PRECISION_CHANGED_AFTER_PREFLIGHT');
     if(now.changes[table]){
      const modifications=now.pendingColumns[table].map(name=>`MODIFY COLUMN ${name} DECIMAL(18,2) NOT NULL`).join(', ');
      await pool.query(`ALTER TABLE ${table} ${modifications}`);
     }
    }
    const after=await inspect(pool);
    if(Object.values(after.changes).some(Boolean)||after.violations.length||after.rangeViolations.length)throw Error('INVENTORY_TWO_DECIMAL_VERIFICATION_FAILED');
   }
   console.log(JSON.stringify({tenantId:String(t.id),status:apply?'APPLIED':'MISSING',applied:apply,missingConversions:pending,columnsChecked:before.columnsChecked}));
  }catch(e){failed++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',applied:false,error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'inventory_two_decimals_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;

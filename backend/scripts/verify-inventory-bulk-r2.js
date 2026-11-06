// Read-only file checks: helps catch wrong V2 folder / incomplete ZIP overwrite.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const expected={
 'backend/src/inventory-bulk-logic.js':['MAX_BULK_ROWS=1000','normalizeBulkRequest','parseCsvTable','openingMovementKey'],
 'backend/src/inventory-opening-bulk.js':['previewBulkOpening','confirmBulkOpening','inventory_bulk_opening_batches','beginTransaction()','rollback()'],
 'backend/scripts/setup-inventory-bulk-opening.js':["inventory_bulk_opening_r2_038",'MISSING_OR_PARTIAL','--apply'],
 'backend/src/app.js':['/api/v2/inventory/opening/bulk/preview','/api/v2/inventory/opening/bulk/confirm'],
 'backend/src/tenants.js':['038_tenant_inventory_bulk_opening.sql'],
 'frontend/src/Inventory.jsx':['InventoryBulkOpening','Bulk Opening Stock'],
 'frontend/src/InventoryBulkOpening.jsx':['CSV Template','Quick Entry','Preview','Confirm'],
 'frontend/src/InventoryBulkOpening.css':['.inv-bulk-dialog'],
 'database/038_tenant_inventory_bulk_opening.sql':['inventory_bulk_opening_batches','inventory_bulk_opening_lines','actual_unit_cost'],
 'backend/tests/inventory-bulk-opening-r2.test.js':['R2 confirm atomically records batch']
};
let failed=0;
for(const [file,markers] of Object.entries(expected)){
 let content='';try{content=readFileSync(new URL(file,root),'utf8');}catch{}
 const missing=markers.filter(m=>!content.includes(m));if(missing.length)failed++;
 console.log(JSON.stringify({event:'inventory_bulk_r2_file',file,status:missing.length?'MISSING_OR_OLD':'CURRENT',missingMarkers:missing.length}));
}
console.log(JSON.stringify({event:'inventory_bulk_r2_file_check',files:Object.keys(expected).length,failed,projectRoot:fileURLToPath(root)}));
if(failed)process.exitCode=1;

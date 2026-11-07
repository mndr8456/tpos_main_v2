// Verify changed KDS R1 source files on Windows without touching the database.
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const markers={
 'database/040_tenant_kds.sql':['kds_tickets','kds_ticket_lines','kds_ticket_audit','kds_r1_040'],
 'backend/src/kds.js':['kdsBoard','kdsLineStatus','kdsDispatchPos','kdsWaiterStatus'],
 'backend/src/kds-rules.js':['isKdsTransition','stationSummary'],
 'backend/src/kds-dispatch.js':['dispatchKitchenTicket','linkWaiterKitchenToPos','cancelPendingKitchenFromWaiter'],
 'backend/src/order-terminal.js':['dispatchKitchenTicket','cancelPendingKitchenFromWaiter','linkWaiterKitchenToPos'],
 'backend/src/pos-drafts.js':['POS_KDS_DISPATCHED_ORDER_LOCKED'],
 'backend/src/app.js':['/api/v2/kds/board','/api/v2/kds/pos/:id/dispatch'],
 'backend/src/tenants.js':["executeSchema(dbName,'040_tenant_kds.sql')"],
 'backend/src/role-permission-catalog.js':['"key":"kds"','"read":"kds.view"'],
 'backend/scripts/setup-kds.js':['KDS_TENANT_IDENTITY_MISMATCH','inspectKds'],
 'backend/tests/kds-r1.test.js':['KDS R1'],
 'frontend/src/KitchenDisplay.jsx':['Start Preparing','Mark Ready','Print','Full Screen'],
 'frontend/src/KitchenDisplay.css':['kds-ticket-grid'],
 'frontend/src/KitchenProgress.jsx':['Kitchen Status'],
 'frontend/src/OrderTerminal.jsx':['KitchenProgress'],
 'frontend/src/PosTerminal.jsx':['Send to Kitchen','KitchenProgress'],
 'frontend/src/App.jsx':['KitchenDisplay','canViewKds'],
 'frontend/src/role-navigation.js':["role==='KITCHEN' && hasPermission(profile,'kds.view')"],
 'docs/kds/KDS_R1_INSTALL_TEST.md':['Migration 040','WAITER','CASHIER']
};
let failures=0;for(const [file,values] of Object.entries(markers)){const path=resolve(root,file);const raw=existsSync(path)?readFileSync(path,'utf8'):'';const missing=values.filter(v=>!raw.includes(v));if(missing.length)failures++;console.log(JSON.stringify({event:'kds_r1_file',file,status:missing.length?'MISSING':'CURRENT',missingMarkers:missing}));}console.log(JSON.stringify({event:'kds_r1_complete',projectRoot:root,files:Object.keys(markers).length,failed:failures}));if(failures)process.exitCode=1;

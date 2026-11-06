// Non-destructive file presence and feature markers. Run from backend directory.
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
let root=path.resolve(process.cwd(),'..');
if(!existsSync(path.join(root,'backend','src','app.js')))root=process.cwd();
const checks={
 'backend/src/order-terminal.js':['sendWaiterOrder','waiterQueueDetail','claimWaiterOrder','cashierMayClaim'],
 'backend/src/waiter-order-rules.js':['waiterPayloadHash','rejectRepeatedProducts','cashierMayClaim'],
 'backend/src/app.js':['/api/v2/order-terminal/orders','/api/v2/pos/waiter-queue'],
 'backend/src/tenants.js':['039_tenant_order_terminal.sql'],
 'backend/src/pos-drafts.js':['LEFT JOIN waiter_orders w','SELECT id FROM waiter_orders WHERE active_table_id='],
 'backend/src/restaurant-tables.js':['LEFT JOIN waiter_orders w','TABLE_HAS_ACTIVE_ORDER'],
 'backend/src/role-permission-catalog.js':['"key":"order_terminal"'],
 'backend/scripts/setup-order-terminal.js':['ORDER_TERMINAL_TENANT_IDENTITY_MISMATCH','MISSING_OR_PARTIAL'],
 'database/039_tenant_order_terminal.sql':['uq_waiter_request','uq_waiter_active_table','order_terminal_r1_039'],
 'frontend/src/OrderTerminal.jsx':['Take Away','Dine In','Send Order to Cashier'],
 'frontend/src/OrderTerminal.css':['order-terminal-columns'],
 'frontend/src/PosTerminal.jsx':['Pending Waiter Orders','Receive into current cashier shift'],
 'frontend/src/PosTerminal.css':['pos-waiter-preview'],
 'frontend/src/App.jsx':['canViewOrderTerminal','OrderTerminal profile={profile}'],
 'frontend/src/role-navigation.js':["return 'order-terminal'"],
 'backend/tests/order-terminal-waiter-r1.test.js':['R1 waiter can send Take Away and Dine In']
};
let failures=0;for(const [name,markers] of Object.entries(checks)){
 try{const contents=readFileSync(path.join(root,name),'utf8');const missingMarkers=markers.filter(m=>!contents.includes(m));if(missingMarkers.length)failures++;console.log(JSON.stringify({event:'order_terminal_r1_file',file:name,status:missingMarkers.length?'FAILED':'CURRENT',missingMarkers}));}
 catch(e){failures++;console.error(JSON.stringify({event:'order_terminal_r1_file',file:name,status:'MISSING',error:e.code||e.message}));}
}
console.log(JSON.stringify({event:'order_terminal_r1_complete',projectRoot:root,files:Object.keys(checks).length,failed:failures}));
if(failures)process.exitCode=1;

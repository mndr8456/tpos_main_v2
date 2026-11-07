// Run from backend or project root; verifies complete patched files before PC migration.
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const expected={
 'database/041_tenant_customer_display.sql':['customer_display_sessions','customer_display_r1_041'],
 'backend/src/customer-display.js':['publicCustomerDisplayState','publishCustomerDisplay','pairCustomerDisplay'],
 'backend/src/customer-display-rules.js':['displayPaymentState','validDisplayToken'],
 'backend/src/app.js':['customer-display/public/view','customer-display/pair'],
 'backend/src/tenants.js':['041_tenant_customer_display.sql'],
 'backend/src/role-permission-catalog.js':['"key": "customer_display"'],
 'backend/package.json':['db:customer-display','setup-customer-display.js'],
 'backend/scripts/setup-customer-display.js':['inspectCustomerDisplay','MARKER_WITH_PARTIAL_SCHEMA'],
 'backend/scripts/verify-customer-display-r1.js':['verify-customer-display-r1.js'],
 'backend/tests/customer-display-r1.test.js':['CD R1: pairing token','CD R1: legacy manual QR'],
 'backend/tests/foundation.test.js':['041_tenant_customer_display.sql'],
 'frontend/src/CustomerDisplaySettings.jsx':['Payment Success — English','Save Settings'],
 'frontend/src/CustomerDisplaySettings.css':['cd-settings-layout'],
 'frontend/src/App.jsx':['CustomerDisplaySettings','canViewCustomerDisplay'],
 'frontend/src/PosTerminal.jsx':['Open Customer Display','customer-display/publish'],
 'frontend/src/PosMultiPayment.jsx':['onDisplayMode','customer-display'],
 'frontend/public/customer-display.html':['id="promotion-area"','id="order-lines"'],
 'frontend/public/customer-display.css':['.display-split','.display-success'],
 'frontend/public/customer-display.js':['customer-display/public/view','history.replaceState'],
 'docs/customer_display/CUSTOMER_DISPLAY_R1_INSTALL_TEST.md':['Migration 041','Live Acceptance']
};
let failed=0;for(const [file,markers] of Object.entries(expected)){
 let text='';try{text=readFileSync(resolve(root,file),'utf8');}catch{}
 const missingMarkers=markers.filter(marker=>!text.includes(marker));const status=missingMarkers.length?'FAILED':'CURRENT';
 if(missingMarkers.length)failed++;
 console.log(JSON.stringify({event:'customer_display_r1_file',file,status,missingMarkers}));
}
console.log(JSON.stringify({event:'customer_display_r1_complete',projectRoot:root,files:Object.keys(expected).length,failed}));if(failed)process.exitCode=1;

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {saleTaxRateSnapshot} from '../src/pos-receipt-tax-rates.js';
import {RATE_COLUMNS,FEATURE_036,assessRateSnapshot036} from '../src/pos-receipt-tax-rates-migration.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const src=name=>readFileSync(resolve(root,name),'utf8');
const quote=()=>({
 bill:{salesTax:'0.00',serviceTax:'1.26',serviceCharge:'0.00'},
 sst:{salesTax:{enabled:true,registrationConfigured:true,rate:'8.000'},serviceTax:{enabled:true,registrationConfigured:true,rate:'6.000'}},
 serviceCharge:{applicable:false,rate:'0'}
});
const columnMeta=()=>Object.fromEntries(RATE_COLUMNS.map(name=>[name,{type:'decimal(6,3)',nullable:'YES',defaultValue:null}]));
test('R2.1.5: captures both tenant tax rates even when one amount is RM 0.00',()=>{
 const snap=saleTaxRateSnapshot(quote());
 assert.deepEqual(snap,{salesTaxRate:'8.000',serviceTaxRate:'6.000',serviceChargeRate:null});
});
test('R2.1.5: a changed tenant rate does not mutate a previous sale snapshot',()=>{
 const q=quote(),posted=saleTaxRateSnapshot(q);
 q.sst.salesTax.rate='10.000';q.sst.serviceTax.rate='8.000';
 assert.equal(posted.salesTaxRate,'8.000');assert.equal(posted.serviceTaxRate,'6.000');
 assert.equal(saleTaxRateSnapshot(q).serviceTaxRate,'8.000');
});
test('R2.1.5: disabled tax is not described as zero-rated; charged disabled tax fails closed',()=>{
 const q=quote();q.sst.salesTax.enabled=false;
 assert.equal(saleTaxRateSnapshot(q).salesTaxRate,null);
 q.bill.salesTax='0.01';assert.throws(()=>saleTaxRateSnapshot(q),/POS_RECEIPT_DISABLED_TAX_NONZERO/);
});
test('R2.1.5: Service Charge is a separate percent-based fee, not Service Tax',()=>{
 const q=quote();q.serviceCharge={applicable:true,rate:'5.5'};q.bill.serviceCharge='2.50';
 assert.equal(saleTaxRateSnapshot(q).serviceChargeRate,'5.500');
 assert.equal(saleTaxRateSnapshot(q).serviceTaxRate,'6.000');
});
test('R2.1.5: missing or invalid tax rate fails closed before sale insert',()=>{
 const q=quote();delete q.sst.salesTax.rate;
 assert.throws(()=>saleTaxRateSnapshot(q),/POS_RECEIPT_TAX_RATE_INVALID/);
 for(const rate of ['-1','101','6.1234','9abc']){q.sst.salesTax.rate=rate;assert.throws(()=>saleTaxRateSnapshot(q));}
});
test('R2.1.5: both cash and manually verified noncash use the same quote-time snapshot',()=>{
 for(const path of ['backend/src/pos-cash-checkout.js','backend/src/pos-multi-payment.js']){
  const code=src(path);
  assert.match(code,/const rateSnapshot=saleTaxRateSnapshot\(quote\)/);
  assert.match(code,/INSERT INTO pos_sales\([^`]*sales_tax_rate_pct,service_tax,service_tax_rate_pct,service_charge,service_charge_rate_pct/);
  assert.match(code,/quote\.bill\.salesTax,rateSnapshot\.salesTaxRate,quote\.bill\.serviceTax,rateSnapshot\.serviceTaxRate,quote\.bill\.serviceCharge,rateSnapshot\.serviceChargeRate/);
 }
});
test('R2.1.5: receipt reads historical rates from posted sale, not mutable SST settings',()=>{
 const code=src('backend/src/pos-cash-checkout.js');
 for(const field of ['sales_tax_rate_pct','service_tax_rate_pct','service_charge_rate_pct'])assert.ok(code.includes(`sale.${field}`));
 assert.match(code,/sale\.sales_tax_rate_pct==null\?null/);
});
test('R2.1.5: receipt includes percent label for zero-valued active tax and discloses legacy unknown rate',()=>{
 const jsx=src('frontend/src/PosCashReceipt.jsx');
 assert.match(jsx,/r\.salesTaxRate!=null\|\|Number\(r\.salesTax\)!==0/);
 assert.match(jsx,/showSalesTax&&<Line label=\{taxLabel\('Sales Tax',r\.salesTaxRate\)\}/);
 assert.match(jsx,/showServiceTax&&<Line label=\{taxLabel\('Service Tax',r\.serviceTaxRate\)\}/);
 assert.match(jsx,/rate not recorded/);
 const match=jsx.match(/const percentage=\(value\)=>\{[\s\S]*?\n\};\nfunction taxLabel\(name,rate\)\{[\s\S]*?\n\}/);
 assert.ok(match,'real UI rate formatter exists');
 const sandbox=vm.createContext({});
 vm.runInContext(match[0]+'\nglobalThis.label=taxLabel;',sandbox);
 assert.equal(sandbox.label('Sales Tax','8.000'),'Sales Tax (8%)');
 assert.equal(sandbox.label('Service Tax','6.000'),'Service Tax (6%)');
 assert.equal(sandbox.label('Service Tax','6.125'),'Service Tax (6.125%)');
 assert.equal(sandbox.label('Service Tax',null),'Service Tax (rate not recorded)');
});
test('R2.1.5: additive migration 036 never guesses old rates or mutates historical tax values',()=>{
 const sql=src('database/036_tenant_pos_receipt_tax_rates.sql');
 for(const col of RATE_COLUMNS)assert.match(sql,new RegExp(`ADD COLUMN ${col} DECIMAL\\(6,3\\) NULL`));
 assert.match(sql,/INSERT IGNORE INTO tpos_feature_setup_history/);
 assert.doesNotMatch(sql,/UPDATE\s+pos_sales|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
 assert.equal(FEATURE_036,'pos_receipt_tax_rates_r215_036');
});
test('R2.1.5: marker+all columns CURRENT; missing can recover; mismatched blocks',()=>{
 const facts={hasSaleTable:true,has035:true,markerRecorded:true,columns:columnMeta()};
 assert.equal(assessRateSnapshot036(facts).current,true);
 const partial={...facts,markerRecorded:false,columns:{sales_tax_rate_pct:columnMeta().sales_tax_rate_pct}};
 assert.equal(assessRateSnapshot036(partial).repairable,true);
 assert.equal(assessRateSnapshot036(partial).missingColumns.length,2);
 const bad={...facts,columns:{...columnMeta(),sales_tax_rate_pct:{type:'varchar(20)',nullable:'YES',defaultValue:null}}};
 assert.equal(assessRateSnapshot036(bad).repairable,false);
 assert.deepEqual(assessRateSnapshot036(bad).blockers,['RATE_COLUMNS_INCOMPATIBLE']);
});
test('R2.1.5: installer is read-only by default, preserves tenant identity, future tenants provision 036',()=>{
 const s=src('backend/scripts/setup-pos-receipt-tax-rates.js');
 assert.match(s,/process\.argv\.includes\('--apply'\)/);
 assert.match(s,/tenantDatabase\(tenantId\)/);
 assert.match(s,/information_schema\.columns/);
 assert.match(s,/ADD COLUMN \$\{name\} DECIMAL\(6,3\) NULL/);
 assert.match(s,/if\(!apply\)/);
 assert.match(src('backend/src/tenants.js'),/executeSchema\(dbName,'035_tenant_pos_multi_payment\.sql'\);\s*await executeSchema\(dbName,'036_tenant_pos_receipt_tax_rates\.sql'\)/);
 const p=JSON.parse(src('backend/package.json'));
 assert.ok(p.scripts['db:pos:receipt-tax-rates']);
});
test('R2.1.5: leaves approved R2.1.4 single-page printer unchanged',()=>{
 const pos=src('frontend/src/PosTerminal.jsx'),printer=src('frontend/src/pos-receipt-print.js');
 assert.match(pos,/printPosReceipt\(receiptNodeRef\.current,closePaidReceipt\)/);
 assert.match(printer,/receiptPageHeightMm\(receiptHeight, pixelsPerMm\)/);
});

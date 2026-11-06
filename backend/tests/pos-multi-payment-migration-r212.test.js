import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
 enumItems,enumState,expandedEnumType,cashCheckState,assess035,
 EXPECTED_SALE_METHODS,EXPECTED_JOURNAL_SOURCES,NEW_SALE_CHECK
} from '../src/pos-multi-payment-migration.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=path=>readFileSync(resolve(root,path),'utf8');
const current='(((`total` >= 0) and (`cost_of_goods` >= 0)) and (((`payment_method` = _utf8mb4\'CASH\') and (`cash_received` >= `total`) and (`cash_change` = (`cash_received` - `total`))) or ((`payment_method` <> _utf8mb4\'CASH\') and (`cash_received` = 0.00) and (`cash_change` = 0.00))))';
const legacy='((`cash_change` = (`cash_received` - `total`)) AND (`total`>=0.00) AND (`cash_received`>=`total`) AND (`cost_of_goods`>=0))';
const initial={has034:true,hasMarker:true,tables:[],columns:{},indexes:{},saleColumnType:"enum('CASH')",journalColumnType:"enum('POS_CASH_SALE')",cashCheckClause:legacy,hasPermission:true};
test('R2.1.2 interprets MySQL 8.4 wrapped, reordered, charset-marked current CHECK as CURRENT',()=>{
 assert.equal(cashCheckState(current),'CURRENT');
 assert.equal(cashCheckState(NEW_SALE_CHECK),'CURRENT');
});
test('R2.1.2 detects cash-only check without rejecting valid MySQL server formatting',()=>{
 assert.equal(cashCheckState(legacy),'LEGACY');
 assert.equal(cashCheckState(null),'MISSING');
});
test('R2.1.2 rejects weakened or unusual constraints instead of dropping them',()=>{
 assert.equal(cashCheckState("total>=0 AND (payment_method='CASH' OR cash_received>=0)"),'INCOMPATIBLE');
 assert.equal(cashCheckState('total>=0 OR total<0'),'INCOMPATIBLE');
 assert.equal(cashCheckState('total>=0 AND magic(amount)'),'INCOMPATIBLE');
 assert.equal(cashCheckState('amount>0'),'INCOMPATIBLE');
});
test('R2.1.2 preserves existing MySQL ENUM ordinal order when appending missing safe values',()=>{
 const type="enum('CASH','BANK_TRANSFER','DUITNOW_QR')";
 assert.equal(enumState(type,EXPECTED_SALE_METHODS,['CASH']),'LEGACY');
 const expanded=expandedEnumType(type,EXPECTED_SALE_METHODS,['CASH']);
 assert.deepEqual(enumItems(expanded).slice(0,3),['CASH','BANK_TRANSFER','DUITNOW_QR']);
 assert.deepEqual(new Set(enumItems(expanded)),new Set(EXPECTED_SALE_METHODS));
});
test('R2.1.2 reports enum with all supported values CURRENT regardless of harmless existing order',()=>{
 const reorder=['CASH',...EXPECTED_SALE_METHODS.slice(1).reverse()];
 assert.equal(enumState(`enum(${reorder.map(v=>`'${v}'`).join(',')})`,EXPECTED_SALE_METHODS,['CASH']),'CURRENT');
 const journal="enum('POS_CASH_SALE','POS_NONCASH_SALE')";
 assert.equal(enumState(journal,EXPECTED_JOURNAL_SOURCES,['POS_CASH_SALE']),'CURRENT');
});
test('R2.1.2 rejects unknown, duplicate or missing legacy enum values',()=>{
 for(const type of ["enum('CASH','UNKNOWN')","enum('CASH','CASH')","enum('DUITNOW_QR','CASH')","varchar(100)"]){
  assert.equal(enumState(type,EXPECTED_SALE_METHODS,['CASH']),'INCOMPATIBLE');
  assert.throws(()=>expandedEnumType(type,EXPECTED_SALE_METHODS,['CASH']),/MANUAL_REVIEW/);
 }
});
test('R2.1.2 partial 035 with migration marker is repairable and reports actual metadata',()=>{
 const state=assess035(initial);
 assert.equal(state.repairable,true);
 assert.ok(state.pending.includes('CREATE_MISSING_TABLES'));
 assert.ok(state.pending.includes('EXPAND_SALE_ENUM'));
 assert.ok(state.pending.includes('REPLACE_SALE_AMOUNT_CHECK'));
 assert.ok(state.pending.includes('EXPAND_JOURNAL_ENUM'));
 assert.deepEqual(state.schema,{saleColumnType:"enum('CASH')",journalColumnType:"enum('POS_CASH_SALE')",cashCheckClause:legacy,otherPaymentChecks:[]});
});
test('R2.1.2 unknown or extra payment CHECK causes MANUAL_REVIEW with raw diagnostic',()=>{
 const state=assess035({...initial,otherPaymentChecks:[{name:'old_cash_guard',clause:'cash_received>=total'}]});
 assert.equal(state.repairable,false);
 assert.ok(state.blockers.includes('OTHER_PAYMENT_CHECK_REQUIRES_MANUAL_REVIEW'));
 assert.deepEqual(state.schema.otherPaymentChecks,[{name:'old_cash_guard',clause:'cash_received>=total'}]);
});
test('R2.1.2 installer requires preflight of existing posted sales and append-only expansion',()=>{
 const code=source('backend/scripts/setup-pos-multi-payment.js');
 assert.match(code,/await verifySaleAmounts\(pool\);\s*const sql=/);
 assert.match(code,/expandedEnumType\(state\.schema\.saleColumnType/);
 assert.match(code,/expandedEnumType\(state\.schema\.journalColumnType/);
 assert.match(code,/if\(!before\.markerRecorded\)/);
 assert.match(code,/tc\.CONSTRAINT_TYPE='CHECK'/);
 assert.match(code,/otherPaymentChecks/);
 assert.doesNotMatch(code,/TRUNCATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM\s+pos_payment_attempts/i);
});

test('R2.1.2 information_schema queries use stable result aliases on Windows/MySQL 8.4',()=>{
 const code=source('backend/scripts/setup-pos-multi-payment.js');
 assert.match(code,/SELECT table_name AS tpos_table FROM information_schema\.tables/);
 assert.match(code,/SELECT table_name AS tpos_table,column_name AS tpos_column,column_type AS tpos_type FROM information_schema\.columns/);
 assert.match(code,/SELECT table_name AS tpos_table,index_name AS tpos_index FROM information_schema\.statistics/);
 assert.match(code,/row\.tpos_column/);
 assert.match(code,/row\.tpos_type/);
 assert.match(code,/row\.tpos_index/);
 assert.doesNotMatch(code,/row\.table_name|row\.column_type|row\.index_name/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {cashCheckState,assess035,NEW_SALE_CHECK} from '../src/pos-multi-payment-migration.js';

// Exact quote-escaped CHECK_CLAUSE as received in the live PC MySQL 8.4
// diagnostic. Backslashes below are literal characters, not JS quote escapes.
const mysql84PcClause=String.raw`((\`total\` >= 0) and (\`cost_of_goods\` >= 0) and (((\`payment_method\` = _utf8mb4\'CASH\') and (\`cash_received\` >= \`total\`) and (\`cash_change\` = (\`cash_received\` - \`total\`))) or ((\`payment_method\` <> _utf8mb4\'CASH\') and (\`cash_received\` = 0) and (\`cash_change\` = 0))))`;
const expectedSaleEnum="enum('CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','DUITNOW_QR','EWALLET','SARA_MYKASIH')";
const expectedJournalEnum="enum('POS_CASH_SALE','POS_NONCASH_SALE')";

// The actual source clause contains backticks; String.raw above preserves \'
// but we escape the backticks only to keep the template literal well-formed.
const exactClause=mysql84PcClause.replaceAll('\\`','`');

test('R2.1.3 live MySQL 8.4 quote-escaped CHECK is CURRENT, not INCOMPATIBLE',()=>{
 assert.ok(exactClause.includes(String.raw`_utf8mb4\'CASH\'`));
 assert.equal(cashCheckState(exactClause),'CURRENT');
 assert.equal(cashCheckState(NEW_SALE_CHECK),'CURRENT');
});

test('R2.1.3 existing completed 035 with historical marker is CURRENT without any pending DDL',()=>{
 const state=assess035({
  has034:true,hasMarker:true,hasPermission:true,
  tables:['pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens'],
  columns:{
   pos_payment_attempts:['id','request_key','draft_id','branch_id','shift_id','cashier_user_id','draft_version','method_code','verification_mode','expected_total','status','payment_reference','reference_hash','verified_by','verified_at','evidence_mime','evidence_data','sale_id'],
   pos_payment_attempt_audit:['id','attempt_id','actor_user_id','event_type','details','recorded_at'],
   pos_payment_display_tokens:['token_hash','attempt_id','expires_at']
  },
  indexes:{
   pos_payment_attempts:['PRIMARY','uq_pos_payment_attempt_request','uq_pos_payment_attempt_reference','uq_pos_payment_attempt_sale'],
   pos_payment_attempt_audit:['PRIMARY','ix_pos_payment_attempt_audit'],
   pos_payment_display_tokens:['PRIMARY']
  },
  saleColumnType:expectedSaleEnum,journalColumnType:expectedJournalEnum,
  cashCheckClause:exactClause,otherPaymentChecks:[]
 });
 assert.equal(state.check,'CURRENT');
 assert.equal(state.current,true);
 assert.equal(state.repairable,true);
 assert.deepEqual(state.pending,[]);
 assert.deepEqual(state.blockers,[]);
});

test('R2.1.3 strict parse still rejects unknown escaped string or additional OR',()=>{
 assert.equal(cashCheckState(exactClause.replaceAll('CASH','HACK')),'INCOMPATIBLE');
 assert.equal(cashCheckState(exactClause+' or 1=1'),'INCOMPATIBLE');
 assert.equal(cashCheckState(exactClause.replace('`total` >= 0','`total` < 0')),'INCOMPATIBLE');
 assert.equal(cashCheckState(exactClause.replace(String.raw`_utf8mb4\'CASH\'`,String.raw`_latin1\'CASH\'`)),'INCOMPATIBLE');
});

test('R2.1.3 recognizes both ordinary and MySQL charset-prefixed quote-escaped SQL strings',()=>{
 const ordinary=exactClause.replaceAll(String.raw`_utf8mb4\'CASH\'`,"'CASH'");
 const unescaped=exactClause.replaceAll(String.raw`_utf8mb4\'CASH\'`,"_utf8mb4'CASH'");
 assert.equal(cashCheckState(ordinary),'CURRENT');
 assert.equal(cashCheckState(unescaped),'CURRENT');
});

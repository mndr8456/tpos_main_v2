import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {assess035,cashCheckState,enumState,EXPECTED_SALE_METHODS,EXPECTED_JOURNAL_SOURCES,extract035TableCreations} from '../src/pos-multi-payment-migration.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const file=p=>readFileSync(resolve(root,p),'utf8');
function facts(changes={}){
 return {has034:true,hasMarker:true,tables:['pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens'],
 columns:{pos_payment_attempts:['id','request_key','draft_id','branch_id','shift_id','cashier_user_id','draft_version','method_code','verification_mode','expected_total','status','payment_reference','reference_hash','verified_by','verified_at','evidence_mime','evidence_data','sale_id'],pos_payment_attempt_audit:['id','attempt_id','actor_user_id','event_type','details','recorded_at'],pos_payment_display_tokens:['token_hash','attempt_id','expires_at']},
 indexes:{pos_payment_attempts:['PRIMARY','uq_pos_payment_attempt_request','uq_pos_payment_attempt_reference','uq_pos_payment_attempt_sale'],pos_payment_attempt_audit:['PRIMARY','ix_pos_payment_attempt_audit'],pos_payment_display_tokens:['PRIMARY']},
 saleColumnType:`enum(${EXPECTED_SALE_METHODS.map(x=>`'${x}'`).join(',')})`,journalColumnType:`enum(${EXPECTED_JOURNAL_SOURCES.map(x=>`'${x}'`).join(',')})`,
 cashCheckClause:"(`total` >= 0 AND `cost_of_goods` >= 0 AND ((`payment_method` = 'CASH' AND `cash_received` >= `total` AND `cash_change` = (`cash_received` - `total`)) OR (`payment_method` <> 'CASH' AND `cash_received` = 0 AND `cash_change` = 0)))",hasPermission:true,...changes};
}
test('R2.1.1: a completed 035 schema is recognized even with 035 history',()=>{
 const got=assess035(facts());assert.equal(got.current,true);assert.equal(got.repairable,true);assert.deepEqual(got.pending,[]);
});
test('R2.1.1: partial 035 after marker is recoverable without touching existing attempts',()=>{
 const f=facts({tables:['pos_payment_attempts','pos_payment_attempt_audit'],journalColumnType:"enum('POS_CASH_SALE')",hasPermission:false});
 const result=assess035(f);
 assert.equal(result.current,false);assert.equal(result.repairable,true);assert.equal(result.markerRecorded,true);
 assert.ok(result.pending.includes('CREATE_MISSING_TABLES'));
 assert.ok(result.pending.includes('EXPAND_JOURNAL_ENUM'));
 assert.ok(result.pending.includes('REGISTER_MANUAL_PERMISSION'));
});
test('R2.1.1: old cash-only sale check and enums can be safely expanded',()=>{
 const f=facts({saleColumnType:"enum('CASH')",journalColumnType:"enum('POS_CASH_SALE')",cashCheckClause:'(`total` >= 0 AND `cash_received` >= `total` AND `cash_change` = (`cash_received` - `total`))'});
 const result=assess035(f);
 assert.equal(result.repairable,true);assert.ok(result.pending.includes('EXPAND_SALE_ENUM'));
 assert.ok(result.pending.includes('REPLACE_SALE_AMOUNT_CHECK'));
 assert.ok(result.pending.includes('EXPAND_JOURNAL_ENUM'));
});
test('R2.1.1: unknown ENUM or incompatible table/index fails closed',()=>{
 assert.ok(assess035(facts({saleColumnType:"enum('CASH','MYSTERY')"})).blockers.includes('SALE_METHOD_ENUM_INCOMPATIBLE'));
 assert.ok(assess035(facts({columns:{pos_payment_attempts:['id']}})).blockers.includes('PAYMENT_TABLE_SCHEMA_MISMATCH'));
 assert.ok(assess035(facts({has034:false})).blockers.includes('ROLE_PERMISSION_034_NOT_CURRENT'));
 assert.equal(cashCheckState('amount>0'),'INCOMPATIBLE');
 assert.equal(enumState("enum('CASH')",EXPECTED_SALE_METHODS,['CASH']),'LEGACY');
});
test('R2.1.1: table DDL is extracted without replaying one-time cash grants or old constraint alterations',()=>{
 const sql=file('database/035_tenant_pos_multi_payment.sql');const creates=extract035TableCreations(sql);
 assert.equal(creates.size,3);for(const [name,s] of creates){assert.match(s,/CREATE TABLE IF NOT EXISTS/);assert.ok(s.includes(name));}
 const installer=file('backend/scripts/setup-pos-multi-payment.js');
 assert.match(installer,/if\(!before\.markerRecorded\)/);
 assert.match(installer,/verifySaleAmounts/);
 assert.match(installer,/DROP CHECK chk_pos_sale_amounts, /);
 assert.doesNotMatch(installer,/DROP TABLE|TRUNCATE TABLE|DELETE FROM pos_payment_attempts/i);
});
test('R2.1.1: POS multi payment frontend and customer display are in the same project root as backend',()=>{
 const files=['frontend/src/PosTerminal.jsx','frontend/src/PosMultiPayment.jsx','frontend/src/PosMultiPayment.css','frontend/public/customer-display.js','frontend/public/customer-display.html'];
 for(const p of files)assert.ok(file(p).length>100,p);
 assert.match(file('frontend/src/PosTerminal.jsx'),/PosMultiPayment/);
});

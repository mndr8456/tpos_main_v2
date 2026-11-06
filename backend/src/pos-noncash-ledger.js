import {makePosCashJournal} from './pos-cash-ledger.js';
const RECEIVABLE={DUITNOW_QR:'1022',EWALLET:'1023',BANK_TRANSFER:'1020',DEBIT_CARD:'1025',CREDIT_CARD:'1025'};
// No cash drawer debit; card/QR clearing is reconciled against merchant settlement.
export function makePosNonCashJournal(bill,cogs,method){
 const account=RECEIVABLE[method];
 if(!account)throw Object.assign(new Error('POS_UNSUPPORTED_NONCASH_ACCOUNT'),{status:409});
 return makePosCashJournal(bill,cogs).map(row=>row.accountCode==='1010'&&row.debit!=='0.00'
  ?{...row,accountCode:account,description:`${method} verified merchant receipt / clearing`}:row);
}

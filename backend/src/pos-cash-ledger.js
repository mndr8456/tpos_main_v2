// Pure integer-sen double-entry POS cash journal builder.
import {parseSen,fmtSen} from './cash-shift-money.js';
const err=(code,status=409)=>Object.assign(new Error(code),{status});
const str=v=>String(v);
const accounts={CASH:'1010',INVENTORY:'1300',SST_SALES:'2201',SST_SERVICE:'2202',REVENUE:'4010',CHARGE:'4030',ROUND_GAIN:'4090',ROUND_LOSS:'5090',COGS:'5010'};
export function makePosCashJournal(bill,cost){
 const entries=[];
 const put=(account,side,sen,description)=>{if(sen>0n)entries.push({account,side,sen,description});};
 const cent=value=>parseSen(str(value));
 const total=cent(bill.total),base=cent(bill.subtotalBeforeTax),salesTax=cent(bill.salesTax),serviceTax=cent(bill.serviceTax),charge=cent(bill.serviceCharge),cogs=cent(cost);
 const rounding=BigInt(bill.roundingAdjustmentSen);
 const reduced=cent(bill.discount??'0.00')+cent(bill.voucher??'0.00');
 if(reduced<0n||reduced>base)throw err('POS_ACCOUNTING_INVALID_REDUCTION');
 put(accounts.CASH,'DR',total,'Cash received from POS sale');
 put(accounts.REVENUE,'CR',base-reduced,reduced>0n?'POS sales net of SST and reductions':'POS sales net of SST');
 put(accounts.SST_SALES,'CR',salesTax,'Sales Tax collected');
 put(accounts.SST_SERVICE,'CR',serviceTax,'Service Tax collected');
 put(accounts.CHARGE,'CR',charge,'Merchant service charge');
 if(rounding>0n)put(accounts.ROUND_GAIN,'CR',rounding,'BNM rounding gain');
 if(rounding<0n)put(accounts.ROUND_LOSS,'DR',(-rounding),'BNM rounding loss');
 put(accounts.COGS,'DR',cogs,'Cost of goods sold');
 put(accounts.INVENTORY,'CR',cogs,'Inventory carrying value issued');
 const debit=entries.filter(x=>x.side==='DR').reduce((n,x)=>n+x.sen,0n);
 const credit=entries.filter(x=>x.side==='CR').reduce((n,x)=>n+x.sen,0n);
 if(debit!==credit||total<=0n)throw err('POS_ACCOUNTING_JOURNAL_UNBALANCED');
 return entries.map(x=>({accountCode:x.account,debit:fmtSen(x.side==='DR'?x.sen:0n),credit:fmtSen(x.side==='CR'?x.sen:0n),description:x.description}));
}

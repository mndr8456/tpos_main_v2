// Read-only POS counter quote: exact integer-sen tax and BNM 5-sen bill rounding.
// This calculation is not a sale, a tax invoice, or a payment authorization.
const SEN_LIMIT=99999999999;
const format=sen=>(sen/100).toFixed(2);
const assertSen=n=>{if(!Number.isSafeInteger(n)||n<0||n>SEN_LIMIT)throw Error('POS_BILL_INVALID_SEN');return n;};
function rateMilli(value){
 const s=String(value??'0');
 if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(s))throw Error('POS_TAX_RATE_INVALID');
 const [w,f='']=s.split('.');const n=Number(w)*1000+Number((f+'000').slice(0,3));
 if(n>100000)throw Error('POS_TAX_RATE_INVALID');
 return n;
}
function divRound(n,d){return Number((n+d/2n)/d);}
// Final 5-sen adjustment is applied ONCE to the complete tax-inclusive bill.
// Ends 1/2/6/7 go down; 3/4/8/9 go up (BNM notice, 13 Nov 2007).
export function roundBillToFiveSen(totalSen){
 assertSen(totalSen);
 const last=totalSen%5;
 const diff=last===0?0:last<=2?-last:5-last;
 assertSen(totalSen+diff);
 return {adjustmentSen:diff,totalSen:totalSen+diff};
}
function distributeDiscount(lines,discountSen,subtotalSen){
 if(!discountSen||!subtotalSen)return lines.map(()=>0);
 const portions=lines.map((l,i)=>({i,raw:BigInt(l.lineSen)*BigInt(discountSen),base:0,remainder:0n}));
 let used=0;
 for(const p of portions){p.base=Number(p.raw/BigInt(subtotalSen));p.remainder=p.raw%BigInt(subtotalSen);used+=p.base;}
 portions.sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0;i<discountSen-used;i++)portions[i].base++;
 portions.sort((a,b)=>a.i-b.i);
 return portions.map(x=>x.base);
}
export function calculatePosBill(lines,{discountSen=0,voucherSen=0,serviceChargeRate='0'}={}){
 if(!Array.isArray(lines))throw Error('POS_BILL_LINES_INVALID');
 let subtotalSen=0;
 for(const l of lines){assertSen(l.lineSen);subtotalSen+=l.lineSen;assertSen(subtotalSen);}
 assertSen(discountSen);assertSen(voucherSen);
 if(discountSen+voucherSen>subtotalSen)throw Error('POS_BILL_REDUCTION_EXCEEDS_SUBTOTAL');
 const deductions=distributeDiscount(lines,discountSen+voucherSen,subtotalSen);
 let salesTaxSen=0,serviceTaxSen=0,salesTaxIncluded=0,serviceTaxIncluded=0;
 lines.forEach((line,i)=>{
  const taxableGross=line.lineSen-deductions[i];
  const type=line.taxType||'NONE';
  if(!['NONE','SALES_TAX','SERVICE_TAX'].includes(type))throw Error('POS_TAX_TYPE_INVALID');
  const rate=rateMilli(line.taxRate||'0');
  if(type==='NONE'&&rate!==0)throw Error('POS_TAX_CONFIG_INVALID');
  if(type==='NONE'||rate===0)return;
  const inclusive=line.taxInclusive===true||line.taxInclusive===1||line.taxInclusive==='1';
  const numer=BigInt(taxableGross)*BigInt(rate);
  const tax=divRound(numer,BigInt(100000+(inclusive?rate:0)));
  if(type==='SALES_TAX')salesTaxSen+=tax;
  else serviceTaxSen+=tax;
  // Inclusive tax is already inside the item price. Only exclusive tax increases the bill.
  if(inclusive){if(type==='SALES_TAX')salesTaxIncluded+=tax;else serviceTaxIncluded+=tax;}
 });
 // The sale-price subtotal may already include SST. The seven-line POS
 // summary must reconcile arithmetically without charging included SST again:
 //   subtotalBeforeTax - discounts - voucher + salesTax + serviceTax
 //   + rounding = total.
 // Keep `subtotal` unchanged for existing carts/discount eligibility; only
 // the display subtotal removes the included portion of tax.
 const subtotalBeforeTaxSen=subtotalSen-salesTaxIncluded-serviceTaxIncluded;
 assertSen(subtotalBeforeTaxSen);
 // Service Charge is a merchant fee, NOT JKDM Service Tax. Do not tax the
 // charge itself. Base is the discount/voucher-adjusted item selling subtotal.
 const serviceChargeBaseSen=subtotalSen-discountSen-voucherSen;
 const serviceChargeSen=divRound(BigInt(serviceChargeBaseSen)*BigInt(rateMilli(serviceChargeRate)),100000n);
 assertSen(serviceChargeSen);
 const totalBeforeRoundingSen=subtotalBeforeTaxSen-discountSen-voucherSen+salesTaxSen+serviceTaxSen+serviceChargeSen;
 assertSen(totalBeforeRoundingSen);
 const {adjustmentSen,totalSen}=roundBillToFiveSen(totalBeforeRoundingSen);
 return {
  subtotal:format(subtotalSen),subtotalBeforeTax:format(subtotalBeforeTaxSen),discount:format(discountSen),voucher:format(voucherSen),
  salesTax:format(salesTaxSen),serviceTax:format(serviceTaxSen),serviceCharge:format(serviceChargeSen),taxTotal:format(salesTaxSen+serviceTaxSen),
  salesTaxInclusive:format(salesTaxIncluded),serviceTaxInclusive:format(serviceTaxIncluded),
  roundingAdjustment:(adjustmentSen<0?'-':adjustmentSen>0?'+':'')+format(Math.abs(adjustmentSen)),
  totalBeforeRounding:format(totalBeforeRoundingSen),total:format(totalSen),
  subtotalSen,subtotalBeforeTaxSen,discountSen,voucherSen,salesTaxSen,serviceTaxSen,serviceChargeSen,
  salesTaxIncludedSen:salesTaxIncluded,serviceTaxIncludedSen:serviceTaxIncluded,
  roundingAdjustmentSen:adjustmentSen,totalBeforeRoundingSen,totalSen
 };
}

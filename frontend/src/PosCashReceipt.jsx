import React from 'react';
import './PosCashReceipt.css';

const number=value=>Number(value||0).toFixed(2);
const asMoney=value=>number(value);
function dateMalaysia(value){
 if(!value)return '-';
 // posted_at is a MySQL DATETIME in the tenant DB session clock.
 // Preserve its wall-clock time; do not incorrectly add 8 hours to a local DATETIME.
 const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
 if(!match)return String(value);
 const [,year,month,day,hour,minute,second]=match;
 const monthName=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1];
 return monthName?`${day} ${monthName} ${year}, ${hour}:${minute}:${second}`:String(value);
}
function Line({label,value,emphasis=false}){
 return <div className={`pos-receipt-money-line${emphasis?' pos-receipt-money-strong':''}`}><span>{label}</span><span>{asMoney(value)}</span></div>;
}
export function PosCashReceipt({receipt:r}){
 const address=Array.isArray(r.addressLines)&&r.addressLines.length?r.addressLines:(r.address?[r.address]:[]);
 const hasTax=Number(r.salesTax)!==0||Number(r.serviceTax)!==0;
 const hasService=Number(r.serviceCharge)!==0;
 return <section className="pos-print-receipt" aria-label="Cash sale receipt">
  <header className="pos-receipt-company">
   <h3>{r.registeredName||r.companyName}</h3>
   {r.ssmNumber&&<p>SSM: {r.ssmNumber}{r.ssmOldNumber?` (${r.ssmOldNumber})`:''}</p>}
   {address.map((line,i)=><p key={i}>{line}</p>)}
   {r.phone&&<p>Tel: {r.phone}</p>}
   {r.email&&<p>{r.email}</p>}
   {r.salesTaxNumber&&<p>Sales Tax Registration: {r.salesTaxNumber}</p>}
   {r.serviceTaxNumber&&<p>Service Tax Registration: {r.serviceTaxNumber}</p>}
  </header>
  <h3 className="pos-receipt-title">RECEIPT</h3>
  <div className="pos-receipt-section pos-receipt-metadata">
   <div><span>Receipt No.</span><span>:</span><span>{r.receiptNumber}</span></div>
   <div><span>Date</span><span>:</span><span>{dateMalaysia(r.postedAtUtc)}</span></div>
   <div><span>Branch</span><span>:</span><span>{r.branchName}</span></div>
   <div><span>Cashier</span><span>:</span><span>{r.cashierName}</span></div>
  </div>
  <div className="pos-receipt-section pos-receipt-products">
   <div className="pos-receipt-products-head"><strong>Item / Qty × Unit Price</strong><strong>MYR</strong></div>
   {r.lines.map((line,index)=><div key={`${line.product_id||line.sku||index}-${index}`} className="pos-receipt-product">
    <div><span>{index+1}. {line.product_name}</span><strong>{asMoney(line.line_total)}</strong></div>
    <div className="pos-receipt-product-detail">{number(line.quantity)} {line.unit_code||'EA'} × {number(line.unit_price)}</div>
   </div>)}
  </div>
  <div className="pos-receipt-section pos-receipt-totals">
   <Line label="Subtotal" value={r.subtotal}/>
   {hasTax&&Number(r.salesTax)!==0&&<Line label="Sales Tax" value={r.salesTax}/>}
   {hasTax&&Number(r.serviceTax)!==0&&<Line label="Service Tax" value={r.serviceTax}/>}
   {hasService&&<Line label="Service Charge" value={r.serviceCharge}/>}
   <Line label="Total Before Rounding" value={(Number(r.total)-Number(r.roundingAdjustment)).toFixed(2)}/>
   <Line label="Rounding" value={r.roundingAdjustment}/>
   <div className="pos-receipt-total"><strong>Grand Total (MYR)</strong><strong>{asMoney(r.total)}</strong></div>
  </div>
  <div className="pos-receipt-section pos-receipt-cash">
   <strong>CASH</strong>
   <Line label="Amount Paid" value={r.total}/>
   <Line label="Cash Tendered" value={r.cashReceived}/>
   <Line label="Change" value={r.cashChange}/>
  </div>
  <footer className="pos-receipt-footer">Thank you.</footer>
 </section>;
}

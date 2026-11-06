// An immutable receipt number is assigned when the sale is posted, never at print time.
// Format explicitly requested: YYYYMMHHMM + sale ID (at least 4 digits), e.g.
// 2026 November, 12:20, sale 5 -> 20261112200005. There is NO day in this format.
// Retaining the FULL sale ID prevents collisions when the ID exceeds 9999.
const receiptError=code=>Object.assign(new Error(code),{status:409});
export const FEATURE_037='pos_receipt_number_r216_037';
export function legacyReceiptNumber(saleId){
 const id=String(saleId);
 if(!/^[1-9]\d*$/.test(id))throw receiptError('POS_RECEIPT_ID_INVALID');
 return `POS-${id.padStart(9,'0')}`;
}
export function formatPosReceiptNumber(prefix,saleId){
 if(typeof prefix!=='string'||!/^\d{10}$/.test(prefix))throw receiptError('POS_RECEIPT_PREFIX_INVALID');
 const id=String(saleId);
 if(!/^[1-9]\d*$/.test(id)||id.length>20)throw receiptError('POS_RECEIPT_ID_INVALID');
 // Prefix comes from the sale's immutable database DATETIME, not a client clock.
 return `${prefix}${id.padStart(4,'0')}`;
}
export async function assignPosReceiptNumber(conn,saleId){
 const [[sale]]=await conn.execute("SELECT receipt_number,DATE_FORMAT(posted_at,'%Y%m%H%i') AS receipt_prefix FROM pos_sales WHERE id=? FOR UPDATE",[saleId]);
 if(!sale)throw receiptError('POS_RECEIPT_SALE_NOT_FOUND');
 if(sale.receipt_number)return String(sale.receipt_number);
 const value=formatPosReceiptNumber(sale.receipt_prefix,saleId);
 const [result]=await conn.execute('UPDATE pos_sales SET receipt_number=? WHERE id=? AND receipt_number IS NULL',[value,saleId]);
 if(result.affectedRows!==1)throw receiptError('POS_RECEIPT_CONCURRENT_MODIFICATION');
 return value;
}

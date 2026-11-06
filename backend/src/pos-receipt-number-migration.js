// Pure preflight for the additive, tenant-local receipt number migration 037.
export const FEATURE_037='pos_receipt_number_r216_037';
export const INDEX_037='uq_pos_sales_receipt_number';
export function assessReceiptNumber037({hasSaleTable,has036,markerRecorded,column,indexRows=[]}){
 const missingColumn=!column,invalid=[];
 if(column){
  if(String(column.type).toLowerCase()!=='varchar(40)'||String(column.nullable).toUpperCase()!=='YES'||column.defaultValue!==null||String(column.charset).toLowerCase()!=='ascii'||String(column.collation).toLowerCase()!=='ascii_bin')invalid.push('RECEIPT_NUMBER_COLUMN_INCOMPATIBLE');
 }
 const indexPresent=indexRows.length>0;
 if(indexPresent&&!(indexRows.length===1&&Number(indexRows[0].nonUnique)===0&&Number(indexRows[0].sequence)===1&&String(indexRows[0].column).toLowerCase()==='receipt_number'))invalid.push('RECEIPT_NUMBER_INDEX_INCOMPATIBLE');
 if(missingColumn&&indexPresent)invalid.push('RECEIPT_NUMBER_INDEX_WITHOUT_COLUMN');
 const blockers=[...(!hasSaleTable?['POS_024_REQUIRED']:[]),...(!has036?['POS_036_REQUIRED']:[]),...invalid];
 const repairable=blockers.length===0;
 const current=repairable&&!missingColumn&&indexPresent&&markerRecorded===true;
 return {current,repairable,markerRecorded:markerRecorded===true,missingColumn,missingIndex:!indexPresent,blockers};
}

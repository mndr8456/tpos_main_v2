// Keep each attendance day together and order Staff No. numerically within it.
// Run this before applying the page-size limit so Search, Filter and PDF agree.
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export function compareAttendanceRows(a,b){
 const dateA=String(a?.attendance_date??'').slice(0,10);
 const dateB=String(b?.attendance_date??'').slice(0,10);
 if(dateA!==dateB)return dateA<dateB?1:-1; // Newest day first.
 const staffResult=collator.compare(String(a?.staff_no??''),String(b?.staff_no??''));
 if(staffResult)return staffResult;
 const sessionResult=Number(a?.session_no||0)-Number(b?.session_no||0);
 if(sessionResult)return sessionResult;
 return collator.compare(String(a?.id??''),String(b?.id??''));
}

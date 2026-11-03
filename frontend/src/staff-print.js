// One A4 layout for existing Staff Profile and manually completed Blank Staff Form.
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const sections=[
 ['User & Staff Identity',[['Staff No.','staff_no'],['Full Name','full_name'],['No. IC (12 Digits)','ic_no'],['Phone No.','phone'],['Email','email'],['Role','role_code']]],
 ['Residential Address',[['Address Line 1','address_line_1'],['Address Line 2','address_line_2'],['Address Line 3','address_line_3'],['Postcode','postcode'],['City','city'],['State','state_name'],['Country Code','country_code']]],
 ['Emergency Contact',[['Emergency Contact Name','emergency_contact_name'],['Relationship','emergency_contact_relationship'],['Emergency Phone No.','emergency_contact_phone']]],
 ['Statutory Information',[['EPF No.','epf_no'],['SOCSO No.','socso_no'],['EIS No.','eis_no'],['Income Tax No.','income_tax_no']]],
 ['Bank Information',[['Bank Name','bank_name'],['Bank Account Name','bank_account_name'],['Bank Account No.','bank_account_no']]],
 ['Employment Information',[['Job Title','job_title'],['Department','department'],['Employment Type','employment_type'],['Join Date','join_date'],['Confirmation Date','confirmation_date'],['Resignation Date','resignation_date'],['Employment Status','employment_status'],['Record Status','status']]],
 ['Salary & Working Standard',[['Salary Type','salary_type'],['Basic Salary (RM)','basic_salary'],['Overtime Rate / Hour (RM)','overtime_rate_per_hour'],['Working Hours / Day','standard_working_hours_per_day'],['Working Days / Month','standard_working_days_per_month']]],
 ['Notes',[['Internal HR Notes','notes']]]
];
export function staffFormHtml(staff,{blank=false,businessName='',imageDataUrl=''}={}){
 const value=(key)=>blank?'':escape(staff?.[key]??'');
 const avatar=!blank&&imageDataUrl?`<img class="portrait" src="${escape(imageDataUrl)}" alt="Staff image"/>`:'<div class="portrait placeholder">PHOTO</div>';
 const blocks=sections.map(([heading,fields],index)=>`<section class="block"><h2>${escape(heading)}</h2>${index===0?`<div class="portrait-wrap">${avatar}</div>`:''}<div class="field-grid">${fields.map(([label,key])=>`<div class="field"><span>${escape(label)}</span><div class="answer${blank?' blank':''}">${value(key)||'&nbsp;'}</div></div>`).join('')}</div></section>`).join('');
 return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${blank?'Blank Staff Form':'Staff Profile Form'}</title><style>
 @page{size:A4 portrait;margin:13mm 14mm}html,body{padding:0;margin:0;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:10.5pt}header{text-align:center;margin-bottom:12px;border-bottom:2px solid #111827;padding-bottom:10px}header strong{display:block;font-size:15pt}header h1{font-size:13pt;margin:7px 0 0}.block{border:1px solid #cbd5e1;border-radius:7px;margin:11px 0;padding:10px 12px;break-inside:avoid;page-break-inside:avoid}.block h2{font-size:11pt;margin:0 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:5px}.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 15px}.field{min-width:0}.field span{display:block;font-size:8.5pt;color:#475569;margin:0 0 4px}.answer{font-size:10pt;min-height:15px;overflow-wrap:anywhere;padding-bottom:4px;border-bottom:1px solid #9ca3af}.answer.blank{min-height:20px}.portrait-wrap{float:right;margin:0 2px 8px 12px}.portrait{width:68px;height:84px;object-fit:cover;border:1px solid #94a3b8;border-radius:3px;display:block}.portrait.placeholder{display:flex;align-items:center;justify-content:center;font-size:8pt;color:#94a3b8}.block:first-of-type .field-grid{margin-right:84px}.block:after{content:"";display:block;clear:both}footer{font-size:8pt;text-align:center;color:#64748b;margin-top:14px}@media screen{body{max-width:210mm;margin:15px auto;padding:14mm;box-shadow:0 4px 22px #d6dbe2}}@media print{footer{position:relative}}
 </style></head><body><header><strong>${escape(businessName||'Business Name')}</strong><h1>${blank?'BLANK STAFF FORM':'STAFF PROFILE FORM'}</h1></header>${blocks}<footer>HR / Staff Profile · ${blank?'Blank form for manual completion':'Confidential personnel document'}</footer></body></html>`;
}
export function openStaffPrint(staff,options={}){
 const w=options.targetWindow||window.open('','_blank','width=980,height=860');if(!w)throw new Error('POPUP_BLOCKED_ENABLE_PRINT');
 w.document.open();w.document.write(staffFormHtml(staff,options));w.document.close();
 w.onload=()=>w.print();
}
export const blankStaffPrintFields=sections;

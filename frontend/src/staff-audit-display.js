// Present immutable Staff Profile audit metadata as readable descriptions.
// Never display raw JSON, field values, or identifying numbers in the audit log.
const fieldSections = {
  address_line_1:'Residential Address',address_line_2:'Residential Address',address_line_3:'Residential Address',
  postcode:'Residential Address',city:'Residential Address',state_name:'Residential Address',country_code:'Residential Address',
  emergency_contact_name:'Emergency Contact',emergency_contact_relationship:'Emergency Contact',emergency_contact_phone:'Emergency Contact',
  epf_no:'Statutory Information',socso_no:'Statutory Information',eis_no:'Statutory Information',income_tax_no:'Statutory Information',
  bank_name:'Bank Information',bank_account_name:'Bank Information',bank_account_no:'Bank Information',
  ic_no:'User & Staff Identity',
  job_title:'Employment Information',department:'Employment Information',employment_type:'Employment Information',
  join_date:'Employment Information',confirmation_date:'Employment Information',resignation_date:'Employment Information',
  employment_status:'Employment Information',status:'Employment Information',
  salary_type:'Salary & Working Standard',basic_salary:'Salary & Working Standard',
  overtime_rate_per_hour:'Salary & Working Standard',standard_working_hours_per_day:'Salary & Working Standard',
  standard_working_days_per_month:'Salary & Working Standard',
  notes:'Notes'
};
const sectionOrder=['User & Staff Identity','Residential Address','Emergency Contact','Statutory Information','Bank Information','Employment Information','Salary & Working Standard','Notes'];
const actions={
  CREATE:'Staff profile created.',
  UPDATE:'Staff profile saved.',
  SELF_UPDATE:'Staff member updated their own profile.',
  STATUS_CHANGE:'Staff record status updated.',
  IMAGE_UPDATE:'Staff image updated.',
  IMAGE_REMOVED:'Staff image removed.',
  IMPORT_CREATE:'Staff profile imported.'
};
export function formatStaffAuditDetails(action, details){
  const type=String(action||'').toUpperCase();
  const intro=actions[type]||'Staff profile activity recorded.';
  if(type==='IMAGE_UPDATE'||type==='IMAGE_REMOVED')return intro;
  let payload=details;
  if(typeof payload==='string'){
    try{payload=JSON.parse(payload);}catch{return intro;}
  }
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return intro;
  const submitted=Array.isArray(payload.fields)?payload.fields:[];
  const sections=new Set(submitted.filter(key=>typeof key==='string').map(key=>fieldSections[key]).filter(Boolean));
  const ordered=sectionOrder.filter(section=>sections.has(section));
  const notes=[];
  // A full PUT submits every Staff Profile field. Do not claim every value changed.
  if(ordered.length)notes.push(`Sections submitted: ${ordered.join(', ')}.`);
  if(payload.sensitiveChanged===true)notes.push('Sensitive information included; values are hidden.');
  return [intro,...notes].join(' ');
}

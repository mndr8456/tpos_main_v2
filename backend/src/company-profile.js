import {z} from 'zod';
import {centralPool,quoteIdentifier,tenantDatabase} from './database.js';
import {settings} from './config.js';

const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const str=max=>z.string().trim().max(max);
const schema=z.object({
 businessName:str(220).min(1),tradingName:str(220),
 businessType:z.enum(['RESTAURANT','GROCERY','RETAIL','MINI_MARKET','CAFE','FOOD_TRUCK','STREET_FOOD']),
 ssmRegistrationNumber:str(100).min(1),ssmOldRegistrationNumber:str(100),
 phone:str(40),email:z.email().max(254),addressLine1:str(255).min(1),addressLine2:str(255),
 addressLine3:str(255),postcode:str(20).min(1),city:str(120).min(1),
 state:str(120).min(1),country:z.string().regex(/^[A-Z]{2}$/),tin:str(80)
}).strict();
const query=`SELECT p.registered_name AS businessName,p.trading_name AS tradingName,p.business_type AS businessType,
 p.phone,p.email,p.address_line1 AS addressLine1,p.address_line2 AS addressLine2,
 p.address_line3 AS addressLine3,p.postcode,p.city,p.state,p.country,p.currency,p.timezone,
 r.ssm_registration_number AS ssmRegistrationNumber,r.ssm_old_registration_number AS ssmOldRegistrationNumber,
 r.tin,r.sst_sales_tax_number AS sstSalesTaxNumber,r.sst_service_tax_number AS sstServiceTaxNumber
 FROM company_profiles p JOIN company_registrations r ON r.id=p.id WHERE p.id=1`;
const normalize=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v??'']));
const mayEdit=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('company_profile.manage');

export async function getCompanyProfile(req,res){
 const [[row]]=await req.auth.pool.execute(query);
 if(!row)throw fail('COMPANY_PROFILE_NOT_FOUND',409);
 return res.set('Cache-Control','no-store').json({profile:normalize(row),canManage:mayEdit(req)});
}
export async function updateCompanyProfile(req,res){
 if(!mayEdit(req))throw fail('COMPANY_PROFILE_MANAGE_REQUIRED',403);
 const data=schema.parse(req.body);
 // Same MySQL/InnoDB transaction updates both central identity and tenant registration.
 // Never commit a renamed tenant identity on one database without the other.
 const tenantDb=quoteIdentifier(tenantDatabase(req.auth.tenantId));
 const centralDb=quoteIdentifier(settings.central);
 const conn=await centralPool().getConnection();
 try{
  await conn.beginTransaction();
  const [[central]]=await conn.execute(`SELECT id,business_name,business_type FROM ${centralDb}.tenants WHERE id=? AND status='ACTIVE' FOR UPDATE`,[req.auth.tenantId]);
  if(!central)throw fail('COMPANY_PROFILE_TENANT_NOT_ACTIVE',409);
  const [[before]]=await conn.execute(`${query.replaceAll('company_profiles p',`${tenantDb}.company_profiles p`).replaceAll('company_registrations r',`${tenantDb}.company_registrations r`)} FOR UPDATE`);
  if(!before)throw fail('COMPANY_PROFILE_NOT_FOUND',409);
  if(central.business_name!==before.businessName||central.business_type!==before.businessType)throw fail('COMPANY_IDENTITY_OUT_OF_SYNC',409);
  await conn.execute(`UPDATE ${tenantDb}.company_profiles SET registered_name=?,trading_name=?,business_type=?,phone=?,email=?,address_line1=?,address_line2=?,
   address_line3=?,postcode=?,city=?,state=?,country=? WHERE id=1`,
   [data.businessName,data.tradingName||null,data.businessType,data.phone||null,data.email.trim().toLowerCase(),data.addressLine1,data.addressLine2||null,
   data.addressLine3||null,data.postcode,data.city,data.state,data.country]);
  await conn.execute(`UPDATE ${tenantDb}.company_registrations SET ssm_registration_number=?,ssm_old_registration_number=?,tin=? WHERE id=1`,
   [data.ssmRegistrationNumber,data.ssmOldRegistrationNumber||null,data.tin||null]);
  await conn.execute(`UPDATE ${centralDb}.tenants SET business_name=?,business_type=? WHERE id=?`,[data.businessName,data.businessType,req.auth.tenantId]);
  const [[after]]=await conn.execute(query.replaceAll('company_profiles p',`${tenantDb}.company_profiles p`).replaceAll('company_registrations r',`${tenantDb}.company_registrations r`));
  await conn.execute(`INSERT INTO ${tenantDb}.company_profile_audit_logs(actor_user_id,previous_data,next_data,recorded_at) VALUES(?,?,?,UTC_TIMESTAMP(6))`,
   [req.auth.user.id,JSON.stringify(normalize(before)),JSON.stringify(normalize(after))]);
  await conn.commit();
  return res.set('Cache-Control','no-store').json({profile:normalize(after)});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function getCompanyProfileAudit(req,res){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code))throw fail('COMPANY_PROFILE_AUDIT_FORBIDDEN',403);
 const [rows]=await req.auth.pool.execute(`SELECT a.id,u.full_name AS actorName,
 DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recordedAt,a.previous_data AS previousData,a.next_data AS nextData
 FROM company_profile_audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 100`);
 return res.set('Cache-Control','no-store').json({logs:rows.map(r=>({...r,id:String(r.id)}))});
}

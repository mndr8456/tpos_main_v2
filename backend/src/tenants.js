import { z } from 'zod';
import { adminPool, centralPool, executeSchema, quoteIdentifier, tenantDatabase, tenantPool } from './database.js';
import { hashPassword } from './passwords.js';
const required=z.string().trim().min(1).max(220);
const optional=(max)=>z.string().trim().max(max).optional().default('');
export const registrationSchema=z.object({
  businessName:required, businessType:z.enum(['RESTAURANT','GROCERY','RETAIL','MINI_MARKET','CAFE','FOOD_TRUCK','STREET_FOOD']),
  ssmRegistrationNumber:z.string().trim().min(1).max(100),ssmOldRegistrationNumber:optional(100),tin:optional(80),sstSalesTaxNumber:optional(80),sstServiceTaxNumber:optional(80),
  phone:optional(40),addressLine1:required,addressLine2:optional(255),city:z.string().trim().min(1).max(120),postcode:z.string().trim().min(1).max(20),state:z.string().trim().min(1).max(120),
  ownerName:z.string().trim().min(2).max(160),ownerEmail:z.email().max(254).transform(v=>v.trim().toLowerCase()),ownerPassword:z.string().min(12).max(128)
}).strict();
const seedProfile=async (db,data,passwordHash)=>{
 const pool=tenantPool(db.id); const conn=await pool.getConnection();
 try {
  await conn.beginTransaction();
  await conn.execute(`INSERT INTO company_profiles (id,registered_name,business_type,phone,email,address_line1,address_line2,city,postcode,state) VALUES(1,?,?,?,?,?,?,?,?,?)`,
   [data.businessName,data.businessType,data.phone||null,data.ownerEmail,data.addressLine1,data.addressLine2||null,data.city,data.postcode,data.state]);
  await conn.execute(`INSERT INTO company_registrations (id,ssm_registration_number,ssm_old_registration_number,tin,sst_sales_tax_number,sst_service_tax_number) VALUES(1,?,?,?,?,?)`,
   [data.ssmRegistrationNumber,data.ssmOldRegistrationNumber||null,data.tin||null,data.sstSalesTaxNumber||null,data.sstServiceTaxNumber||null]);
  const [branch]=await conn.execute('INSERT INTO branches(code,name) VALUES(?,?)',['MAIN','Main Branch']);
  const username=(data.ownerEmail.split('@')[0].replace(/[^a-z0-9._-]/g,'').slice(0,60)||'owner');
  const [owner]=await conn.execute('INSERT INTO users(full_name,username,email,password_hash) VALUES(?,?,?,?)',[data.ownerName,username,data.ownerEmail,passwordHash]);
  await conn.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='OWNER'`,[owner.insertId]);
  await conn.execute('INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)',[owner.insertId,branch.insertId]);
  await conn.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES(?,?,'OWNER_PROVISIONED',JSON_OBJECT('source','tenant_registration'))`,[owner.insertId,owner.insertId]);
  await conn.commit();
  return owner.insertId;
 } catch(e){ await conn.rollback();throw e; } finally{conn.release();}
};
export async function registerTenant(request,response) {
 const data=registrationSchema.parse(request.body);
 const passwordHash=await hashPassword(data.ownerPassword);
 const cp=centralPool();
 const [existing]=await cp.execute('SELECT id FROM tenants WHERE owner_email=? LIMIT 1',[data.ownerEmail]);
 if(existing.length) return response.status(409).json({error:'EMAIL_ALREADY_REGISTERED'});
 let id=null;
 try {
  const [result]=await cp.execute('INSERT INTO tenants(business_name,business_type,owner_email) VALUES(?,?,?)',[data.businessName,data.businessType,data.ownerEmail]);
  id=result.insertId;
  const dbName=tenantDatabase(id);
  await cp.execute('UPDATE tenants SET db_name=? WHERE id=?',[dbName,id]);
  await adminPool().query(`CREATE DATABASE ${quoteIdentifier(dbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await executeSchema(dbName,'002_tenant_foundation.sql');
  await executeSchema(dbName,'003_tenant_users.sql');
  await executeSchema(dbName,'004_tenant_categories.sql');
  await executeSchema(dbName,'005_tenant_dashboard.sql');
  await executeSchema(dbName,'006_tenant_suppliers.sql');
  await executeSchema(dbName,'007_tenant_products.sql');
  await executeSchema(dbName,'008_tenant_product_r3.sql');
  await executeSchema(dbName,'009_tenant_discounts.sql');
  await executeSchema(dbName,'010_tenant_discount_role_permissions.sql');
  await executeSchema(dbName,'011_tenant_dashboard_accountant_supervisor.sql');
  await executeSchema(dbName,'012_tenant_vouchers.sql');
  await executeSchema(dbName,'013_tenant_cash_shifts.sql');
  await executeSchema(dbName,'014_tenant_cash_drawer_logs.sql');
  await executeSchema(dbName,'015_tenant_product_kpdn.sql');
  await executeSchema(dbName,'016_tenant_payment_methods.sql');
  await executeSchema(dbName,'017_tenant_pos_drafts.sql');
  await executeSchema(dbName,'018_tenant_sst_settings.sql');
  await executeSchema(dbName,'019_tenant_service_charge_settings.sql');
  await executeSchema(dbName,'020_tenant_discount_print_settings.sql');
  await executeSchema(dbName,'021_tenant_restaurant_tables.sql');
  await executeSchema(dbName,'022_tenant_inventory_foundation.sql');
  await executeSchema(dbName,'023_tenant_inventory_two_decimals.sql');
  await executeSchema(dbName,'024_tenant_pos_cash_checkout.sql');
  await executeSchema(dbName,'025_tenant_staff_profiles.sql');
  const userId=await seedProfile({id},data,passwordHash);
  await cp.execute('INSERT INTO login_directory(email,tenant_id,tenant_user_id) VALUES(?,?,?)',[data.ownerEmail,id,userId]);
  await cp.execute(`UPDATE tenants SET status='ACTIVE',activated_at=UTC_TIMESTAMP(6) WHERE id=?`,[id]);
  return response.status(201).json({message:'TENANT_REGISTERED',businessName:data.businessName,loginEmail:data.ownerEmail});
 } catch(error){
  if(id) await cp.execute(`UPDATE tenants SET status='FAILED',last_error='Provisioning failed; administrator review required' WHERE id=?`,[id]).catch(()=>{});
  if(error.code==='ER_DUP_ENTRY') return response.status(409).json({error:'EMAIL_ALREADY_REGISTERED'});
  console.error('Tenant provisioning failed',{code:error.code || 'UNKNOWN',tenantId:id});
  return response.status(500).json({error:'PROVISIONING_FAILED',message:'No existing tenant or database was removed. Ask administrator to review server logs.'});
 }
}

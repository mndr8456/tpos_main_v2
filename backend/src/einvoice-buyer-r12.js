// Data capture mirrors MyInvois Invoice v1.1 Buyer and Address fields.
// This module does NOT construct or submit a UBL document.
import {z} from 'zod';
import {MYINVOIS_COUNTRIES} from './einvoice-country-codes-r12.js';
export const MALAYSIA_STATES=Object.freeze(['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16']);
// Exact SDK country-code whitelist from published country list.
export const SUPPORTED_COUNTRIES=Object.freeze(MYINVOIS_COUNTRIES.map(([code])=>code));
const value=(max)=>z.string().trim().min(1).max(max);
const optional=(max)=>z.string().trim().max(max).default('');
export const buyerRequestSchema=z.object({
 buyerType:z.enum(['INDIVIDUAL','COMPANY']),
 buyerName:value(300),tin:value(14),
 identificationType:z.enum(['NRIC','BRN','PASSPORT','ARMY']),
 identificationNumber:value(20),
 sstNumber:optional(35),email:optional(320),phone:value(20),
 address1:value(150),address2:optional(150),address3:optional(150),
 postcode:optional(50),city:value(50),state:value(50),country:z.enum(SUPPORTED_COUNTRIES),
 consent:z.literal(true)
}).strict().superRefine((data,ctx)=>{
 const max=data.identificationType==='BRN'?20:12;
 if(data.identificationNumber.length>max)ctx.addIssue({code:'custom',path:['identificationNumber'],message:`Maximum ${max} characters for ${data.identificationType}`});
 if(data.buyerType==='COMPANY'&&data.identificationType!=='BRN')ctx.addIssue({code:'custom',path:['identificationType'],message:'Company requires BRN'});
 if(data.buyerType==='INDIVIDUAL'&&data.identificationType==='BRN')ctx.addIssue({code:'custom',path:['identificationType'],message:'Individual requires NRIC, PASSPORT or ARMY'});
 if(data.country==='MYS'&&!MALAYSIA_STATES.includes(data.state))ctx.addIssue({code:'custom',path:['state'],message:'Use a valid Malaysia State Code (01–16)'});
 if(data.country!=='MYS'&&data.state==='17'){} // SDK: Not Applicable for foreign addresses.
 if(data.email&&!z.email().safeParse(data.email).success)ctx.addIssue({code:'custom',path:['email'],message:'Invalid email address'});
 if(!/^\+[1-9][0-9]{1,14}$/.test(data.phone))ctx.addIssue({code:'custom',path:['phone'],message:'Use E.164 format e.g. +60123456789'});
 if(data.sstNumber&&!/^[A-Za-z0-9;-]+$/.test(data.sstNumber))ctx.addIssue({code:'custom',path:['sstNumber'],message:'Invalid SST registration format'});
});
export function publicRequestBaseUrl(raw=process.env.EINVOICE_REQUEST_PUBLIC_BASE_URL){
 if(!raw)return null;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname==='127.0.0.1'||u.hostname==='0.0.0.0')return null;return u.origin;}
 catch{return null;}
}

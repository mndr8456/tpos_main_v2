// HR Leave Requests R1: all dates are Malaysian-local ISO calendar dates, no JS timezone arithmetic.
import {z} from 'zod';
import {fail} from './leave-request-engine.js';
export {LeaveRequestError,fail,leavePeriod,dayCents,centsDays} from './leave-request-engine.js';
export const requestInput=z.object({
 staff_profile_id:z.coerce.number().int().positive(),leave_type_id:z.coerce.number().int().positive(),
 start_date:z.string(),end_date:z.string(),duration_type:z.enum(['Full Day','Half Day']),
 half_day_period:z.enum(['First Half','Second Half']).nullable().optional(),
 reason:z.string().trim().min(4).max(5000),emergency_contact_no:z.string().trim().max(30).optional().default(''),
 handover_notes:z.string().trim().max(5000).optional().default(''),
 keep_attachment_ids:z.array(z.coerce.number().int().positive()).max(5).optional(),
 attachments:z.array(z.object({file_name:z.string().trim().min(1).max(200),mime:z.enum(['application/pdf','image/jpeg','image/png']),base64:z.string().min(4).max(14_000_000),attachment_type:z.enum(['Medical Certificate','Supporting Document'])}).strict()).max(5).default([])
}).strict();
export function validateAttachments(raw){if(raw.length>5)fail('ATTACHMENT_MAX_5_FILES',422);return raw.map(a=>{
 if(!/^[A-Za-z0-9 ._()\-]{1,200}$/.test(a.file_name)||a.file_name.includes('..'))fail('INVALID_ATTACHMENT_NAME',422);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64)||a.base64.length%4!==0)fail('INVALID_ATTACHMENT_BASE64',422);
 const bytes=Buffer.from(a.base64,'base64');if(!bytes.length||bytes.length>10*1024*1024)fail('ATTACHMENT_SIZE_EXCEEDED',422);
 const isPdf=bytes.subarray(0,5).toString()==='%PDF-',isJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!(a.mime==='application/pdf'&&isPdf||a.mime==='image/jpeg'&&isJpeg||a.mime==='image/png'&&isPng))fail('ATTACHMENT_CONTENT_MISMATCH',422);
 return {...a,bytes};
});}

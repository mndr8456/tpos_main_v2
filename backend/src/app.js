import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ZodError } from 'zod';
import { settings } from './config.js';
import { registerTenant } from './tenants.js';
import { login, authenticate, permitted, me, logout, changePassword } from './auth.js';
import { userMeta,listUsers,createUser,updateUser,unlockUser,resetUserPassword,listAudit } from './users.js';
import { previewUsersImport,importUsers,userCsvTemplate } from './users-import.js';

export function createApp(){
 const app=express();
 app.disable('x-powered-by');
 app.use(helmet());
 app.use(cors({origin:settings.origin,credentials:true}));
 app.use(express.json({limit:'320kb'}));
 app.use((req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.headers.origin;
   if(origin && origin!==settings.origin) return res.status(403).json({error:'INVALID_ORIGIN'});
   if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/json')return res.status(415).json({error:'JSON_REQUIRED'});
  }
  next();
 });
 app.get('/api/v2/health',(_req,res)=>res.json({status:'OK',build:'TPOS_V2_CLEAN_R1'}));
 app.post('/api/v2/tenants/register',registerTenant);
 app.post('/api/v2/auth/login',login);
 app.get('/api/v2/auth/me',authenticate,me);
 app.post('/api/v2/auth/logout',authenticate,logout);
 app.post('/api/v2/auth/change-password',authenticate,changePassword);
 app.get('/api/v2/users/meta',authenticate,permitted('users.view'),userMeta);
 app.get('/api/v2/users',authenticate,permitted('users.view'),listUsers);
 app.post('/api/v2/users',authenticate,permitted('users.manage'),createUser);
 app.get('/api/v2/users/import/template',authenticate,permitted('users.manage'),(_req,res)=>res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('users-import-template.csv').send(userCsvTemplate()));
 app.post('/api/v2/users/import/preview',authenticate,permitted('users.manage'),previewUsersImport);
 app.post('/api/v2/users/import',authenticate,permitted('users.manage'),importUsers);
 app.put('/api/v2/users/:id',authenticate,permitted('users.manage'),updateUser);
 app.post('/api/v2/users/:id/unlock',authenticate,permitted('users.manage'),unlockUser);
 app.post('/api/v2/users/:id/password-reset',authenticate,permitted('users.manage'),resetUserPassword);
 app.get('/api/v2/users/audit/logs',authenticate,permitted('users.audit'),listAudit);
 app.use((_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 app.use((error,_req,res,_next)=>{
  if(error instanceof ZodError)return res.status(400).json({error:'VALIDATION_FAILED',issues:error.issues.map(x=>({field:x.path.join('.'),message:x.message}))});
  if(error.status)return res.status(error.status).json({error:error.message});
  console.error('REQUEST_FAILED',{code:error.code || 'INTERNAL_ERROR',message:error.message});
  return res.status(500).json({error:'INTERNAL_ERROR'});
 });
 return app;
}

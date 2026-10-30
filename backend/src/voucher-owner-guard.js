// Owner-only paper dimensions, independent of manually granted permissions.
export async function voucherOwnerOnly(req,res,next){try{
 const [rows]=await req.auth.pool.execute("SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code='OWNER' LIMIT 1",[req.auth.user.id]);
 if(!rows.length)return res.status(403).json({error:'VOUCHER_OWNER_REQUIRED'});
 return next();
}catch(e){return next(e);}}

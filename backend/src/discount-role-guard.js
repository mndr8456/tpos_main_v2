// Authority is checked against tenant DB membership on every privileged Discount request.
// A stale/manual grant or a separate custom role alone cannot authorize Discount management.
export async function discountOwnerAdminOnly(req,res,next){
 try{
  const [roles]=await req.auth.pool.execute(`SELECT r.code FROM user_roles AS ur
   JOIN roles AS r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code IN ('OWNER','ADMIN') LIMIT 1`,[req.auth.user.id]);
  if(!roles.length)return res.status(403).json({error:'DISCOUNT_OWNER_ADMIN_REQUIRED'});
  return next();
 }catch(error){return next(error);}
}


// Paper configuration belongs to the tenant OWNER, even if an ADMIN is granted discounts.update.
export async function discountOwnerOnly(req,res,next){
 try{
  const [rows]=await req.auth.pool.execute("SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code='OWNER' LIMIT 1",[req.auth.user.id]);
  if(!rows.length)return res.status(403).json({error:'DISCOUNT_OWNER_REQUIRED'});
  return next();
 }catch(e){return next(e);}
}

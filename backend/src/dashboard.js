// Dashboard reads data only from the authenticated tenant database.
// No invented sales, stock, or product metrics: those modules are not implemented yet.
const numeric=value=>Number(value??0);
const unavailable=reason=>({available:false,reason});
export async function dashboardOverview(req,res){
 const pool=req.auth.pool;
 const [[userStats]]=await pool.execute(`SELECT
  COUNT(*) AS total,
  COALESCE(SUM(status='ACTIVE'),0) AS active,
  COALESCE(SUM(status='INACTIVE'),0) AS inactive,
  COALESCE(SUM(locked_until>UTC_TIMESTAMP(6)),0) AS locked
  FROM users`);
 const [[categoryStats]]=await pool.execute(`SELECT
  COUNT(*) AS total,
  COALESCE(SUM(status='ACTIVE'),0) AS active,
  COALESCE(SUM(status='INACTIVE'),0) AS inactive
  FROM categories WHERE is_deleted=0`);
 const [[stationStats]]=await pool.execute('SELECT COUNT(*) AS active FROM preparation_stations WHERE is_active=1');
 const [[branchStats]]=await pool.execute('SELECT COUNT(*) AS total,COALESCE(SUM(is_active=1),0) AS active FROM branches');
 const [activity]=await pool.execute(`SELECT a.id,a.event_type,a.created_at,
  actor.full_name AS actor_name,target.full_name AS target_name
  FROM user_activity_logs a
  LEFT JOIN users actor ON actor.id=a.actor_user_id
  LEFT JOIN users target ON target.id=a.target_user_id
  ORDER BY a.id DESC LIMIT 10`);
 res.set('Cache-Control','private, no-store');
 return res.json({
  generatedAt:new Date().toISOString(),
  users:{total:numeric(userStats.total),active:numeric(userStats.active),inactive:numeric(userStats.inactive),locked:numeric(userStats.locked)},
  categories:{total:numeric(categoryStats.total),active:numeric(categoryStats.active),inactive:numeric(categoryStats.inactive)},
  stations:{active:numeric(stationStats.active)},
  branches:{total:numeric(branchStats.total),active:numeric(branchStats.active)},
  recentUserActivity:activity.map(row=>({id:String(row.id),event:row.event_type,actor:row.actor_name||'System',target:row.target_name||null,createdAt:row.created_at})),
  // Deliberately not zeros. New tenant does not yet have these operational modules.
  sales:unavailable('SALES_MODULE_PENDING'),
  salesTrend:unavailable('SALES_MODULE_PENDING'),
  bestSellers:unavailable('PRODUCT_AND_SALES_MODULES_PENDING'),
  inventory:unavailable('INVENTORY_MODULE_PENDING')
 });
}

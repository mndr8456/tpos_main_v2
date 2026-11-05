// Page routing stays permission-driven. Default role grants are set by migration 033;
// a future Role Permissions page may change those grants without changing this map.
export const hasPermission = (profile, permission) =>
 Array.isArray(profile?.user?.permissions) && profile.user.permissions.includes(permission);

export function landingPage(profile){
 const role=String(profile?.user?.role||'').toUpperCase();
 if(role==='CASHIER' && hasPermission(profile,'pos.view'))return 'pos';
 if(role==='WAITER' && hasPermission(profile,'restaurant_tables.view') && ['RESTAURANT','CAFE'].includes(String(profile?.business?.type||'').toUpperCase()))return 'restaurant-tables';
 if(role==='STAFF' && hasPermission(profile,'inventory.view'))return 'inventory';
 if(role==='KITCHEN')return 'profile'; // KDS is planned, not a live page.
 if(hasPermission(profile,'dashboard.view'))return 'dashboard';
 if(hasPermission(profile,'pos.view'))return 'pos';
 if(hasPermission(profile,'users.view'))return 'users';
 if(hasPermission(profile,'restaurant_tables.view') && ['RESTAURANT','CAFE'].includes(String(profile?.business?.type||'').toUpperCase()))return 'restaurant-tables';
 if(hasPermission(profile,'cash_shifts.view'))return 'cash-shifts';
 if(hasPermission(profile,'inventory.view'))return 'inventory';
 if(hasPermission(profile,'attendance_clock.view'))return 'attendance-clock';
 if(hasPermission(profile,'leave_requests.self'))return 'leave-requests';
 return 'profile';
}

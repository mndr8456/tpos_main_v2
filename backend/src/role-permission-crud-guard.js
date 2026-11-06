// Granular CRUD bridge for historical `.manage` endpoint guards.
// Explicitly matched business endpoints require the granular grant, even if a
// role still holds legacy `*.manage`. Special/import/export routes are NOT bridged.
const routes = [
 ['users.manage','POST',/^\/users$/,'users.create'],
 ['users.manage','PUT',/^\/users\/[^/]+$/,'users.update'],
 ['users.manage','POST',/^\/users\/[^/]+\/(unlock|password-reset)$/,'users.update'],
 ['staff_profiles.manage','GET',/^\/staff-profiles\/next-number$/,'staff_profiles.create'],
 ['staff_profiles.manage','POST',/^\/staff-profiles$/,'staff_profiles.create'],
 ['staff_profiles.manage','PUT',/^\/staff-profiles\/[^/]+$/,'staff_profiles.update'],
 ['staff_profiles.manage','PATCH',/^\/staff-profiles\/[^/]+\/status$/,'staff_profiles.update'],
 ['attendances.manage','POST',/^\/attendances$/,'attendances.create'],
 ['attendances.manage','PUT',/^\/attendances\/[^/]+$/,'attendances.update'],
 ['attendances.manage','PATCH',/^\/attendances\/[^/]+\/status$/,'attendances.update'],
 ['leave_types.manage','POST',/^\/leave-types$/,'leave_types.create'],
 ['leave_types.manage','PUT',/^\/leave-types\/[^/]+$/,'leave_types.update'],
 ['leave_types.manage','PATCH',/^\/leave-types\/[^/]+\/status$/,'leave_types.update'],
 ['leave_balances.manage','POST',/^\/leave-balances$/,'leave_balances.create'],
 ['leave_balances.manage','PUT',/^\/leave-balances\/[^/]+$/,'leave_balances.update'],
 ['leave_balances.manage','PATCH',/^\/leave-balances\/[^/]+\/status$/,'leave_balances.update'],
 ['vouchers.manage','POST',/^\/vouchers$/,'vouchers.create'],
 ['vouchers.manage','PUT',/^\/vouchers\/[^/]+$/,'vouchers.update'],
 ['vouchers.manage','PATCH',/^\/vouchers\/[^/]+\/status$/,'vouchers.update'],
 ['vouchers.manage','DELETE',/^\/vouchers\/[^/]+$/,'vouchers.delete'],
 ['payment_methods.manage','PUT',/^\/payment-methods\/[^/]+\/[^/]+$/,'payment_methods.update'],
 ['payment_methods.manage','POST',/^\/payment-methods\/[^/]+\/[^/]+\/image$/,'payment_methods.update'],
 ['payment_methods.manage','DELETE',/^\/payment-methods\/[^/]+\/[^/]+\/image$/,'payment_methods.update'],
 ['sst_settings.manage','PUT',/^\/sst-settings\/[^/]+$/,'sst_settings.update'],
 ['service_charge.manage','PUT',/^\/service-charge$/,'service_charge.update'],
 ['pos.cart.manage','POST',/^\/pos\/drafts$/,'pos.create'],
 ['pos.cart.manage','POST',/^\/pos\/drafts\/[^/]+\/lines$/,'pos.create'],
 ['pos.cart.manage','PATCH',/^\/pos\/drafts\/[^/]+\/(lines\/[^/]+|status|table)$/,'pos.update'],
];
export function granularForRoute(code,method,path){
 const actual=path.replace(/^\/api\/v2(?=\/)/,'');
 return routes.find(([source,verb,pattern])=>source===code&&verb===method&&pattern.test(actual))?.[3]||null;
}

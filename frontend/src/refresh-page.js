/** Clear the previous page notice only for an explicit Refresh click.
 * Keep ordinary post-save data reloads from hiding success feedback.
 */
export function refreshPage(load,notify){
 if(typeof notify==='function')notify('');
 return load();
}

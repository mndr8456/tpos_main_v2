// Official MyInvois state codes: https://sdk.myinvois.hasil.gov.my/codes/state-codes/
// Names stored in Company Profile must remain unchanged. Owner confirms the code.
const names={
 '01':['JOHOR'], '02':['KEDAH'], '03':['KELANTAN'], '04':['MELAKA','MALACCA'],
 '05':['NEGERI SEMBILAN'], '06':['PAHANG'], '07':['PULAU PINANG','PENANG'],
 '08':['PERAK'], '09':['PERLIS'], '10':['SELANGOR'], '11':['TERENGGANU','TRENGGANU'],
 '12':['SABAH'], '13':['SARAWAK'],
 '14':['WILAYAH PERSEKUTUAN KUALA LUMPUR','KUALA LUMPUR','WP KUALA LUMPUR'],
 '15':['WILAYAH PERSEKUTUAN LABUAN','LABUAN','WP LABUAN'],
 '16':['WILAYAH PERSEKUTUAN PUTRAJAYA','PUTRAJAYA','WP PUTRAJAYA']
};
const normalize=s=>String(s??'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ');
export const MYINVOIS_STATES_C431=Object.freeze(Object.entries(names).map(([code,labels])=>({code,label:labels[0]})));
export function getStateCodeCandidatesC431(state,country){
 if(!['MY','MYS'].includes(normalize(country)))return [];
 const s=normalize(state);
 return Object.entries(names).filter(([,labels])=>labels.includes(s)).map(([code])=>code);
}
export function stateCodeMatchesC431(state,country,code){
 return getStateCodeCandidatesC431(state,country).includes(code);
}

// POS multi-payment migration 035 recovery: additive and fail-closed.
// No database access occurs on import. Existing ENUM entries and posted data must be preserved.
export const FEATURE_035 = 'pos_multi_payment_r21_035';
export const EXPECTED_SALE_METHODS = Object.freeze(['CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','DUITNOW_QR','EWALLET','SARA_MYKASIH']);
export const EXPECTED_JOURNAL_SOURCES = Object.freeze(['POS_CASH_SALE','POS_NONCASH_SALE']);
export const TABLE_COLUMNS = Object.freeze({
 pos_payment_attempts:['id','request_key','draft_id','branch_id','shift_id','cashier_user_id','draft_version','method_code','verification_mode','expected_total','status','payment_reference','reference_hash','verified_by','verified_at','evidence_mime','evidence_data','sale_id'],
 pos_payment_attempt_audit:['id','attempt_id','actor_user_id','event_type','details','recorded_at'],
 pos_payment_display_tokens:['token_hash','attempt_id','expires_at']
});
export const TABLE_INDEXES = Object.freeze({
 pos_payment_attempts:['PRIMARY','uq_pos_payment_attempt_request','uq_pos_payment_attempt_reference','uq_pos_payment_attempt_sale'],
 pos_payment_attempt_audit:['PRIMARY','ix_pos_payment_attempt_audit'],
 pos_payment_display_tokens:['PRIMARY']
});

// COLUMN_TYPE comes from the *actual* MySQL server, not a local migration file.
// Preserve original ENUM ordinals: changing the order can reinterpret stored ENUM values.
export function enumItems(type){
 const value=String(type??'').trim();
 if(!/^enum\s*\(/i.test(value)||!value.endsWith(')'))return [];
 const items=[];
 const body=value.slice(value.indexOf('(')+1,-1);
 const token=/'((?:''|[^'])*)'/gy;
 let i=0;
 while(i<body.length){
  while(/\s/.test(body[i]||''))i++;
  token.lastIndex=i;
  const match=token.exec(body);
  if(!match)return [];
  items.push(match[1].replaceAll("''","'"));
  i=token.lastIndex;
  while(/\s/.test(body[i]||''))i++;
  if(i<body.length){if(body[i]!==',')return [];i++;}
 }
 return items;
}
export function enumState(type,expected,legacy){
 const items=enumItems(type);
 // The first original value MUST remain first. No unknown or repeated value is safe.
 if(!items.length||items[0]!==legacy[0]||new Set(items).size!==items.length||items.some(v=>!expected.includes(v)))return 'INCOMPATIBLE';
 return expected.every(v=>items.includes(v))?'CURRENT':'LEGACY';
}
export function expandedEnumType(type,expected,legacy){
 if(enumState(type,expected,legacy)!=='LEGACY')throw Error('POS_035_ENUM_REQUIRES_MANUAL_REVIEW');
 const items=enumItems(type);
 for(const value of expected)if(!items.includes(value))items.push(value);
 // All values are guaranteed to belong to a fixed, server-independent allowlist.
 return `ENUM(${items.map(v=>`'${v}'`).join(',')})`;
}

// The SQL CHECK_CLAUSE reported by MySQL 8.4 contains server-added brackets,
// reordered AND terms, backticks, case changes, and sometimes _utf8mb4 strings.
// Parse the restricted arithmetic/boolean language and compare the expression
// tree, rather than relying on brittle substring matching. Unknown functions,
// operators or relaxed constraints always return INCOMPATIBLE.
const STRICT_SQL_TOKENS=/(?:_[a-z0-9]+)?'(?:''|[^'])*'|`(?:``|[^`])*`|>=|<=|<>|!=|=|>|<|\+|-|\(|\)|\bAND\b|\bOR\b|[0-9]+(?:\.[0-9]+)?|[a-z_][a-z0-9_]*/iy;
function sqlTokens(value){
 // Some MySQL 8.4 CHECK_CLAUSE results escape the literal quote delimiters
 // as _utf8mb4\\'CASH\\'. This is the same fixed SQL string as
 // _utf8mb4'CASH'; normalize ONLY this exact merchant payment marker.
 // All unknown escapes, values, operators and SQL expressions still fail closed.
 const s=String(value??'').trim().replace(/^CHECK\s*(?=\()/i,'')
  .replace(/\b_utf8mb4\\'CASH\\'/gi,"_utf8mb4'CASH'");
 const tokens=[];let i=0;
 while(i<s.length){
  if(/\s/.test(s[i])){i++;continue;}
  STRICT_SQL_TOKENS.lastIndex=i;
  const m=STRICT_SQL_TOKENS.exec(s);
  if(!m)return null;
  let t=m[0];i=STRICT_SQL_TOKENS.lastIndex;
  if(t[0]==='`')t=t.slice(1,-1).replaceAll('``','`').toLowerCase();
  else if(/^(?:_[a-z0-9]+)?'/i.test(t))t=`'${t.slice(t.indexOf("'")+1,-1).replaceAll("''","'").toUpperCase()}'`;
  else if(/^[0-9]/.test(t))t=String(Number(t));
  else t=t.toLowerCase();
  tokens.push(t);
 }
 return tokens;
}
const PRECEDENCE={or:1,and:2,'=':3,'<>':3,'!=':3,'>=':3,'<=':3,'>':3,'<':3,'+':4,'-':4};
function parseSqlCheck(source){
 const tokens=sqlTokens(source);if(!tokens?.length)return null;
 let index=0;
 function primary(){
  const t=tokens[index++];
  if(t==='('){const node=expression(1);if(tokens[index++]!==')')throw Error('bad-close');return node;}
  if(t===undefined||t===')'||t==='and'||t==='or'||PRECEDENCE[t])throw Error('bad-operand');
  return {op:'atom',value:t};
 }
 function expression(min){
  let left=primary();
  while(index<tokens.length){
   const op=tokens[index],p=PRECEDENCE[op];
   if(!p||p<min)break;
   index++;
   const right=expression(p+1);
   left={op:op==='!='?'<>' :op,left,right};
  }
  return left;
 }
 function normalized(node){
  if(node.op==='atom')return node.value;
  if(node.op==='and'||node.op==='or'){
   const values=[];
   function collect(v){if(v.op===node.op){collect(v.left);collect(v.right);}else values.push(normalized(v));}
   collect(node);
   return `${node.op}(${values.sort().join(',')})`;
  }
  if(node.op==='='||node.op==='<>'){
   const [a,b]=[normalized(node.left),normalized(node.right)].sort();
   return `${node.op}(${a},${b})`;
  }
  return `${node.op}(${normalized(node.left)},${normalized(node.right)})`;
 }
 try{
  const tree=expression(1);
  if(index!==tokens.length)return null;
  return normalized(tree);
 }catch{return null;}
}
const LEGACY_CHECKS=[
 'total>=0 AND cash_received>=total AND cash_change=cash_received-total AND cost_of_goods>=0',
 'total>=0 AND cash_received>=total AND cash_change=cash_received-total'
].map(parseSqlCheck);
export const NEW_SALE_CHECK="CHECK(total>=0 AND cost_of_goods>=0 AND ((payment_method='CASH' AND cash_received>=total AND cash_change=cash_received-total) OR (payment_method<>'CASH' AND cash_received=0 AND cash_change=0)))";
const CURRENT_CHECK=parseSqlCheck(NEW_SALE_CHECK);
export function cashCheckState(clause){
 if(clause==null||String(clause).trim()==='')return 'MISSING';
 const actual=parseSqlCheck(clause);
 if(!actual)return 'INCOMPATIBLE';
 if(actual===CURRENT_CHECK)return 'CURRENT';
 return LEGACY_CHECKS.includes(actual)?'LEGACY':'INCOMPATIBLE';
}
export function assess035(facts){
 const tables=Object.keys(TABLE_COLUMNS);
 const missingTables=tables.filter(t=>!facts.tables.includes(t));
 const invalidTables=[];
 for(const t of tables){
  if(!facts.tables.includes(t))continue;
  const missingColumns=TABLE_COLUMNS[t].filter(c=>!(facts.columns[t]||[]).includes(c));
  const missingIndexes=TABLE_INDEXES[t].filter(c=>!(facts.indexes[t]||[]).includes(c));
  if(missingColumns.length||missingIndexes.length)invalidTables.push({table:t,missingColumns,missingIndexes});
 }
 const saleEnum=enumState(facts.saleColumnType,EXPECTED_SALE_METHODS,['CASH']);
 const journalEnum=enumState(facts.journalColumnType,EXPECTED_JOURNAL_SOURCES,['POS_CASH_SALE']);
 const check=cashCheckState(facts.cashCheckClause);
 const blockers=[];
 if(!facts.has034)blockers.push('ROLE_PERMISSION_034_NOT_CURRENT');
 if(invalidTables.length)blockers.push('PAYMENT_TABLE_SCHEMA_MISMATCH');
 if(saleEnum==='INCOMPATIBLE')blockers.push('SALE_METHOD_ENUM_INCOMPATIBLE');
 if(journalEnum==='INCOMPATIBLE')blockers.push('JOURNAL_SOURCE_ENUM_INCOMPATIBLE');
 if(check==='INCOMPATIBLE')blockers.push('SALE_AMOUNT_CHECK_INCOMPATIBLE');
 if((facts.otherPaymentChecks||[]).length)blockers.push('OTHER_PAYMENT_CHECK_REQUIRES_MANUAL_REVIEW');
 const pending=[];
 if(missingTables.length)pending.push('CREATE_MISSING_TABLES');
 if(saleEnum==='LEGACY')pending.push('EXPAND_SALE_ENUM');
 if(check==='MISSING'||check==='LEGACY')pending.push('REPLACE_SALE_AMOUNT_CHECK');
 if(journalEnum==='LEGACY')pending.push('EXPAND_JOURNAL_ENUM');
 if(!facts.hasPermission)pending.push('REGISTER_MANUAL_PERMISSION');
 if(!facts.hasMarker)pending.push('REGISTER_035_HISTORY');
 return {current:!pending.length&&!blockers.length,repairable:!blockers.length,markerRecorded:facts.hasMarker,missingTables,invalidTables,saleEnum,journalEnum,check,permissionPresent:facts.hasPermission,historyPresent:facts.hasMarker,pending,blockers,
  // Safe to print: column definitions and constraint SQL contain no API keys or customer data.
  schema:{saleColumnType:facts.saleColumnType||null,journalColumnType:facts.journalColumnType||null,cashCheckClause:facts.cashCheckClause||null,otherPaymentChecks:facts.otherPaymentChecks||[]}};
}
// Only extract table CREATE statements, NEVER replay previous cash grants or ALTERs.
export function extract035TableCreations(sql){
 const result=new Map();
 for(const match of sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(pos_payment_attempts|pos_payment_attempt_audit|pos_payment_display_tokens)\s*\([\s\S]*?\)\s*ENGINE=InnoDB[^;]*;/gi))result.set(match[1].toLowerCase(),match[0]);
 if(result.size!==3)throw Error('POS_035_SCHEMA_SOURCE_INCOMPLETE');
 return result;
}
export const NEW_SALE_ENUM=`ENUM(${EXPECTED_SALE_METHODS.map(x=>`'${x}'`).join(',')})`;
export const NEW_JOURNAL_ENUM=`ENUM(${EXPECTED_JOURNAL_SOURCES.map(x=>`'${x}'`).join(',')})`;

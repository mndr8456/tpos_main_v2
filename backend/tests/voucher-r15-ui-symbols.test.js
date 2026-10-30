import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(resolve(root,'frontend/src/Vouchers.jsx'),'utf8');

function importedSymbols(moduleName){
 const escaped=moduleName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const imports=[...source.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['\"]${escaped}['\"]`,'g'))];
 const names=new Set();
 for(const entry of imports){
  for(const item of entry[1].split(',')){
   const value=item.trim().split(/\s+as\s+/).at(-1)?.trim();
   if(value)names.add(value);
  }
 }
 return names;
}

test('Voucher R1.5 JSX components resolve before rendering an OWNER/ADMIN voucher list',()=>{
 const icons=importedSymbols('lucide-react');
 assert.ok(icons.has('Calculator'),'Preview Eligibility icon must be imported from lucide-react');
 const locallyDeclared=new Set([...source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)].map(match=>match[1]));
 const componentTags=new Set([...source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(match=>match[1]));
 const allowedLocals=new Set(['Icon']); // IconButton receives this name as a destructured parameter.
 const missing=[...componentTags].filter(name=>!locallyDeclared.has(name)&&!icons.has(name)&&!allowedLocals.has(name));
 assert.deepEqual(missing,[],'Unresolved JSX component(s) would blank the Voucher page at runtime');
});

test('Voucher R1.5 preserves Voucher R1.4 import, PDF, and unique-code selection',()=>{
 assert.match(source,/function VoucherImport\(/);
 assert.match(source,/function SelectVoucherDialog\(/);
 assert.match(source,/generateVoucherPdf\(vouchers,settings,businessName\)/);
 assert.match(source,/selectUniqueVouchers\(rows,selected\.map\(v=>v\.id\)\)/);
 assert.match(source,/function VoucherView\(/);
 assert.match(source,/function VoucherForm\(/);
});

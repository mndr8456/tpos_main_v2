// POS checkout must not crash the React tree when a conditional payment/receipt modal opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const file=resolve(dirname(fileURLToPath(import.meta.url)),'../../frontend/src/PosTerminal.jsx');
const source=readFileSync(file,'utf8');

// Validate all capitalized JSX component names against local JSX components and
// the named lucide-react imports, including content that is rendered only on demand.
test('All POS JSX icons have an imported or locally declared component binding',()=>{
 const lucide=source.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/s)?.[1];
 assert.ok(lucide,'lucide-react named import exists');
 const imported=new Set(lucide.split(',').map(x=>x.trim()).filter(Boolean));
 const components=new Set([...source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map(m=>m[1]));
 for(const component of components){
  if(component==='Math')continue; // Less-than comparison inside JSX expressions.
  if(component==='Icon')continue; // IconAction receives it as the icon:Icon prop.
  const local=new RegExp(`(?:function|class|const)\\s+${component}\\b`).test(source);
  const localNamedImport=new RegExp(`import\\s*\\{[^}]*\\b${component}\\b[^}]*\\}\\s*from`, 's').test(source);
  const defaultImport=new RegExp(`import\\s+${component}\\s+from`).test(source);
  assert.ok(local||localNamedImport||defaultImport||imported.has(component),`Missing JSX component import: ${component}`);
 }
 assert.ok(imported.has('CheckCircle2'),'Payment Methods renders an imported check icon');
 assert.ok(imported.has('Printer'),'Paid receipt renders an imported print icon');
});

test('Held drafts are rejected before opening cash payment modal',()=>{
 const open=source.match(/function openPayment\(\)\{([\s\S]*?)\n \}/)?.[1];
 assert.ok(open,'POS payment modal handler exists');
 assert.match(open,/current\.draft\.status\s*!==\s*'DRAFT'/);
 assert.match(open,/Resume this held order before checkout\./);
 assert.ok(open.indexOf("current.draft.status!=='DRAFT'")<open.indexOf('setShowPayment(true)'), 'status guard precedes modal render');
 assert.match(open,/!preview\?\.bill\|\|!preview\.cashCheckoutAvailable/);
});

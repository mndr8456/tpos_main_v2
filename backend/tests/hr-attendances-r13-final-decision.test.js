import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {attendanceDecisionAllowed, attendanceApprovalHint} from '../../frontend/src/attendance-approval.js';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const sample=(extra={})=>({status:'active',attendance_source:'Manual',attendance_status:'Present',approval_status:'Pending',clock_in:'2026-11-03 09:00',clock_out:'2026-11-03 18:00',...extra});

test('R1.3 only a Pending active record can receive an approval or rejection',()=>{
 for(const current of ['Approved','Rejected']){
  for(const action of ['Approved','Rejected']) assert.equal(attendanceDecisionAllowed(sample({approval_status:current}),action),false,`${current} -> ${action}`);
 }
 assert.equal(attendanceDecisionAllowed(sample(),'Approved'),true);
 assert.equal(attendanceDecisionAllowed(sample(),'Rejected'),true);
 assert.equal(attendanceDecisionAllowed(sample({clock_out:null}),'Approved'),false);
 assert.equal(attendanceDecisionAllowed(sample({clock_out:null}),'Rejected'),true);
});

test('R1.3 disabled decision buttons show final state and display it even if clock data are absent',()=>{
 assert.match(attendanceApprovalHint(sample({approval_status:'Approved'})),/already approved/i);
 assert.match(attendanceApprovalHint(sample({approval_status:'Rejected'})),/already rejected/i);
 const ui=read('../../frontend/src/Attendances.jsx');
 assert.match(ui,/\['Approved','Rejected'\]\.includes\(r\.approval_status\)\?r\.approval_status/);
 assert.match(ui,/!attendanceDecisionAllowed\(r,'Approved'\)/);
 assert.match(ui,/!attendanceDecisionAllowed\(r,'Rejected'\)/);
 assert.match(ui,/const decide=async\(row,decision\)=>\{if\(!attendanceDecisionAllowed\(row,decision\)\)return;/);
});

// Exercise the actual exported handler without a live tenant database. This verifies
// that decisions already made cannot write a second approval or audit event.
const makeHandler=()=>{
 const source=read('../src/attendances.js');
 const start=source.indexOf('export async function approveAttendance(');
 const end=source.indexOf('\nexport async function statusAttendance(',start);
 assert.ok(start>0&&end>start);
 const implementation=source.slice(start,end).replace('export async function','async function');
 let current=sample(),writes=0,auditWrites=0,locked=false;
 const fail=(code,status)=>{const err=new Error(code);err.code=code;err.status=status;throw err;};
 const get=async(_connection,_id,lock)=>{locked=lock;return {...current};};
 const tx=async(_pool,cb)=>cb({execute:async(_sql,params)=>{writes++;current={...current,approval_status:params[0]};}});
 const audit=async()=>{auditWrites++;};
 const z={enum:()=>null,object:()=>({strict:()=>({parse:v=>v})})};
 const numeric={parse:v=>Number(v)};
 const check=()=>{};
 const approvalReady=r=>!['Present','Late','Half Day'].includes(r.attendance_status)||Boolean(r.clock_in&&r.clock_out);
 const handler=new Function('check','numeric','z','tx','get','fail','approvalReady','audit',`${implementation}; return approveAttendance;`)(check,numeric,z,tx,get,fail,approvalReady,audit);
 const req=(decision)=>({params:{id:'1'},body:{decision},auth:{pool:{},user:{id:1}}});
 const res={json:()=>{}};
 return {run:async decision=>handler(req(decision),res),set:r=>{current=r;},snapshot:()=>({current,writes,auditWrites,locked})};
};

test('R1.3 backend rejects all repeat or reversed decisions before writing a second audit',async()=>{
 for(const final of ['Approved','Rejected']){
  const h=makeHandler();h.set(sample({approval_status:final}));
  for(const decision of ['Approved','Rejected']){
   await assert.rejects(()=>h.run(decision),e=>e.code==='ATTENDANCE_DECISION_ALREADY_FINAL'&&e.status===409);
   const s=h.snapshot();assert.equal(s.writes,0);assert.equal(s.auditWrites,0);assert.equal(s.locked,true);
  }
 }
});

test('R1.3 backend still saves a first decision exactly once',async()=>{
 const h=makeHandler();
 await h.run('Approved');
 assert.equal(h.snapshot().current.approval_status,'Approved');
 assert.equal(h.snapshot().writes,1);
 assert.equal(h.snapshot().auditWrites,1);
 await assert.rejects(()=>h.run('Rejected'),e=>e.code==='ATTENDANCE_DECISION_ALREADY_FINAL'&&e.status===409);
 assert.equal(h.snapshot().writes,1);
 assert.equal(h.snapshot().auditWrites,1);
});

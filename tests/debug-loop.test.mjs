import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makeQuestion} from '../lib/route-catalog.mjs';
const sum=`orders=>orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0)`;
const group=`orders=>{const r=Object.create(null);for(const o of orders)if(o.status==='paid')r[o.customer]=(r[o.customer]||0)+o.amount;return r;}`;
const implementation=kind=>`${kind} sumPaid=${sum};\n${kind} groupPaid=${group};\n${kind} report=orders=>({total:sumPaid(orders),byCustomer:groupPaid(orders)});`;
const run=(code,cases,fn='report')=>{const r=spawnSync(process.execPath,['lib/code-runner.mjs'],{input:JSON.stringify({code,cases,fn}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
test('composition accepts const, let and var arrow helpers while rejecting inline report logic',()=>{
 const q=makeQuestion('aggregate',3);
 for(const kind of ['const','let','var']){const result=run(implementation(kind),q.cases);assert.equal(result.error,undefined);for(const c of result.results){assert.equal(c.error,undefined,JSON.stringify(c));assert.deepEqual(c.actual,c.expected);}}
 const inline=implementation('const').replace('({total:sumPaid(orders),byCustomer:groupPaid(orders)})',`({total:orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0),byCustomer:groupPaid(orders)})`);
 const checks=run(inline,q.cases).results;assert.ok(checks.slice(0,-1).every(c=>JSON.stringify(c.actual)===JSON.stringify(c.expected)));assert.notDeepEqual(checks.at(-1).actual,checks.at(-1).expected);
});
test('syntax is located in student source and an exception in one case preserves the rest',()=>{
 const syntax=run('function report(orders) {\n return 0;',[]);assert.equal(syntax.diagnostic.kind,'syntax');assert.equal(syntax.diagnostic.line,2);assert.equal(syntax.diagnostic.approximate,true);assert.match(syntax.error,/Unexpected end/);assert.doesNotMatch(syntax.error,/JSON.stringify\(report/);
 const result=run('function report(rows) {\n if(rows.length) return missing;\n return 0;\n}',[{name:'throws',args:[[1]],expected:1},{name:'still runs',args:[[]],expected:0}]);
 assert.equal(result.results.length,2);assert.equal(result.results[0].diagnostic.kind,'reference');assert.equal(result.results[0].diagnostic.line,2);assert.ok(result.results[0].diagnostic.column>0);assert.equal(result.results[1].actual,0);
 const loop=run('function report(){while(true){}}',[{name:'loop',args:[[]],expected:0}]);assert.equal(loop.results[0].diagnostic.kind,'timeout');
});
test('debug loop records errors and checks, keeps drafts and hides checks during an assessment',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-debug-'));process.env.DEVLABS_DATA_DIR=dir;
 const {initialize,createServer}=await import('../server.mjs');await initialize();const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const api=async(action,extra={})=>{const r=await fetch(base+'/api/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 try{
  let r=await api('select',{labId:'js-orders-aggregate-3-v2'});await api('diagnostic-skip');r=await api('practice',{labId:r.route.lab.id});const id=r.route.question.id;
  const bad='function sumPaid(rows) {\n return unknown;\n}\nfunction groupPaid(rows){return {};}\nfunction report(rows){return {total:sumPaid(rows),byCustomer:groupPaid(rows)};}';
  r=await api('answer',{questionId:id,code:bad});assert.equal(r.route.question.id,id);assert.equal(r.route.lab.lastResult.diagnostic.line,2);assert.equal(r.route.lab.lastResult.checks.length,8);assert.ok(r.route.lab.lastResult.checks.some(c=>c.passed));assert.doesNotMatch(r.feedback,/student.js|node:vm/);
  const code=implementation('const');await api('lab-draft',{labId:r.route.lab.id,questionId:id,code});r=await api('resume');assert.equal(r.route.lab.draft.code,code);assert.equal(r.route.lab.lastResult.code,bad);
  r=await api('answer',{questionId:id,code});assert.equal(r.route.lab.lastResult.passed,true);assert.equal(r.route.question,null);
  let report=await fetch(base+'/api/teaching?unitId=aggregate').then(r=>r.json());assert.equal(report.attempts[0].diagnostic.line,2);assert.equal(report.attempts.length,2);
  // Test fixture changes only this test's private data; no learner directory is used.
  const stateFile=path.join(dir,'state.json');const state=JSON.parse(await fs.readFile(stateFile,'utf8'));state.route.progress.aggregate.trained=[0,1,2,3];await fs.writeFile(stateFile,JSON.stringify(state));await initialize();
  r=await api('unit-exam');const first=r.route.question;assert.equal(first.knowledge,undefined);
  r=await api('answer',{questionId:first.id,code:'function report(){return -99;}'});assert.equal(r.route.exam.index,1);assert.equal(JSON.stringify(r).includes('"expected"'),true,'public requirement examples remain available');
  assert.equal(r.route.events.at(-1).result,undefined);assert.equal(r.route.lab.lastResult.passed,true,'private exam feedback must not replace training results');
  report=await fetch(base+'/api/teaching?unitId=aggregate').then(r=>r.json());assert.equal(report.attempts.length,2,'unfinished assessment answer remains hidden');
  for(const file of ['code-editor.js','run-feedback.js'])assert.equal((await fetch(base+'/'+file)).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});

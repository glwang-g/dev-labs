import {debugSolution} from './debug-fixtures.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makeQuestion,stageQuestions} from '../lib/route-catalog.mjs';
import {freshRoute,handleRoute} from '../lib/route-service.mjs';
import {creditRemediation} from '../lib/remediation.mjs';
import {resolveEvaluation} from '../lib/evaluation-service.mjs';
const valid=`function validTotal(records){if(!Array.isArray(records))throw new TypeError();return records.filter(o=>o&&o.status==='paid'&&Number.isSafeInteger(o.amount)&&o.amount>=0).reduce((s,o)=>s+o.amount,0);}`;
const sum=`function sumPaid(orders){return orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0);}`;
const group=`function groupPaid(orders){const r=Object.create(null);for(const o of orders)if(o.status==='paid')r[o.customer]=(r[o.customer]||0)+o.amount;return r;}`;
const flat=sum+group+`function report(orders){return {total:sumPaid(orders),byCustomer:groupPaid(orders)};}`;
const closure=sum+group+`const report=(()=>{const total=sumPaid,grouped=groupPaid;return orders=>({total:total(orders),byCustomer:grouped(orders)});})();`;
const summary=`function summarizePaid(orders){const rows=orders.filter(o=>o.status==='paid');const total=rows.reduce((s,o)=>s+o.amount,0);return {total,count:rows.length,average:rows.length?total/rows.length:0};}`;
const build=`function buildReport(records){if(!Array.isArray(records))throw new TypeError();const byCustomer=Object.create(null);let total=0,rejected=0;for(const o of records){if(!o||typeof o.customer!=='string'||!Number.isSafeInteger(o.amount)||o.amount<0||!['paid','cancelled'].includes(o.status)){rejected++;continue;}if(o.status==='paid'){total+=o.amount;byCustomer[o.customer]=(byCustomer[o.customer]||0)+o.amount;}}return {total,byCustomer,rejected};}`;
const execute=(q,code)=>{const r=spawnSync(process.execPath,['lib/code-runner.mjs'],{input:JSON.stringify({code,fn:q.fn,cases:q.cases}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const passes=(q,code)=>{const r=execute(q,code);return !r.error&&r.results.every(c=>!c.error&&c.status!=='unassessed'&&isDeepStrictEqual(c.actual,c.expected));};
test('validation rejects known wrong implementations and accepts safe-integer boundaries in training and assessment',()=>{
 const mutants=[valid.replace('Number.isSafeInteger','Number.isInteger'),valid.replace('o.amount>=0','o.amount>0&&o.amount<Number.MAX_SAFE_INTEGER'),valid.replace('Number.isSafeInteger(o.amount)','Number.isSafeInteger(Number(o.amount))'),valid.replace("o.status==='paid'&&",''),valid.replace('throw new TypeError()','return 0'),valid.replace('throw new TypeError()','throw new Error()'),valid.replace('o.amount>=0','true')];
 for(const mode of ['train','exam']){const q=makeQuestion('validation',1,mode);assert.equal(q.contentRevision,2);assert.equal(passes(q,valid),true);for(const mutant of mutants)assert.equal(passes(q,mutant),false,mutant);}
 const integrated=stageQuestions('S1').find(q=>q.fn==='buildReport');assert.equal(passes(integrated,build),true);assert.equal(passes(integrated,build.replace('Number.isSafeInteger','Number.isInteger')),false);
});
test('unrelated and repeated successful questions cannot clear failed concepts',async()=>{
 const state={route:freshRoute()};state.route.progress.values={trained:[0,1,2,3],passed:false,needs:0};
 const api=(action,extra={})=>handleRoute(state,{action,...extra},async(q,b)=>({passed:b.answer===q.expected,output:q.expected}),async()=>({}));
 await api('unit-exam');while(!state.route.exam.finished){const q=state.route.exam.questions[state.route.exam.index];await api('answer',{questionId:q.id,answer:q.variant===3?'wrong':q.expected});}
 assert.deepEqual(state.route.progress.values.remediation.targets.map(t=>t.variant),[3]);
 for(let i=0;i<2;i++){await api('practice',{labId:'js-orders-values-0'});await api('answer',{questionId:state.route.current.id,answer:state.route.current.expected});}assert.equal(state.route.progress.values.needs,2);await assert.rejects(()=>api('unit-exam'));
 await api('remediation-practice');const first=structuredClone(state.route.current);await api('lab-draft',{labId:state.route.labId,questionId:first.id,code:'unfinished learner draft'});await api('remediation-practice');assert.equal(state.route.current.id,first.id);assert.equal(state.route.labSessions[state.route.labId].draft.code,'unfinished learner draft');await api('answer',{questionId:first.id,answer:first.expected});assert.equal(state.route.progress.values.needs,1);assert.equal(creditRemediation(state.route,first,'replay'),false);
 await api('remediation-practice');assert.equal(state.route.current.variant,3);assert.notEqual(state.route.current.caseSeed,first.caseSeed);await api('answer',{questionId:state.route.current.id,answer:state.route.current.expected});assert.equal(state.route.progress.values.needs,0);await api('unit-exam');
});
test('manual verification cannot turn an explicit machine failure into a pass',()=>{
 const state={route:{attempts:[{id:'failed',status:'failed',passed:false}]},teaching:{evaluations:[{id:'review',attemptId:'failed',status:'pending'}]}};
 assert.throws(()=>resolveEvaluation(state,{evaluationId:'review',verdict:'confirmed',note:'即使提交了充分的文字，也不能覆盖明确失败的检查。'}),/不能覆盖明确失败/);assert.equal(state.teaching.evaluations[0].status,'pending');
});
test('validation remediation and human verification work end to end, preserving original grades and current drafts',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-reliable-'));process.env.DEVLABS_DATA_DIR=dir;const {initialize,createServer}=await import('../server.mjs');await initialize();const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const post=async(endpoint,body,status=200)=>{const r=await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;};
 const api=(action,extra={},status)=>post('/api/route',{action,...extra},status);const teach=(extra,status)=>post('/api/teaching',extra,status);const get=endpoint=>fetch(base+endpoint).then(r=>r.json());
 const privateState=async()=>JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));
 const restore=async state=>{await fs.writeFile(path.join(dir,'state.json'),JSON.stringify(state));await initialize();};
 const open=async labId=>{let r=await api('select',{labId});if(r.route.lab.entry.status==='pending')await api('diagnostic-skip');return api('practice',{labId});};
 const solve=async(useClosure=true,wrongFirst=false)=>{const state=await privateState(),q=state.route.exam.questions[state.route.exam.index];let code;if(q.unitId==='aggregate')code=q.variant===0?sum.replace('sumPaid','report'):q.variant===1?group.replace('groupPaid','report'):q.variant===2?summary:useClosure?closure:flat;else code=q.unitId==='debug'?debugSolution(q):q.fn==='validTotal'?valid:q.fn==='buildReport'?build:q.fn==='countEligible'?`function countEligible(orders,min){return orders.filter(o=>o.status==='paid'&&o.amount>=min).length;}`:undefined;if(wrongFirst)code='function report(){return -99;}';return api('answer',{questionId:q.id,code,answer:q.expected});};
 try{
  let r;for(let i=0;i<4;i++){r=await open('js-orders-validation-'+i);r=await api('answer',{questionId:r.route.question.id,code:valid});assert.equal(r.route.lab.lastResult.passed,true);}
  r=await api('unit-exam');while(!r.route.exam.finished)r=await api('answer',{questionId:r.route.question.id,code:valid.replace('Number.isSafeInteger','Number.isInteger')});
  let u=r.route.units.find(u=>u.id==='validation');assert.equal(u.needs,2);assert.deepEqual(u.remediation.targets.map(t=>t.key),['validation:1']);
  r=await open('js-orders-validation-0');r=await api('answer',{questionId:r.route.question.id,code:valid});assert.equal(r.route.units.find(u=>u.id==='validation').needs,2);await api('unit-exam',{},400);
  const seeds=[];for(let i=0;i<2;i++){r=await api('remediation-practice');assert.equal(r.route.lab.variant,1);const s=await privateState();seeds.push(s.route.current.caseSeed);r=await api('answer',{questionId:r.route.question.id,code:valid});}assert.notEqual(seeds[0],seeds[1]);
  r=await api('unit-exam');while(!r.route.exam.finished)r=await solve();assert.equal(r.route.units.find(u=>u.id==='validation').passed,true);assert.equal((await privateState()).route.progress.validation.verificationRevision,2);
  r=await open('js-orders-aggregate-3-v2');const questionId=r.route.question.id;r=await api('answer',{questionId,code:closure});assert.equal(r.route.lab.lastResult.status,'unassessed');assert.equal(r.route.lab.lastResult.checks.filter(c=>c.passed).length,7);assert.equal(r.route.units.find(u=>u.id==='aggregate').needs,0);
  const request=r.teaching.evaluations.find(e=>e.questionId===questionId&&e.status==='pending');assert.ok(request);
  const changed=closure+'\n// draft after submission';await api('lab-draft',{questionId,labId:r.route.lab.id,code:changed});await teach({action:'resolve-evaluation',evaluationId:request.id,verdict:'confirmed',note:'已核对闭包保存的两个辅助函数引用，报表调用并组合了它们的返回值。'});
  r=await api('resume');assert.equal(r.route.lab.lastResult.reviewOutcome,'confirmed');assert.equal(r.route.lab.draft.code,changed);assert.equal(r.route.question.id,questionId);assert.equal(r.route.units.find(u=>u.id==='aggregate').passed,false);
  let state=await privateState();const original=state.route.attempts.find(a=>a.id===request.attemptId);assert.equal(original.passed,false);assert.equal(original.status,'unassessed');assert.equal(original.reviewOutcome,'confirmed');await teach({action:'resolve-evaluation',evaluationId:request.id,verdict:'confirmed',note:'重复核对不能重复计入训练或补练通过记录。'},400);
  for(let i=0;i<3;i++){r=await open('js-orders-aggregate-'+i+(i>=2?'-v2':''));const code=i===0?sum.replace('sumPaid','report'):i===1?group.replace('groupPaid','report'):summary;r=await api('answer',{questionId:r.route.question.id,code});}
  r=await api('unit-exam');while(!r.route.exam.finished)r=await solve();assert.equal(r.route.exam.status,'unassessed');assert.equal(r.route.units.find(u=>u.id==='aggregate').passed,false);
  const unitRequest=r.teaching.evaluations.find(e=>e.examId===r.route.exam.id&&e.status==='pending');await teach({action:'resolve-evaluation',evaluationId:unitRequest.id,verdict:'confirmed',note:'本次独立考核的真实业务检查均通过，已人工确认闭包内的函数组合。'});
  r=await api('resume');u=r.route.units.find(u=>u.id==='aggregate');assert.equal(u.passed,true);assert.equal(u.automaticPassed,false);assert.equal(u.verificationSource,'manual');state=await privateState();assert.equal(state.route.exam.passed,false);assert.equal(state.route.exam.reviewPassed,true);
  state.route.progress.debug={trained:[0,1,2,3],passed:true,needs:0};state.route.progress.testing={trained:[0,1,2,3],passed:true,needs:0};await restore(state);
  r=await api('stage-exam',{stage:'S1'});const stageId=r.route.exam.id;while(r.route.exam.index<4)r=await solve();
  state=await privateState();const pendingStage=state.teaching.evaluations.find(e=>e.examId===stageId);assert.ok(pendingStage);const active=await get('/api/teaching?unitId=aggregate');assert.equal(active.teaching.evaluations.some(e=>e.examId===stageId),false);assert.equal(active.attempts.some(a=>a.examId===stageId),false);await teach({action:'resolve-evaluation',evaluationId:pendingStage.id,verdict:'confirmed',note:'进行中的考核不能提前查看或人工核对结果。'},400);
  while(!r.route.exam.finished)r=await solve();assert.equal(r.route.exam.status,'unassessed');const pendingSnapshot=await privateState();
  await teach({action:'resolve-evaluation',evaluationId:pendingStage.id,verdict:'confirmed',note:'阶段综合业务用例均已核对，确认报表通过闭包引用复用辅助函数。'});r=await api('resume');assert.equal(r.route.stages.S1.passed,true);assert.equal(r.route.stages.S1.automaticPassed,false);assert.equal((await privateState()).route.assessments.find(e=>e.id===stageId).passed,false);
  await restore(pendingSnapshot);await teach({action:'resolve-evaluation',evaluationId:pendingStage.id,verdict:'needs-practice',note:'核对后尚不能确认组合规则，需要针对本项完成新的补练与独立验证。'});r=await api('resume');assert.equal(r.route.exam.status,'failed');assert.equal(r.route.units.find(u=>u.id==='aggregate').needs,2);assert.equal((await privateState()).route.exam.status,'unassessed','original machine result stays unchanged');
  await restore(pendingSnapshot);r=await api('stage-exam',{stage:'S1'});r=await solve(false,true);while(!r.route.exam.finished)r=await solve(false);assert.equal(r.route.exam.status,'failed');const needs=r.route.units.find(u=>u.id==='aggregate').needs;
  await teach({action:'resolve-evaluation',evaluationId:pendingStage.id,verdict:'confirmed',note:'这是较早考核的人工核对结论，不得覆盖更新一次考核中已确认的失败。'});r=await api('resume');assert.equal(r.route.stages.S1.passed,false);assert.equal(r.route.units.find(u=>u.id==='aggregate').needs,needs);assert.equal(r.route.units.find(u=>u.id==='aggregate').passed,false);
  await initialize();const exported=await get('/api/export');assert.ok(exported.routeEvidence.attempts.some(a=>a.status==='unassessed'&&a.reviewOutcome==='confirmed'));assert.ok(exported.state.teaching.evaluations.some(e=>e.status==='resolved'));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});

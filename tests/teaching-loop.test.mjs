import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {archiveAssessment,teachingReport} from '../lib/teaching-service.mjs';
import {freshRoute,publicRoute} from '../lib/route-service.mjs';
import {makeQuestion,unitConcepts,units} from '../lib/route-catalog.mjs';
const solve=q=>{let answer;vm.runInNewContext(q.code,{console:{log:x=>answer=String(x)}},{timeout:100});return answer;};
test('teacher observes a failed exam, assigns concept practice, reviews changes, and preserves independent outcomes and history',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-teaching-'));process.env.DEVLABS_DATA_DIR=dir;
 const {initialize,createServer}=await import('../server.mjs');await initialize();const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function get(url){const r=await fetch(base+url);assert.equal(r.status,200);return r.json();}
 async function post(url,body,status=200){const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
 const route=(action,extra={},status)=>post('/api/route',{action,...extra},status);
 const teach=(action,extra={},status)=>post('/api/teaching',{action,...extra},status);
 try{
  assert.equal((await get('/api/teaching?unitId=values')).units.length,13);
  for(let i=0;i<4;i++){const r=await route('practice');if(i===0)await route('hint');await route('answer',{questionId:r.route.question.id,answer:solve(r.route.question)});}
  let r=await route('unit-exam'),examId=r.route.exam.id;
  r=await route('answer',{questionId:r.route.question.id,answer:'wrong'});
  let detail=await get('/api/teaching?unitId=values');assert.equal(detail.activeAssessment.index,1);assert.equal(detail.attempts.length,4);assert.equal(detail.assessments.length,0);assert.equal(detail.attempts.some(a=>a.examId===examId),false);const activeExport=await get('/api/export');assert.equal(activeExport.routeEvidence.attempts.some(a=>a.examId===examId),false);
  await teach('observe',{unitId:'values',assessmentId:examId,kind:'review',outcome:'needs-practice',help:'none',note:'不能关联还未结束的独立考核记录。'},400);
  const assignedDuring=(await teach('assign',{unitId:'values',variant:1,requiredPasses:2,reason:'观察更新表达式中求值与赋值的执行顺序。'})).result;
  await route('teacher-practice',{assignmentId:assignedDuring.id},400);
  while(!r.route.exam.finished)r=await route('answer',{questionId:r.route.question.id,answer:solve(r.route.question)});
  detail=await get('/api/teaching?unitId=values');assert.equal(detail.assessments.length,1);assert.equal(detail.attempts.length,8);assert.equal(detail.attempts[0].hintsUsed,1);assert.equal(detail.attempts.find(a=>a.examId===examId&&!a.passed).answer,'wrong');assert.ok(detail.attempts[0].sourceHash);assert.equal(r.route.units[0].passed,false);
  const note='学生能够追踪旧值，但是混淆了乘法与加法的执行顺序。';
  const observation=(await teach('observe',{unitId:'values',assessmentId:examId,kind:'review',outcome:'needs-practice',help:'hint',prompt:'先乘再加和先加再乘有什么差别？',note})).result;
  assert.equal(observation.assessmentId,examId);
  await teach('assign',{unitId:'values',variant:1,requiredPasses:2,reason:'重复创建相同概念的任务应被拒绝。'},400);
  await teach('assign',{unitId:'http',variant:9,requiredPasses:2,reason:'不存在的概念不能用于创建指定补练任务。'},400);
  await teach('review-assignment',{assignmentId:assignedDuring.id,verdict:'confirmed',note:'还没有完成指定补练，不能直接确认理解。'},400);
  r=await route('teacher-practice',{assignmentId:assignedDuring.id});const q=r.route.question;
  await route('answer',{questionId:q.id,answer:'wrong'});r=await route('answer',{questionId:q.id,answer:solve(q)});
  assert.equal(r.teaching.assignments[0].completedPasses,1);await route('answer',{questionId:q.id,answer:solve(q)},400);
  r=await route('teacher-practice',{assignmentId:assignedDuring.id});assert.notEqual(r.route.question.id,q.id);r=await route('answer',{questionId:r.route.question.id,answer:solve(r.route.question)});
  assert.equal(r.teaching.assignments[0].status,'awaiting-review');assert.equal(r.route.units[0].passed,false);assert.equal(r.route.units[0].needs,0);
  await teach('review-assignment',{assignmentId:assignedDuring.id,verdict:'needs-practice',note:'换成新的表达式后仍不能解释更新顺序，需要再次验证。',help:'none'});
  let state=(await get('/api/state')).state;assert.equal(state.teaching.assignments[0].round,2);assert.equal(state.teaching.assignments[0].completedPasses,0);
  for(let i=0;i<2;i++){r=await route('teacher-practice',{assignmentId:assignedDuring.id});r=await route('answer',{questionId:r.route.question.id,answer:solve(r.route.question)});}
  await teach('review-assignment',{assignmentId:assignedDuring.id,verdict:'confirmed',prompt:'把乘数改成三，先预测再运行。',help:'none',note:'学生独立解释了更新顺序，并且正确预测和验证了新的表达式。'});
  state=(await get('/api/state')).state;assert.equal(state.teaching.assignments[0].status,'completed');assert.equal(state.teaching.assignments[0].reviews.length,2);assert.equal(state.route.units[0].passed,false);assert.equal(state.teaching.observations[0].note,note);
  await route('teacher-practice',{assignmentId:assignedDuring.id},400);
  const linked=(await teach('assign',{unitId:'values',variant:2,requiredPasses:1,reason:'用字符串连接的新例子检验数字与字符串的区别。',assessmentId:examId,observationId:observation.id})).result;assert.equal(linked.observationId,observation.id);
  r=await route('unit-exam');while(!r.route.exam.finished)r=await route('answer',{questionId:r.route.question.id,answer:solve(r.route.question)});
  detail=await get('/api/teaching?unitId=values');assert.equal(detail.assessments.length,2);assert.equal(detail.assessments[0].passed,false);assert.equal(detail.assessments[1].passed,true);assert.equal(detail.teaching.assignments[0].attemptIds.length,5);assert.equal(detail.units[0].passed,true);
  const exported=await get('/api/export');assert.equal(exported.state.route.attempts,undefined);assert.equal(exported.state.route.exam.questions,undefined);assert.equal(exported.state.teaching.assignments[0].reviews.length,2);assert.equal(exported.routeEvidence.assessments.length,2);assert.ok(exported.routeEvidence.attempts.some(a=>a.answer==='wrong'));
  await initialize();detail=await get('/api/teaching?unitId=values');assert.equal(detail.assessments.length,2);assert.equal(detail.teaching.assignments[0].status,'completed');assert.equal(detail.teaching.observations[0].note,note);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('last legacy exam is retained once without fabricating prior training snapshots',()=>{
 const route=freshRoute(),q=makeQuestion('values');delete route.attempts;delete route.assessments;
 route.exam={id:'legacy',finished:true,passed:false,target:'unit',unitId:'values',stage:'S0',at:'2026-01-01T00:00:00Z',questions:[q],answers:[{questionId:q.id,unitId:'values',answer:'wrong',passed:false}],weak:['values']};
 archiveAssessment(route);archiveAssessment(route);assert.equal(route.assessments.length,1);assert.equal(route.attempts.length,1);assert.equal(route.attempts[0].legacy,true);
 const report=teachingReport({route},'values',publicRoute(route));assert.equal(report.attempts[0].question.expected,undefined);assert.equal(report.attempts[0].question.cases,undefined);
});
test('every unit exposes only concepts supported by its task generator',()=>{
 for(const unit of units)for(let variant=0;variant<unitConcepts[unit.id].length;variant++){const q=makeQuestion(unit.id,variant);assert.equal(q.unitId,unit.id);assert.ok(q.kind);}
});

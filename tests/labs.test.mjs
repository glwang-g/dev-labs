import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {freshRoute} from '../lib/route-service.mjs';
import {labs,enterLab,labId,startDiagnostic,publicLabs} from '../lib/lab-service.mjs';
import {units} from '../lib/route-catalog.mjs';
const predict=q=>{let answer;vm.runInNewContext(q.code,{console:{log:x=>answer=String(x)}},{timeout:100});return answer;};
test('open Labs diagnose optional prerequisites, preserve separate scenes and drafts, and pause an independent exam without leaking answers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-labs-'));process.env.DEVLABS_DATA_DIR=dir;
 const {initialize,createServer}=await import('../server.mjs');await initialize();const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function get(url){const r=await fetch(base+url);assert.equal(r.status,200);return r.json();}
 async function api(action,extra={},status=200){const r=await fetch(base+'/api/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
 try{
  let r=await api('select',{labId:labId('http')});assert.equal(r.route.selected,'http');assert.equal(r.route.lab.entry.status,'pending');assert.equal(r.route.units.some(u=>u.passed),false);assert.equal(r.route.labs.length,45);
  await api('practice',{labId:labId('http')},400);await api('unit-exam',{},400);
  r=await api('diagnostic-start');assert.equal(r.route.lab.entry.question.expected,undefined);assert.equal(r.route.lab.entry.questions,undefined);
  r=await api('diagnostic-answer',{questionId:r.route.lab.entry.question.id,answer:'0'}); // modules startup answer is npm start, not git status
  const second=r.route.lab.entry.question.id;r=await api('diagnostic-answer',{questionId:second,answer:'0'});
  assert.equal(r.route.lab.entry.status,'gaps');assert.deepEqual(r.route.lab.entry.weak,['modules']);assert.equal(r.route.units.find(u=>u.id==='http').trained.length,0);
  r=await api('select',{labId:labId('modules'),entry:'bridge'});assert.equal(r.route.lab.returnTo,labId('http'));await api('select',{labId:labId('http')});
  const diagnostic=await get('/api/teaching?unitId=http');assert.equal(diagnostic.attempts.length,2);assert.ok(diagnostic.attempts.every(a=>a.mode==='diagnostic'));
  r=await api('practice',{labId:labId('http')});const httpQuestion=r.route.question.id;
  await api('lab-draft',{labId:labId('http'),questionId:httpQuestion,code:'// unsaved HTTP draft',file:'app.cjs',baseCode:r.project['app.cjs']});
  r=await api('select',{labId:labId('values',3)});assert.equal(r.route.lab.entry.status,'ready');r=await api('practice',{labId:labId('values',3)});const valuesQuestion=r.route.question;
  await api('lab-draft',{labId:labId('values',3),questionId:valuesQuestion.id,answer:'my prediction'});
  r=await api('answer',{questionId:valuesQuestion.id,answer:'wrong'});assert.equal(r.route.lab.lastResult.passed,false);
  r=await api('select',{labId:labId('http')});assert.equal(r.route.question.id,httpQuestion);assert.equal(r.route.lab.draft.code,'// unsaved HTTP draft');assert.equal(r.route.lab.entry.status,'gaps');
  r=await api('select',{labId:labId('values',3)});assert.equal(r.route.question.id,valuesQuestion.id);assert.equal(r.route.lab.draft.answer,'my prediction');assert.equal(r.route.lab.lastResult.passed,false);
  r=await api('answer',{questionId:valuesQuestion.id,answer:predict(valuesQuestion)});assert.deepEqual(r.route.units[0].trained,[3]);assert.equal(r.route.lab.lastResult.code,valuesQuestion.code);assert.equal(r.route.units[0].passed,false);
  for(let i=0;i<3;i++){r=await api('practice');assert.equal(r.route.lab.variant,i);r=await api('answer',{questionId:r.route.question.id,answer:predict(r.route.question)});}
  r=await api('unit-exam');r=await api('answer',{questionId:r.route.question.id,answer:predict(r.route.question)});const examId=r.route.exam.id,examQuestion=r.route.question.id;
  await api('select',{labId:labId('data')},400);r=await api('exam-pause');assert.equal(r.route.exam.paused,true);
  r=await api('select',{labId:labId('data')});assert.equal(r.route.lab.entry.status,'pending');r=await api('diagnostic-skip');assert.equal(r.route.lab.entry.status,'skipped');r=await api('practice',{labId:labId('data')});
  const detail=await get('/api/teaching?unitId=values');assert.equal(detail.activeAssessment.paused,true);assert.equal(detail.attempts.some(a=>a.examId===examId),false);
  const exported=await get('/api/export');assert.equal(exported.routeEvidence.attempts.some(a=>a.examId===examId),false);
  r=await api('exam-resume');assert.equal(r.route.question.id,examQuestion);assert.equal(r.route.exam.paused,false);assert.equal(r.route.selected,'values');
  while(!r.route.exam.finished)r=await api('answer',{questionId:r.route.question.id,answer:predict(r.route.question)});
  r=await api('select',{labId:labId('branch')});assert.equal(r.route.lab.entry.status,'ready');assert.equal(r.route.units[0].passed,true);assert.equal(r.route.stages.S0?.passed||false,false);
  await initialize();r=await api('select',{labId:labId('http')});assert.equal(r.route.question.id,httpQuestion);assert.equal(r.route.lab.draft.code,'// unsaved HTTP draft');assert.equal(r.route.lab.entry.status,'gaps');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('entry source alone never proves prerequisites; old evidence only triggers an optional warmup',()=>{
 const r=freshRoute();r.progress.values={trained:[0,1,2,3],passed:true,needs:0};r.assessments=[{target:'unit',unitId:'values',passed:true,finishedAt:new Date(Date.now()-91*86400000).toISOString()}];
 assert.equal(publicLabs(r).filter(l=>l.completed).length,4);
 enterLab(r,labId('branch'),'recommended');assert.equal(r.labSessions[r.labId].entry.status,'pending');assert.equal(r.progress.values.passed,true);
 enterLab(r,labId('values'));r.assessments.push({target:'unit',unitId:'values',passed:true,finishedAt:new Date().toISOString()});enterLab(r,labId('branch'),'direct');assert.equal(r.labSessions[r.labId].entry.status,'ready');
 assert.equal(new Set(labs.map(l=>l.id)).size,labs.length);assert.equal(labs.length,units.reduce((sum,u)=>sum+u.trainingCount,0));
});

test('entry diagnostics use two different probes for each supported dependency set',()=>{
 for(const lab of labs.filter(l=>l.prerequisites.length)){const r=freshRoute();enterLab(r,lab.id);startDiagnostic(r);const questions=r.labSessions[lab.id].entry.questions;assert.equal(questions.length,2);assert.notEqual(questions[0].id,questions[1].id);assert.notEqual((questions[0].brief||'')+(questions[0].starter||''),(questions[1].brief||'')+(questions[1].starter||''));}
});

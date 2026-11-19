import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {makeQuestion} from '../lib/route-catalog.mjs';
import {upgradeDebug} from '../lib/debug-upgrade.mjs';
import {freshRoute,handleRoute,publicRoute} from '../lib/route-service.mjs';
import {getLab,labId,ensureLabs,publicLabs} from '../lib/lab-service.mjs';
import {debugSolution,debugCounterexample} from './debug-fixtures.mjs';
import {debugRetention} from '../lib/debug-practice.mjs';
import {resolveEvaluation} from '../lib/evaluation-service.mjs';
const execute=(q,code)=>{const r=spawnSync(process.execPath,['lib/code-runner.mjs'],{input:JSON.stringify({code,fn:q.fn,cases:q.cases}),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const grade=(q,code)=>{const r=execute(q,code);const checks=(r.results||[]).map(c=>({...c,passed:!c.error&&isDeepStrictEqual(c.actual,c.expected)}));return {...r,checks,passed:!r.error&&checks.length>0&&checks.every(c=>c.passed)};};
test('four debug Labs have distinct defects and transfer contracts; original defects cannot pass',()=>{
 const starters=[];
 for(const mode of ['train','exam','delayed'])for(let variant=0;variant<4;variant++){
  const q=makeQuestion('debug',variant,mode);assert.equal(q.contentRevision,2);assert.equal(q.debugVersion,2);assert.equal(grade(q,debugSolution(q)).passed,true);assert.equal(grade(q,q.starter).passed,false);if(variant===0)assert.equal(grade(q,debugSolution(q).replace('return rows.filter','if(min===0)return 0;return rows.filter')).passed,false);if(mode==='train')starters.push(q.starter);else assert.notEqual(q.fn,makeQuestion('debug',variant,'train').fn);
 }
 assert.equal(new Set(starters).size,4);
 const q=makeQuestion('debug',3);const failed=execute(q,q.starter).results[0];assert.equal(failed.inputMode,'sequence');assert.notEqual(failed.actual[1],failed.expected[1]);assert.equal(failed.actual[0],failed.expected[0]);
 const log=execute(makeQuestion('debug',0),'for(let i=0;i<100;i++)console.log("step",i);'+debugSolution(makeQuestion('debug',0))).results[0];assert.equal(log.logs.length,40);assert.match(log.logs[0].text,/step 0/);
});
test('debug migration retains original scenes, grades, assignments and unfinished exams without granting new coverage',async()=>{
 const route=freshRoute();delete route.contentRevisions.debug;route.selected='debug';route.progress.debug={trained:[0,1,2,3],passed:true,needs:0};route.stages={S1:{passed:true,examId:'old-s1'},S2:{passed:true}};
 const q={...makeQuestion('debug',2,'train',{legacy:true}),labId:'js-orders-debug-2'};route.current=q;route.labId=q.labId;route.labSessions={[q.labId]:{question:q,draft:{questionId:q.id,code:'// unfinished original code'},entry:{status:'ready'}}};
 const old=structuredClone(route);const state={route,teaching:{observations:[],assignments:[{id:'old-assignment',unitId:'debug',variant:0}]}};
 upgradeDebug(state);ensureLabs(route);assert.deepEqual(route.current,q);assert.deepEqual(route.labSessions[q.labId].draft,old.labSessions[q.labId].draft);assert.deepEqual(route.legacyDebug.progress,old.progress.debug);assert.deepEqual(route.progress.debug.trained,[]);assert.equal(route.stages.S1.passed,false);assert.equal(route.stages.S2.passed,true);assert.equal(state.teaching.assignments[0].labId,'js-orders-debug-0');
 assert.equal(getLab(q.labId).legacy,true);assert.equal(labId('debug',2),'js-orders-debug-2-v2');assert.equal(publicLabs(route).find(l=>l.id===labId('debug',2)).completed,false);
 const snapshot=structuredClone(state);upgradeDebug(state);assert.deepEqual(state,snapshot);
 await handleRoute(state,{action:'answer',questionId:q.id,code:debugSolution(q)},async(q,b)=>grade(q,b.code),async()=>({}));assert.deepEqual(route.progress.debug.trained,[]);
 const legacyExamState={route:structuredClone(old)};legacyExamState.route.exam={id:'old-exam',target:'unit',unitId:'debug',stage:'S1',questions:[q],index:0,answers:[],at:new Date().toISOString()};upgradeDebug(legacyExamState);
 await handleRoute(legacyExamState,{action:'answer',questionId:q.id,code:debugSolution(q)},async(q,b)=>grade(q,b.code),async()=>({}));assert.equal(legacyExamState.route.exam.passed,true);assert.equal(legacyExamState.route.exam.legacyContent,true);assert.equal(legacyExamState.route.progress.debug.passed,false);
});
test('a newer delayed check does not prevent resolving an earlier qualifying assessment',()=>{
 const at=new Date().toISOString(),attempt={id:'a',unitId:'aggregate',status:'unassessed',passed:false,examId:'qual',question:{unitId:'aggregate',variant:3,contentRevision:2}},archive={id:'qual',target:'stage',stage:'S1',passed:false,status:'unassessed',attemptIds:['a']};
 const state={route:{progress:{},stages:{},attempts:[attempt],assessments:[archive,{id:'delay',target:'unit',unitId:'debug',stage:'S1',purpose:'delayed',passed:false}],exam:null},teaching:{evaluations:[{id:'review',attemptId:'a',examId:'qual',unitId:'aggregate',status:'pending',at}]}};
 resolveEvaluation(state,{evaluationId:'review',verdict:'confirmed',note:'已核对需要人工确认的规则，后续延迟表现不应改变这次正式考核结论。'});assert.equal(state.route.stages.S1.reviewPassed,true);assert.equal(archive.passed,false);
});
test('student-designed counterexamples, private regression, matched remediation and spaced review form one unit loop',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'devlabs-debug-unit-'));process.env.DEVLABS_DATA_DIR=dir;const {initialize,createServer}=await import('../server.mjs');await initialize();const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const api=async(action,extra={},status=200)=>{const r=await fetch(base+'/api/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...extra})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
 const state=async()=>JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));
 const open=async variant=>{let r=await api('select',{labId:labId('debug',variant)});if(r.route.lab.entry.status==='pending')await api('diagnostic-skip');return api('practice',{labId:labId('debug',variant)});};
 const trial=async(r,variant,code)=>api('debug-test',{questionId:r.route.question.id,code,...debugCounterexample(variant)});
 const solveExam=async(failGroup=false)=>{const s=await state(),q=s.route.exam.questions[s.route.exam.index];return api('answer',{questionId:q.id,code:failGroup&&q.variant===2?'function groupHours(rows){return {};}':debugSolution(q)});};
 try{
  let r=await open(0),id=r.route.question.id,code=debugSolution(r.route.question);
  await api('answer',{questionId:id,code},400);r=await api('debug-test',{questionId:id,code,...debugCounterexample(0),testExpected:'0'});assert.equal(r.route.lab.debug.lastTrial.expectedValid,false);assert.equal(r.route.question.debugTools.hasCounterexample,false);assert.equal(r.route.units.find(u=>u.id==='debug').trained.length,0);
  r=await api('debug-test',{questionId:id,code,testArgs:'[[{"amount":5,"status":"paid"}],4]',testExpected:'1'});assert.equal(r.route.lab.debug.lastTrial.expectedValid,true);assert.equal(r.route.lab.debug.lastTrial.exposesBug,false);assert.equal(r.route.lab.debug.regressions.length,0);
  await api('debug-test',{questionId:id,code,testArgs:'[null]',testExpected:'0'},400);await api('debug-test',{questionId:id,code,testArgs:'broken JSON',testExpected:'0'},400);
  r=await trial(r,0,r.route.question.code);assert.equal(r.route.lab.debug.lastTrial.exposesBug,true);assert.equal(r.route.lab.debug.lastTrial.candidate.passed,false);assert.equal(r.route.question.debugTools.hasCounterexample,true);assert.equal(r.route.units.find(u=>u.id==='debug').trained.length,0);
  r=await api('answer',{questionId:id,code:r.route.question.code});assert.equal(r.route.lab.lastResult.passed,false);assert.ok(r.route.lab.lastResult.checks.some(c=>c.name==='学生回归反例 1'));
  for(let i=0;i<5;i++)r=await api('debug-test',{questionId:id,code,testArgs:JSON.stringify([[{amount:i+10,status:'paid'}],i+10]),testExpected:'1'});assert.equal(r.route.lab.debug.regressions.filter(c=>c.questionId===id).length,4);
  r=await api('answer',{questionId:id,code});assert.equal(r.route.lab.lastResult.passed,true);assert.equal(r.route.lab.lastResult.checks.length,9);
  for(let variant=1;variant<4;variant++){
   r=await open(variant);id=r.route.question.id;code=debugSolution(r.route.question);const input=debugCounterexample(variant);await api('lab-draft',{labId:r.route.lab.id,questionId:id,code,...input});
   if(variant===1){const before=await state();await initialize();r=await api('resume');assert.equal(r.route.question.id,id);assert.equal(r.route.lab.draft.testArgs,input.testArgs);assert.equal((await state()).route.current.id,before.route.current.id);}
   r=await trial(r,variant,'console.log("trial");'+code);assert.equal(r.route.lab.debug.lastTrial.expectedValid,true);assert.equal(r.route.lab.debug.lastTrial.exposesBug,true);assert.equal(r.route.lab.debug.lastTrial.candidate.passed,true);assert.ok(r.route.lab.debug.lastTrial.candidate.logs.some(l=>l.text==='trial'));
   for(let level=1;level<=3;level++){r=await api('hint');assert.match(r.feedback,new RegExp('提示 '+level+'/3'));assert.equal(r.route.lab.draft.code,code);}
   r=await api('answer',{questionId:id,code});assert.equal(r.route.lab.lastResult.passed,true);
  }
  r=await api('unit-exam');assert.equal(r.route.question.debugTools,null);assert.equal(r.route.question.knowledge,undefined);await api('debug-test',{questionId:r.route.question.id,code:'',...debugCounterexample(0)},400);await api('hint',{},400);
  const active=await fetch(base+'/api/teaching?unitId=debug').then(r=>r.json());assert.equal(active.attempts.some(a=>a.examId===r.route.exam.id),false);
  while(!r.route.exam.finished)r=await solveExam(true);assert.equal(r.route.exam.passed,false);assert.deepEqual(r.route.units.find(u=>u.id==='debug').remediation.targets.map(t=>t.key),['debug:2']);
  r=await open(0);r=await trial(r,0,debugSolution(r.route.question));r=await api('answer',{questionId:r.route.question.id,code:debugSolution(r.route.question)});assert.equal(r.route.units.find(u=>u.id==='debug').needs,2);await api('unit-exam',{},400);
  for(let i=0;i<2;i++){r=await api('remediation-practice');assert.equal(r.route.question.debugTools.variant,2);r=await trial(r,2,debugSolution(r.route.question));r=await api('answer',{questionId:r.route.question.id,code:debugSolution(r.route.question)});}
  r=await api('unit-exam');while(!r.route.exam.finished)r=await solveExam();assert.equal(r.route.units.find(u=>u.id==='debug').passed,true);assert.equal(r.route.units.find(u=>u.id==='debug').retention.available,false);await api('debug-retest',{},400);
  let s=await state();const first=s.route.assessments.find(e=>e.unitId==='debug'&&e.passed&&e.purpose==='qualification');first.finishedAt=new Date(Date.now()-8*86400000).toISOString();await fs.writeFile(path.join(dir,'state.json'),JSON.stringify(s));await initialize();
  r=await api('debug-retest');assert.equal(r.route.exam.purpose,'delayed');const certificate=structuredClone((await state()).route.progress.debug);while(!r.route.exam.finished)r=await solveExam(true);assert.equal(r.route.exam.passed,false);assert.equal(r.route.units.find(u=>u.id==='debug').passed,true);assert.deepEqual((await state()).route.progress.debug,certificate);assert.equal(r.route.units.find(u=>u.id==='debug').retention.last.passed,false);await api('debug-retest',{},400);
  s=await state();s.route.retention.debug.at=new Date(Date.now()-2*86400000).toISOString();await fs.writeFile(path.join(dir,'state.json'),JSON.stringify(s));await initialize();r=await api('debug-retest');while(!r.route.exam.finished)r=await solveExam();assert.equal(r.route.units.find(u=>u.id==='debug').retention.last.passed,true);assert.equal(r.route.units.find(u=>u.id==='debug').retention.available,false);
  const evidence=await fetch(base+'/api/export').then(r=>r.json());assert.ok(evidence.routeEvidence.debugExperiments.some(e=>!e.expectedValid));assert.ok(evidence.routeEvidence.attempts.some(a=>a.studentTests?.length));assert.equal(evidence.routeEvidence.assessments.filter(e=>e.purpose==='delayed').length,2);assert.equal((await fetch(base+'/debug-workbench.js')).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});

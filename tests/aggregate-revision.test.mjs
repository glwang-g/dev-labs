import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {makeQuestion,stageQuestions} from '../lib/route-catalog.mjs';
import {freshRoute,handleRoute} from '../lib/route-service.mjs';
import {upgradeAggregate} from '../lib/aggregate-upgrade.mjs';
import {getLab,labId,ensureLabs,publicLabs} from '../lib/lab-service.mjs';
import {questionSnapshot} from '../lib/teaching-service.mjs';
const sum=`function sumPaid(orders){return orders.filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0);}`;
const group=`function groupPaid(orders){const r=Object.create(null);for(const o of orders)if(o.status==='paid')r[o.customer]=(r[o.customer]||0)+o.amount;return r;}`;
const compose=sum+group+`function report(orders){return {total:sumPaid(orders),byCustomer:groupPaid(orders)};}`;
const summary=`function summarizePaid(orders){const rows=orders.filter(o=>o.status==='paid');const total=rows.reduce((s,o)=>s+o.amount,0);return {total,count:rows.length,average:rows.length?total/rows.length:0};}`;
function run(q,code){const r=spawnSync(process.execPath,['lib/code-runner.mjs'],{input:JSON.stringify({code,fn:q.fn,cases:q.cases}),encoding:'utf8'});assert.equal(r.status,0);return JSON.parse(r.stdout);}
function allPass(q,code){const r=run(q,code);return !r.error&&r.results.every(x=>JSON.stringify(x.actual)===JSON.stringify(x.expected));}
test('four aggregate Labs exercise distinct outputs; composition is checked through actual helper use',()=>{
 const q2=makeQuestion('aggregate',2),q3=makeQuestion('aggregate',3);
 assert.equal(allPass(q2,summary),true);assert.equal(allPass(q3,compose),true);
 assert.equal(allPass(q2,sum.replace('sumPaid','summarizePaid')),false);
 assert.equal(allPass(q3,group.replace('groupPaid','report')),false);
 const inline=sum+group+`function report(orders){const result=Object.create(null);let total=0;for(const o of orders)if(o.status==='paid'){total+=o.amount;result[o.customer]=(result[o.customer]||0)+o.amount;}return {total,byCustomer:result};}`;
 assert.equal(allPass(q3,inline),false,'a correct output alone cannot prove helper reuse');
 assert.equal(allPass(q3,compose.replace('return orders.filter', 'return [].filter')),false,'each helper must also work independently');
 assert.deepEqual(stageQuestions('S1').filter(q=>q.unitId==='aggregate').map(q=>q.variant),[0,1,2,3]);
});
function legacyState(){const r=freshRoute();delete r.contentRevisions;r.selected='aggregate';r.progress.aggregate={trained:[0,1,2,3],passed:true,needs:0};r.stages={S1:{passed:true,examId:'old-stage'},S2:{passed:true}};r.current={...makeQuestion('aggregate',3,'train',{legacy:true}),labId:'js-orders-aggregate-3'};r.labId=r.current.labId;r.labSessions={[r.labId]:{question:r.current,draft:{questionId:r.current.id,code:'// learner draft'},entry:{status:'ready'},completedAt:null}};return {route:r,teaching:{assignments:[{id:'old-assignment',unitId:'aggregate',variant:3,concept:'客户分组',status:'assigned',attemptIds:[],roundAttemptIds:[],requiredPasses:1}],observations:[]}};}
test('migration preserves original question and draft, separates new coverage and keeps unrelated certification',async()=>{
 const state=legacyState(),r=state.route,q=structuredClone(r.current),draft=structuredClone(r.labSessions[r.labId].draft);
 upgradeAggregate(state);ensureLabs(r);
 assert.deepEqual(r.current,q);assert.deepEqual(r.labSessions[r.labId].draft,draft);assert.deepEqual(r.progress.aggregate.trained,[0,1]);assert.deepEqual(r.legacyAggregate.progress,{trained:[0,1,2,3],passed:true,needs:0});assert.equal(r.stages.S1.contentUpdated,true);assert.equal(r.legacyAggregate.stage.passed,true);assert.equal(r.stages.S2.passed,true);
 assert.equal(getLab(r.labId).legacy,true);assert.equal(getLab(labId('aggregate',3)).legacy,undefined);assert.equal(publicLabs(r).find(l=>l.id===labId('aggregate',3)).completed,false);
 assert.match(questionSnapshot(q).concept,/旧版/);assert.equal(questionSnapshot(q).context.signature,'report(orders) → { 客户名: 已支付金额合计 }');
 const snapshot=structuredClone(state);upgradeAggregate(state);assert.deepEqual(state,snapshot);
 const api=(action,extra={})=>handleRoute(state,{action,...extra},async()=>({passed:true}),async()=>({}));
 await api('answer',{questionId:q.id,code:'old code'});assert.deepEqual(r.progress.aggregate.trained,[0,1]);assert.equal(r.labSessions[q.labId].completedAt!==null,true);
 await api('select',{labId:labId('aggregate',3)});await api('diagnostic-skip');await api('practice',{labId:labId('aggregate',3)});assert.match(r.current.starter,/sumPaid/);assert.notEqual(r.current.id,q.id);assert.deepEqual(r.labSessions[q.labId].draft,draft);
 await api('teacher-practice',{assignmentId:'old-assignment'});assert.equal(r.current.contentRevision,1);assert.equal(r.current.labId,q.labId);assert.doesNotMatch(r.current.starter,/sumPaid/);
});
test('unfinished old assessments remain playable and archive their grade without certifying new requirements',async()=>{
 for(const target of ['unit','stage']){
 const state=legacyState(),r=state.route;const q=makeQuestion('aggregate',3,'exam',{legacy:true});r.exam={id:'legacy-'+target,target,stage:'S1',unitId:'aggregate',questions:[q],index:0,answers:[],at:new Date().toISOString()};
 upgradeAggregate(state);await handleRoute(state,{action:'answer',questionId:q.id,code:'old code'},async()=>({passed:true}),async()=>({}));
 assert.equal(r.exam.passed,true);assert.equal(r.assessments[0].legacyContent,true);assert.equal(r.progress.aggregate.passed,false);assert.equal(r.stages.S1.passed,false);
 }
});

test('a fresh learner can follow a legacy link without crediting the replacement Lab',async()=>{
 const state={route:freshRoute()};const api=(action,extra={})=>handleRoute(state,{action,...extra},async()=>({passed:true}),async()=>({}));
 await api('select',{labId:'js-orders-aggregate-2'});await api('diagnostic-skip');await api('practice',{labId:'js-orders-aggregate-2'});await api('answer',{questionId:state.route.current.id,code:'old solution'});
 assert.deepEqual(state.route.legacyAggregate.progress.trained,[2]);assert.equal(state.route.progress.aggregate,undefined);
});

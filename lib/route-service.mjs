import {upgradeDebug,legacyDebug} from './debug-upgrade.mjs';
import {tryDebugTest,regressionsFor,debugRetention} from './debug-practice.mjs';
import {certified,failedSkills,assignRemediation,creditRemediation,remediationView,questionSkills} from './remediation.mjs';
import {queueEvaluation} from './evaluation-service.mjs';
import {upgradeAggregate,legacyAggregate} from './aggregate-upgrade.mjs';
import {taskContext,knowledgeFor} from './task-guidance.mjs';
import {labId,getLab,ensureLabs,stashLab,enterLab,startLabQuestion,startDiagnostic,publicLab,publicLabs,nextVariant} from './lab-service.mjs';
import {randomUUID} from 'node:crypto';
import {units,makeQuestion,stageQuestions} from './route-catalog.mjs';
import {archiveAssessment,rememberAttempt,publicTeaching,assignmentForPractice,countAssignedAttempt} from './teaching-service.mjs';
const time=()=>new Date().toISOString();
export function freshRoute(){return {version:'js-orders-1',contentRevisions:{aggregate:2,debug:2},selected:units[0].id,progress:{},stages:{},events:[],exam:null,current:null,attempts:[],assessments:[]};}
function progress(r,id){return r.progress[id] ||= {trained:[],passed:false,needs:0};}
function allowed(r,id){const index=units.findIndex(u=>u.id===id);return index===0 || certified(r.progress[units[index-1].id]);}
export function publicRoute(r=freshRoute()){
 const inExam=Boolean(r.exam&&!r.exam.finished&&!r.exam.paused);
 const q=inExam?r.exam.questions[r.exam.index]:r.current;
 return {contentNotice:r.contentNotice||null,debugContentNotice:r.debugContentNotice||null,version:r.version,selected:r.selected,units:units.map(u=>({...u,...(r.progress[u.id]||{trained:[],passed:false,needs:0}),retention:u.id==='debug'?debugRetention(r):null,automaticPassed:Boolean(r.progress[u.id]?.passed),passed:certified(r.progress[u.id]),verificationSource:r.progress[u.id]?.latestVerificationSource||(r.progress[u.id]?.passed?'automatic':r.progress[u.id]?.reviewPassed?'manual':null),remediation:remediationView(r.progress[u.id]),updatedChecks:u.id==='validation'&&Boolean(r.progress[u.id]?.passed)&&(r.progress[u.id]?.verificationRevision||1)<2,locked:false,certificationPrerequisitesPending:!allowed(r,u.id)||u.stage!=='S0'&&!certified(r.stages[u.stage==='S1'?'S0':'S1'])})),stages:Object.fromEntries(Object.entries(r.stages).map(([key,p])=>[key,{...p,automaticPassed:Boolean(p.passed),passed:certified(p),verificationSource:p.latestVerificationSource||(p.passed?'automatic':p.reviewPassed?'manual':null)}])),lab:publicLab(r),labs:publicLabs(r),question:q?{debugTools:q.debugVersion===2&&!inExam?{variant:q.variant,sequence:q.debugSpec.sequence,fn:q.fn,scaffold:q.scaffold,formatExample:q.formatExample,defaultTest:q.defaultTest,hintLevel:Math.min(3,r.events.filter(e=>e.kind==='hint'&&e.questionId===q.id).length),hasCounterexample:regressionsFor(r,q).length>0}:null,contentRevision:q.contentRevision||1,context:taskContext(q),knowledge:inExam?undefined:knowledgeFor(q),id:q.id,unitId:q.unitId,kind:q.kind,brief:q.brief,code:q.starter,options:q.options,projectMode:q.projectMode,projectExam:q.projectExam||false,assignmentId:q.assignmentId||null,labId:q.labId||r.labId||null}:null,exam:r.exam?{id:r.exam.id,purpose:r.exam.purpose||'qualification',target:r.exam.target,stage:r.exam.stage,index:r.exam.index,total:r.exam.questions.length,finished:r.exam.finished||false,paused:r.exam.paused||false,passed:r.exam.passed||r.exam.reviewPassed||false,automaticPassed:r.exam.passed||false,status:!r.exam.finished?'in-progress':r.exam.reviewPassed?'review-passed':r.exam.reviewOutcome==='needs-practice'?'failed':r.exam.status||(r.exam.passed?'passed':'failed'),weak:r.exam.weak||[],legacyContent:r.exam.legacyContent||false}:null,events:r.events.map(e=>({...e,result:e.kind.startsWith('assessment')?undefined:e.result}))};
}
export async function handleRoute(state,body,run,projectFiles){
 const r=state.route ||= freshRoute();upgradeAggregate(state);upgradeDebug(state);archiveAssessment(r);ensureLabs(r);let feedback='';
 const currentUnit=()=>units.find(u=>u.id===r.selected);
 const stageOpen=u=>u.stage==='S0'||certified(r.stages[u.stage==='S1'?'S0':'S1']);
 const active=()=>r.exam&&!r.exam.finished&&!r.exam.paused;
 const add=(kind,extra={})=>r.events.push({id:randomUUID(),kind,at:time(),...extra});
 if(body.action==='select'){
  if(active())throw new Error('请先保存并离开当前考核，再切换 Lab');
  const u=units.find(u=>u.id===body.unitId);
  const id=body.labId||(u&&(r.unitLastLab[u.id]||labId(u.id,nextVariant(r,u.id))));
  if(!id)throw new Error('请选择有效 Lab');
  const source=['recommended','bridge'].includes(body.entry)?body.entry:'direct';enterLab(r,id,source);
  add('lab-enter',{unitId:r.selected,labId:r.labId,source});
 }else if(body.action==='lab-draft'){
  if(active())throw new Error('考核草稿由当前题目单独保存');
  const session=ensureLabs(r);if(!r.current||r.current.id!==body.questionId||body.labId!==r.labId)throw new Error('Lab 已切换，请恢复当前现场后再保存');
  if(session.draft?.baseCode&&body.baseCode!==session.draft.baseCode&&body.baseCode!==session.draft.code){session.savedDrafts ||= [];session.savedDrafts.push(session.draft);}
  session.draft={baseCode:typeof body.baseCode==='string'?body.baseCode.slice(0,16000):null,questionId:r.current.id,code:String(body.code??'').slice(0,16000),answer:String(body.answer??'').slice(0,1000),testArgs:typeof body.testArgs==='string'?body.testArgs.slice(0,8000):null,testExpected:typeof body.testExpected==='string'?body.testExpected.slice(0,4000):null,file:['store.cjs','app.cjs','README.md'].includes(body.file)?body.file:null,at:time()};
  session.question=r.current;
 }else if(body.action==='diagnostic-start'){
  if(active())throw new Error('请先保存并离开当前考核');startDiagnostic(r);add('diagnostic-start',{unitId:r.selected,labId:r.labId});
 }else if(body.action==='diagnostic-skip'){
  if(active())throw new Error('请先保存并离开当前考核');const session=ensureLabs(r);session.entry={...session.entry,status:'skipped',reason:'已选择直接探索；需要时可补基础或重新诊断。',finishedAt:time()};r.current=session.question||null;add('diagnostic-skipped',{unitId:r.selected,labId:r.labId});
 }else if(body.action==='diagnostic-answer'){
  if(active())throw new Error('请先保存并离开当前考核');const session=ensureLabs(r),d=session.entry;
  if(d.status!=='active')throw new Error('当前没有进行中的入口诊断');const q=d.questions[d.index];if(body.questionId!==q.id)throw new Error('诊断题目已更新');
  const result=await run(q,body);const attempt=rememberAttempt(state,{...q,labId:r.labId,unitId:r.selected,diagnosticFor:q.unitId},body,result,null,null);
  d.answers.push({unitId:q.unitId,passed:attempt.passed,attemptId:attempt.id});d.index++;
  add('diagnostic-result',{unitId:r.selected,labId:r.labId,passed:attempt.passed,attemptId:attempt.id});
  if(d.index===d.questions.length){d.weak=[...new Set(d.answers.filter(a=>!a.passed).map(a=>a.unitId))];d.status=d.weak.length?'gaps':'passed';d.finishedAt=time();d.reason=d.weak.length?'发现一些基础缺口。可以先做桥接 Lab，也可以带着提示继续。':'入口诊断通过，可以减少引导直接开始；这不代表出口考核通过。';r.current=session.question||null;}
  feedback=attempt.passed?'本项入口检查通过。':'这项基础值得回看；可先补充，也可直接探索。';
 }else if(body.action==='exam-pause'){
  if(!active())throw new Error('当前没有进行中的考核');r.exam.paused=true;add('assessment-paused',{unitId:r.exam.unitId,examId:r.exam.id});feedback='考核已保存，可以切换 Lab；回来后从原题继续。';
 }else if(body.action==='exam-resume'){
  if(!r.exam||r.exam.finished)throw new Error('没有待恢复的考核');stashLab(r);r.selected=r.exam.unitId;r.labId=r.exam.labId||labId(r.selected,0);ensureLabs(r);r.exam.paused=false;r.current=null;add('assessment-resumed',{unitId:r.selected,examId:r.exam.id});
 }else if(body.action==='teacher-practice'){
  if(active())throw new Error('请先完成当前独立考核，再开始教师补练');
  const assignment=assignmentForPractice(state,body.assignmentId);
  stashLab(r);enterLab(r,assignment.labId||labId(assignment.unitId,assignment.variant),'teacher');
  r.current=r.assignmentSessions[assignment.id]||null;
  if(!r.current){r.current={...makeQuestion(assignment.unitId,assignment.variant,'train',{legacy:assignment.contentRevision===1}),labId:r.labId,assignmentId:assignment.id};r.assignmentSessions[assignment.id]=r.current;add('practice-open',{unitId:assignment.unitId,questionId:r.current.id,assignmentId:assignment.id});}
 }else if(body.action==='remediation-practice'){
  if(active())throw new Error('请先完成或保存并离开考核');const plan=remediationView(r.progress[r.selected]);if(!plan)throw new Error('当前没有带概念定位的补练');
  const id=labId(r.selected,plan.nextVariant);if(r.labId!==id)enterLab(r,id,'recommended');const session=ensureLabs(r);
  const inFlight=session.question;const resume=Boolean(inFlight&&inFlight.createdAt>=plan.startedAt&&questionSkills(inFlight).some(key=>plan.targets.some(t=>t.key===key))&&!plan.attempts.some(a=>a.questionId===inFlight.id||a.variant===inFlight.variant&&a.seed===inFlight.caseSeed));
  if(session.question&&!resume){session.savedScenes ||= [];session.savedScenes.push({question:session.question,draft:session.draft,lastResult:session.lastResult});session.savedDrafts ||= [];session.savedDrafts.push({questionId:session.question.id,code:session.draft?.code||session.question.starter,answer:session.draft?.answer||'',at:time(),reason:'匹配补练前保留的草稿'});}
  session.entry={status:'ready',reason:'按已结束考核的薄弱概念生成补练',weak:[]};session.source='recommended';
  const previousSeeds=r.progress[r.selected].remediation.attempts.filter(a=>a.variant===plan.nextVariant).map(a=>a.seed);let question=resume?inFlight:startLabQuestion(r,id);r.current=question;for(let retry=0;!resume&&previousSeeds.includes(question.caseSeed)&&retry<100;retry++)question=startLabQuestion(r,id);
  add('remediation-open',{unitId:r.selected,questionId:question.id,labId:id});
 }else if(body.action==='practice'){
  if(active())throw new Error('考核中不开放训练');const u=currentUnit();
  const id=body.labId||labId(u.id,nextVariant(r,u.id));
  if(r.labId!==id)enterLab(r,id,'recommended');
  const q=startLabQuestion(r,id);add('practice-open',{unitId:q.unitId,questionId:q.id,labId:id});
 }else if(body.action==='debug-test'){feedback=await tryDebugTest(state,body,run);add('debug-test',{unitId:'debug',questionId:r.current.id});
 }else if(body.action==='knowledge'){
  if(active())throw new Error('独立考核不开放知识点查阅');if(!r.current||r.current.id!==body.questionId)throw new Error('题目已切换，请恢复当前练习后再查阅');add('knowledge-open',{unitId:r.selected,questionId:r.current.id,labId:r.labId});
 }else if(body.action==='hint'){
  if(active())throw new Error('独立考核不开放提示或 AI');if(!r.current)throw new Error('先开始训练');const level=Math.min(3,r.events.filter(e=>e.kind==='hint'&&e.questionId===r.current.id).length+1);feedback=r.current.hints?'提示 '+level+'/3：'+r.current.hints[level-1]:r.current.tip;add('hint',{unitId:r.selected,questionId:r.current.id,level});
 }else if(body.action==='unit-exam'||body.action==='stage-exam'||body.action==='debug-retest'){
  if(r.exam&&!r.exam.finished){stashLab(r);r.selected=r.exam.unitId;r.labId=r.exam.labId||labId(r.selected,0);ensureLabs(r);r.exam.paused=false;r.current=null;return {route:publicRoute(r),teaching:publicTeaching(state),feedback:'已恢复原有考核'};}
  const u=currentUnit(),p=progress(r,u.id);if(body.action==='debug-retest'&&(u.id!=='debug'||!debugRetention(r)?.available))throw new Error('延迟复测尚未到期；可先自由练习，原通过记录保留。');const stage=body.action==='unit-exam'?u.stage:body.stage||u.stage;
  if(body.action==='unit-exam'&&(p.trained.length<u.trainingCount||p.needs>0))throw new Error('先完成训练覆盖与针对性补练');
  if(body.action==='stage-exam'&&(!['S0','S1','S2'].includes(stage)||!units.filter(x=>x.stage===stage).every(x=>certified(r.progress[x.id]))))throw new Error('本阶段所有能力单元通过后，才能参加综合考核');
  const questions=body.action==='stage-exam'?stageQuestions(stage):Array.from({length:u.id==='branch'?6:u.stage==='S2'&&u.id!=='modules'?1:4},(_,i)=>makeQuestion(u.id,i,body.action==='debug-retest'?'delayed':'exam'));
  stashLab(r);
  r.exam={purpose:body.action==='debug-retest'?'delayed':'qualification',verificationRevision:Math.min(...questions.map(q=>q.contentRevision||1)),labId:r.labId,id:randomUUID(),target:body.action==='stage-exam'?'stage':'unit',stage,unitId:u.id,questions,index:0,answers:[],at:time()};r.current=null;add('assessment-start',{stage,target:r.exam.target,examId:r.exam.id});
 }else if(body.action==='answer'){
  const exam=active()?r.exam:null,q=exam?exam.questions[exam.index]:r.current;
  if(!q||q.id!==body.questionId)throw new Error('题目已更新，请恢复后继续');
  if(q.assignmentId)assignmentForPractice(state,q.assignmentId);
  const studentTests=!exam&&q.debugVersion===2?regressionsFor(r,q):[];if(!exam&&q.debugVersion===2&&!studentTests.length)throw new Error('先在代码下方试运行一个预期正确、能暴露初始缺陷的反例，再提交完整验收。');
  const result=await run(studentTests.length?{...q,cases:[...q.cases,...studentTests.map((c,i)=>({...c.test,name:'学生回归反例 '+(i+1)}))]}:q,body);
  const project=q.kind==='project'?await projectFiles():null;
  const attempt=rememberAttempt(state,q,body,result,exam,project),passed=attempt.passed;
  if(q.assignmentId)countAssignedAttempt(state,attempt);
  if(!exam)ensureLabs(r).lastResult={status:attempt.status,questionId:q.id,passed,code:attempt.code,answer:attempt.answer,at:time(),output:result.output,checks:result.checks||[],error:result.error||null,diagnostic:result.diagnostic||null};
  if(attempt.status==='unassessed'){const evaluation=queueEvaluation(state,attempt);if(!exam)ensureLabs(r).lastResult.reviewId=evaluation.id;}
  if(result.error){
   add(exam?'assessment-run-error':'training-result',{unitId:q.unitId,questionId:q.id,attemptId:attempt.id,assignmentId:q.assignmentId||null,passed:false,result:exam?undefined:result});
   feedback=(result.diagnostic?.title||'执行未完成')+'。本次尝试已记录，请修改后重试。';
  }else if(exam){
   exam.answers.push({unitId:q.unitId,questionId:q.id,attemptId:attempt.id,status:attempt.status,code:body.code||null,answer:body.answer??null,passed,sourceHash:result.sourceHash,checks:result.checks,projectEvidence:result.projectEvidence});exam.index++;add('assessment-answer',{unitId:q.unitId,attemptId:attempt.id,examId:exam.id});
   feedback='答案已记录，交卷后统一反馈。';
   if(exam.index===exam.questions.length){exam.finished=true;exam.finishedAt=time();exam.weak=[...new Set(exam.answers.filter(a=>!a.passed&&a.status!=='unassessed').map(a=>a.unitId))];exam.status=exam.weak.length?'failed':exam.answers.some(a=>a.status==='unassessed')?'unassessed':'passed';exam.passed=exam.status==='passed';
    if(exam.purpose==='delayed'){r.retention ||= {};r.retention.debug={at:exam.finishedAt,passed:exam.passed,examId:exam.id,weak:exam.weak};}
    else if(!exam.legacyContent){if(exam.passed){if(exam.target==='unit'){progress(r,exam.unitId).passed=true;progress(r,exam.unitId).latestVerificationSource='automatic';progress(r,exam.unitId).verificationRevision=exam.verificationRevision;}else r.stages[exam.stage]={passed:true,at:time(),examId:exam.id};}
    else if(exam.status==='failed'){r.stages[exam.stage]={passed:false,at:time(),examId:exam.id};r.selected=exam.weak[0];}
    if(!exam.passed) for(const id of exam.weak){const p=progress(r,id);p.passed=false;p.reviewPassed=false;p.latestVerificationSource=null;const keys=exam.answers.filter(a=>a.unitId===id&&!a.passed&&a.status!=='unassessed').flatMap(a=>{const question=exam.questions.find(q=>q.id===a.questionId);return failedSkills(question,r.attempts.find(t=>t.id===a.attemptId)?.checks||[]);});assignRemediation(r,id,keys);}}
    archiveAssessment(r);
    add('assessment-finished',{stage:exam.stage,target:exam.target,examId:exam.id,passed:exam.passed,weak:exam.weak});feedback=exam.purpose==='delayed'?(exam.passed?'延迟复测通过，已单独记录本次表现。':'延迟复测发现需要复习的内容，结果单独记录，原通过记录保留。'):exam.status==='unassessed'?'考核作答已保存，存在自动无法评估的项目，等待教师核对；未记为答错。':exam.legacyContent?'旧版考核成绩已保留；更新后的 Lab 需独立训练与考核。':exam.passed?(exam.target==='stage'?'阶段综合考核通过，可以进入下一阶段。':'单元考核通过，可以继续下一单元。'):'尚未通过。请完成系统列出的匹配补练，再重新考核。';
   }
  }else{
   const legacyKey=q.unitId==='debug'?'legacyDebug':'legacyAggregate';const p=legacyAggregate(q)||legacyDebug(q)?(r[legacyKey] ||= {progress:{trained:[],passed:false,needs:0}}).progress:progress(r,q.unitId);add('training-result',{unitId:q.unitId,questionId:q.id,attemptId:attempt.id,assignmentId:q.assignmentId||null,passed,result});
   if(passed){if(!p.trained.includes(q.variant))p.trained.push(q.variant);if(p.needs>0){if(legacyAggregate(q)||legacyDebug(q))p.needs--;else creditRemediation(r,q,attempt.id);}const session=ensureLabs(r);session.completedAt=time();if(q.assignmentId)delete r.assignmentSessions[q.assignmentId];else session.question=null;r.current=null;}
   feedback=attempt.status==='unassessed'?'自动检查无法完成，已进入教师核对队列；未记为答错，可保留原代码继续探索。':passed?(q.assignmentId?'本项指定补练通过，结果已反馈给教师。':'训练通过；这不等于考核通过。'):result.output!==undefined?'与真实输出不同：'+result.output:'部分检查未通过，请查看代码下方的输入、预期和实际结果。';
  }
 }else if(body.action!=='resume')throw new Error('未知路线操作');
 if(r.current&&!r.current.assignmentId&&!(r.exam&&!r.exam.finished&&!r.exam.paused))ensureLabs(r).question=r.current;
 ensureLabs(r);
 const response={route:publicRoute(r),teaching:publicTeaching(state),feedback};
 if(response.route.question?.kind==='project')response.project=await projectFiles();
 return response;
}

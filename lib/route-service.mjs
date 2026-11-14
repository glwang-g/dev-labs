import {upgradeAggregate,legacyAggregate} from './aggregate-upgrade.mjs';
import {taskContext,knowledgeFor} from './task-guidance.mjs';
import {labId,getLab,ensureLabs,stashLab,enterLab,startLabQuestion,startDiagnostic,publicLab,publicLabs,nextVariant} from './lab-service.mjs';
import {randomUUID} from 'node:crypto';
import {units,makeQuestion,stageQuestions} from './route-catalog.mjs';
import {archiveAssessment,rememberAttempt,publicTeaching,assignmentForPractice,countAssignedAttempt} from './teaching-service.mjs';
const time=()=>new Date().toISOString();
export function freshRoute(){return {version:'js-orders-1',contentRevisions:{aggregate:2},selected:units[0].id,progress:{},stages:{},events:[],exam:null,current:null,attempts:[],assessments:[]};}
function progress(r,id){return r.progress[id] ||= {trained:[],passed:false,needs:0};}
function allowed(r,id){const index=units.findIndex(u=>u.id===id);return index===0 || r.progress[units[index-1].id]?.passed;}
export function publicRoute(r=freshRoute()){
 const inExam=Boolean(r.exam&&!r.exam.finished&&!r.exam.paused);
 const q=inExam?r.exam.questions[r.exam.index]:r.current;
 return {contentNotice:r.contentNotice||null,version:r.version,selected:r.selected,units:units.map(u=>({...u,...(r.progress[u.id]||{trained:[],passed:false,needs:0}),locked:false,certificationPrerequisitesPending:!allowed(r,u.id)||u.stage!=='S0'&&!r.stages[u.stage==='S1'?'S0':'S1']?.passed})),stages:r.stages,lab:publicLab(r),labs:publicLabs(r),question:q?{context:taskContext(q),knowledge:inExam?undefined:knowledgeFor(q),id:q.id,unitId:q.unitId,kind:q.kind,brief:q.brief,code:q.starter,options:q.options,projectMode:q.projectMode,projectExam:q.projectExam||false,assignmentId:q.assignmentId||null,labId:q.labId||r.labId||null}:null,exam:r.exam?{id:r.exam.id,target:r.exam.target,stage:r.exam.stage,index:r.exam.index,total:r.exam.questions.length,finished:r.exam.finished||false,paused:r.exam.paused||false,passed:r.exam.passed||false,weak:r.exam.weak||[],legacyContent:r.exam.legacyContent||false}:null,events:r.events.map(e=>({...e,result:e.kind.startsWith('assessment')?undefined:e.result}))};
}
export async function handleRoute(state,body,run,projectFiles){
 const r=state.route ||= freshRoute();upgradeAggregate(state);archiveAssessment(r);ensureLabs(r);let feedback='';
 const currentUnit=()=>units.find(u=>u.id===r.selected);
 const stageOpen=u=>u.stage==='S0'||r.stages[u.stage==='S1'?'S0':'S1']?.passed;
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
  session.draft={baseCode:typeof body.baseCode==='string'?body.baseCode.slice(0,16000):null,questionId:r.current.id,code:String(body.code??'').slice(0,16000),answer:String(body.answer??'').slice(0,1000),file:['store.cjs','app.cjs','README.md'].includes(body.file)?body.file:null,at:time()};
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
 }else if(body.action==='practice'){
  if(active())throw new Error('考核中不开放训练');const u=currentUnit();
  const id=body.labId||labId(u.id,nextVariant(r,u.id));
  if(r.labId!==id)enterLab(r,id,'recommended');
  const q=startLabQuestion(r,id);add('practice-open',{unitId:q.unitId,questionId:q.id,labId:id});
 }else if(body.action==='knowledge'){
  if(active())throw new Error('独立考核不开放知识点查阅');if(!r.current||r.current.id!==body.questionId)throw new Error('题目已切换，请恢复当前练习后再查阅');add('knowledge-open',{unitId:r.selected,questionId:r.current.id,labId:r.labId});
 }else if(body.action==='hint'){
  if(active())throw new Error('独立考核不开放提示或 AI');if(!r.current)throw new Error('先开始训练');feedback=r.current.tip;add('hint',{unitId:r.selected,questionId:r.current.id});
 }else if(body.action==='unit-exam'||body.action==='stage-exam'){
  if(r.exam&&!r.exam.finished){stashLab(r);r.selected=r.exam.unitId;r.labId=r.exam.labId||labId(r.selected,0);ensureLabs(r);r.exam.paused=false;r.current=null;return {route:publicRoute(r),teaching:publicTeaching(state),feedback:'已恢复原有考核'};}
  const u=currentUnit(),p=progress(r,u.id),stage=body.action==='unit-exam'?u.stage:body.stage||u.stage;
  if(body.action==='unit-exam'&&(p.trained.length<u.trainingCount||p.needs>0))throw new Error('先完成训练覆盖与针对性补练');
  if(body.action==='stage-exam'&&(!['S0','S1','S2'].includes(stage)||!units.filter(x=>x.stage===stage).every(x=>r.progress[x.id]?.passed)))throw new Error('本阶段所有能力单元通过后，才能参加综合考核');
  const questions=body.action==='stage-exam'?stageQuestions(stage):Array.from({length:u.id==='branch'?6:u.stage==='S2'&&u.id!=='modules'?1:4},(_,i)=>makeQuestion(u.id,i,'exam'));
  stashLab(r);
  r.exam={labId:r.labId,id:randomUUID(),target:body.action==='stage-exam'?'stage':'unit',stage,unitId:u.id,questions,index:0,answers:[],at:time()};r.current=null;add('assessment-start',{stage,target:r.exam.target,examId:r.exam.id});
 }else if(body.action==='answer'){
  const exam=active()?r.exam:null,q=exam?exam.questions[exam.index]:r.current;
  if(!q||q.id!==body.questionId)throw new Error('题目已更新，请恢复后继续');
  if(q.assignmentId)assignmentForPractice(state,q.assignmentId);
  const result=await run(q,body);
  const project=q.kind==='project'?await projectFiles():null;
  const attempt=rememberAttempt(state,q,body,result,exam,project),passed=attempt.passed;
  if(q.assignmentId)countAssignedAttempt(state,attempt);
  if(!exam)ensureLabs(r).lastResult={passed,code:attempt.code,answer:attempt.answer,at:time(),output:result.output,checks:result.checks||[],error:result.error||null};
  if(result.error){
   add(exam?'assessment-run-error':'training-result',{unitId:q.unitId,questionId:q.id,attemptId:attempt.id,assignmentId:q.assignmentId||null,passed:false,result:exam?undefined:result});
   feedback='执行未完成：'+result.error+'。本次尝试已记录，请修改后重试。';
  }else if(exam){
   exam.answers.push({unitId:q.unitId,questionId:q.id,attemptId:attempt.id,code:body.code||null,answer:body.answer??null,passed,sourceHash:result.sourceHash,checks:result.checks,projectEvidence:result.projectEvidence});exam.index++;add('assessment-answer',{unitId:q.unitId,attemptId:attempt.id,examId:exam.id});
   feedback='答案已记录，交卷后统一反馈。';
   if(exam.index===exam.questions.length){exam.finished=true;exam.finishedAt=time();exam.weak=[...new Set(exam.answers.filter(a=>!a.passed).map(a=>a.unitId))];exam.passed=!exam.weak.length;
    if(!exam.legacyContent){if(exam.passed){if(exam.target==='unit')progress(r,exam.unitId).passed=true;else r.stages[exam.stage]={passed:true,at:time(),examId:exam.id};}
    else {r.stages[exam.stage]={passed:false,at:time(),examId:exam.id};r.selected=exam.weak[0];}
    if(!exam.passed) for(const id of exam.weak){const p=progress(r,id);p.needs=2;p.passed=false;}}
    archiveAssessment(r);
    add('assessment-finished',{stage:exam.stage,target:exam.target,examId:exam.id,passed:exam.passed,weak:exam.weak});feedback=exam.legacyContent?'旧版考核已完成，成绩保留；新版第 3、4 题需单独训练和考核。':exam.passed?(exam.target==='stage'?'阶段综合考核通过，可以进入下一阶段。':'单元考核通过，可以继续下一单元。'):'尚未通过。请按薄弱点补练两个新任务，再重新考核。';
   }
  }else{
   const p=legacyAggregate(q)?(r.legacyAggregate ||= {progress:{trained:[],passed:false,needs:0}}).progress:progress(r,q.unitId);add('training-result',{unitId:q.unitId,questionId:q.id,attemptId:attempt.id,assignmentId:q.assignmentId||null,passed,result});
   if(passed){if(!p.trained.includes(q.variant))p.trained.push(q.variant);if(p.needs>0)p.needs--;const session=ensureLabs(r);session.completedAt=time();if(q.assignmentId)delete r.assignmentSessions[q.assignmentId];else session.question=null;r.current=null;}
   feedback=passed?(q.assignmentId?'本项指定补练通过，结果已反馈给教师。':'训练通过；这不等于考核通过。'):result.output!==undefined?'与真实输出不同：'+result.output:JSON.stringify(result.checks);
  }
 }else if(body.action!=='resume')throw new Error('未知路线操作');
 if(r.current&&!r.current.assignmentId&&!(r.exam&&!r.exam.finished&&!r.exam.paused))ensureLabs(r).question=r.current;
 ensureLabs(r);
 const response={route:publicRoute(r),teaching:publicTeaching(state),feedback};
 if(response.route.question?.kind==='project')response.project=await projectFiles();
 return response;
}

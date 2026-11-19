import {units,conceptFor} from './route-catalog.mjs';
import {legacyDebug} from './debug-upgrade.mjs';
import {randomUUID} from 'node:crypto';
import {creditRemediation,assignRemediation,questionSkills} from './remediation.mjs';
export const effectiveStatus=item=>item?.reviewOutcome==='confirmed'?'review-passed':item?.reviewOutcome==='needs-practice'?'failed':item?.status||(item?.passed?'passed':'failed');
export const satisfied=item=>['passed','review-passed'].includes(effectiveStatus(item));
export function queueEvaluation(state,attempt){
 const store=state.teaching ||= {observations:[],assignments:[]};store.evaluations ||= [];
 const old=store.evaluations.find(e=>e.attemptId===attempt.id);if(old)return old;
 const request={id:randomUUID(),attemptId:attempt.id,questionId:attempt.question.id,unitId:attempt.unitId,unitTitle:units.find(u=>u.id===attempt.unitId)?.title||attempt.unitId,concept:attempt.question.concept||conceptFor(attempt.unitId,attempt.question.variant||0),labId:attempt.question.labId,examId:attempt.examId,assignmentId:attempt.assignmentId,status:'pending',at:new Date().toISOString(),reason:'自动检查无法完成，需人工核对约定规则。'};
 store.evaluations.push(request);return request;
}
export function resolveEvaluation(state,body){
 const request=state.teaching?.evaluations?.find(e=>e.id===body.evaluationId);
 if(!request||request.status!=='pending')throw new Error('这条自动验收复核不存在或已处理');
 if(request.examId&&!state.route.assessments?.some(e=>e.id===request.examId))throw new Error('请等待本次考核结束后再复核');
 const note=String(body.note||'').trim();if(note.length<10||note.length>4000||!['confirmed','needs-practice'].includes(body.verdict))throw new Error('请选择结论，并填写 10 至 4000 字的具体核对依据');
 const r=state.route,attempt=r.attempts.find(a=>a.id===request.attemptId);if(!attempt||attempt.status!=='unassessed')throw new Error('只能补充自动无法判定的记录，不能覆盖明确失败');
 request.status='resolved';request.verdict=body.verdict;request.note=note;request.finishedAt=new Date().toISOString();request.source='本机人工核对自动验收，未验证身份';
 // Preserve passed/status/checks as the original machine verdict; add separate evidence.
 attempt.reviewOutcome=body.verdict;attempt.evaluationId=request.id;
 const q=attempt.question;
 if(!attempt.examId){
  if(body.verdict==='confirmed'){
   const legacy=legacyDebug(q)||q.unitId==='aggregate'&&q.variant>=2&&q.contentRevision!==2;
   const legacyKey=q.unitId==='debug'?'legacyDebug':'legacyAggregate';
   const p=legacy?(r[legacyKey] ||= {progress:{trained:[],passed:false,needs:0}}).progress:(r.progress[attempt.unitId] ||= {trained:[],passed:false,needs:0});
   if(!p.trained.includes(q.variant))p.trained.push(q.variant);if(!legacy)creditRemediation(r,{...q,id:q.id},attempt.id);
   const session=r.labSessions?.[q.labId];if(session){session.completedAt=request.finishedAt;if(session.lastResult?.reviewId===request.id)session.lastResult.reviewOutcome='confirmed';} // Keep the question and draft available when review finishes.
   // Manual confirmation does not replace the student's current editing scene.
   if(attempt.assignmentId){delete r.assignmentSessions?.[attempt.assignmentId];const a=state.teaching.assignments.find(a=>a.id===attempt.assignmentId);if(a&&['assigned','working'].includes(a.status)&&a.roundAttemptIds.includes(attempt.id)){a.completedPasses=new Set(r.attempts.filter(x=>a.roundAttemptIds.includes(x.id)&&satisfied(x)).map(x=>x.question.id)).size;a.status=a.completedPasses>=a.requiredPasses?'awaiting-review':'working';}}
  }else{const session=r.labSessions?.[q.labId];if(session?.lastResult?.reviewId===request.id)session.lastResult.reviewOutcome='needs-practice';}
 }else{
  const archive=r.assessments.find(e=>e.id===attempt.examId),items=r.attempts.filter(a=>archive.attemptIds.includes(a.id));
  const pending=items.some(a=>effectiveStatus(a)==='unassessed'),failed=items.filter(a=>effectiveStatus(a)==='failed');
  archive.reviewPassed=!pending&&!failed.length;archive.reviewOutcome=archive.reviewPassed?'confirmed':pending?'pending':'needs-practice';
  if(r.exam?.id===archive.id){r.exam.reviewPassed=archive.reviewPassed;r.exam.reviewOutcome=archive.reviewOutcome;}
  const sameScope=e=>e.purpose!=='delayed'&&e.target===archive.target&&(archive.target==='unit'?e.unitId===archive.unitId:e.stage===archive.stage);
  const latest=r.assessments.filter(sameScope).at(-1);
  const newerActive=r.exam&&!r.exam.finished&&r.exam.id!==archive.id&&sameScope(r.exam);
  const affected=e=>e.target==='unit'?[e.unitId]:units.filter(u=>u.stage===e.stage).map(u=>u.id);
  const scopeUnits=affected(archive);
  const newerRelated=r.assessments.slice(r.assessments.indexOf(archive)+1).filter(e=>e.purpose!=='delayed').some(e=>affected(e).some(id=>scopeUnits.includes(id)));
  if(archive.purpose!=='delayed'&&!archive.legacyContent&&latest?.id===archive.id&&!newerActive&&!newerRelated){
   if(archive.reviewPassed){if(archive.target==='unit'){const p=r.progress[archive.unitId] ||= {trained:[],passed:false,needs:0};p.reviewPassed=true;p.latestVerificationSource='manual';p.reviewExamId=archive.id;p.needs=0;p.verificationRevision=Math.min(...items.map(a=>a.question.contentRevision||1));}else r.stages[archive.stage]={...(r.stages[archive.stage]||{passed:false}),reviewPassed:true,latestVerificationSource:'manual',reviewExamId:archive.id};}
   else if(body.verdict==='needs-practice'){assignRemediation(r,attempt.unitId,questionSkills(q));}
  }
 }
 return request;
}

import {taskContext} from './task-guidance.mjs';
import {randomUUID} from 'node:crypto';
import {units, unitConcepts, conceptFor} from './route-catalog.mjs';
const now=()=>new Date().toISOString();
const copy=value=>structuredClone(value);
const source='本机教师记录，未验证身份';
const editable=['store.cjs','app.cjs','README.md'];
const emptyTeaching=()=>({observations:[],assignments:[]});
export function publicTeaching(state){return copy(state.teaching||emptyTeaching());}
function teaching(state){return state.teaching ||= emptyTeaching();}
export function questionSnapshot(q){return {contentRevision:q.contentRevision||1,context:taskContext(q),id:q.id,unitId:q.unitId,kind:q.kind,brief:q.brief,code:q.starter,options:q.options,variant:q.variant??null,labId:q.labId||null,concept:q.diagnosticFor?'入口诊断 · '+(units.find(u=>u.id===q.diagnosticFor)?.title||q.diagnosticFor):q.variant===undefined?'跨概念综合应用':q.unitId==='aggregate'&&q.contentRevision!==2&&q.variant>=2?['过滤与求和','客户分组'][q.variant%2]+' · 旧版':conceptFor(q.unitId,q.variant)};}
export function rememberAttempt(state,q,body,result,exam,project){
 const route=state.route;route.attempts ||= [];
 const item={id:randomUUID(),at:now(),unitId:q.unitId,question:questionSnapshot(q),mode:exam?'assessment':q.diagnosticFor?'diagnostic':q.assignmentId?'teacher-practice':'training',examId:exam?.id||null,assignmentId:q.assignmentId||null,
  answer:body.answer??null,code:q.kind==='predict'?q.starter:body.code||null,passed:Boolean(result.passed)&&!result.error,accepted:!result.error,
  checks:copy(result.checks||[]),output:result.output,error:result.error||null,sourceHash:result.sourceHash||null,projectEvidence:copy(result.projectEvidence||null),
  projectSnapshot:project?Object.fromEntries(editable.filter(f=>typeof project[f]==='string').map(f=>[f,project[f]])):null,
  knowledgeViews:route.events.filter(e=>e.kind==='knowledge-open'&&e.questionId===q.id).length,
  hintsUsed:route.events.filter(e=>e.kind==='hint'&&e.questionId===q.id).length};
 route.attempts.push(item);return item;
}
export function archiveAssessment(route){
 const exam=route?.exam;if(!exam?.finished)return;
 route.assessments ||= [];route.attempts ||= [];
 if(route.assessments.some(e=>e.id===exam.id))return;
 // Preserve the last pre-upgrade assessment when its original questions exist.
 for(const answer of exam.answers||[])if(!answer.attemptId){
  const q=exam.questions?.find(q=>q.id===answer.questionId);
  const id=exam.id+':'+answer.questionId;
  if(!route.attempts.some(a=>a.id===id))route.attempts.push({id,at:exam.at,unitId:answer.unitId,question:q?questionSnapshot(q):{id:answer.questionId,unitId:answer.unitId,brief:'升级前的考核记录'},mode:'assessment',examId:exam.id,assignmentId:null,answer:answer.answer??null,code:answer.code||q?.starter||null,passed:answer.passed,accepted:true,checks:copy(answer.checks||[]),sourceHash:answer.sourceHash||null,projectEvidence:copy(answer.projectEvidence||null),projectSnapshot:null,hintsUsed:0,legacy:true});
  answer.attemptId=id;
 }
 route.assessments.push({legacyContent:exam.legacyContent||false,id:exam.id,target:exam.target,stage:exam.stage,unitId:exam.unitId,at:exam.at,finishedAt:exam.finishedAt||exam.at,passed:exam.passed,weak:copy(exam.weak||[]),attemptIds:(exam.answers||[]).map(a=>a.attemptId)});
}
export function summaryAssessment(exam){return {id:exam.id,target:exam.target,stage:exam.stage,unitId:exam.unitId,at:exam.at,finishedAt:exam.finishedAt,passed:exam.passed,weak:exam.weak};}
export function teachingReport(state,unitId,routeView){
 if(unitId&&!units.some(u=>u.id===unitId))throw new Error('能力单元不存在');
 const route=state.route,finished=new Set((route?.assessments||[]).map(e=>e.id));
 const attempts=(route?.attempts||[]).filter(a=>(!unitId||a.unitId===unitId)&&(!a.examId||finished.has(a.examId)));
 const assessments=(route?.assessments||[]).filter(e=>!unitId||attempts.some(a=>a.examId===e.id));
 return {units:routeView.units.map(u=>({...u,concepts:unitConcepts[u.id]})),unitId:unitId||null,attempts:copy(attempts),assessments:copy(assessments),teaching:publicTeaching(state),
  activeAssessment:route?.exam&&!route.exam.finished?{id:route.exam.id,stage:route.exam.stage,paused:Boolean(route.exam.paused),index:route.exam.index,total:route.exam.questions.length}:null};
}
function text(value,min,label,max=4000){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new Error(label+'请填写 '+min+' 至 '+max+' 个字符');return value.trim();}
function assessmentFor(state,id,unitId){if(!id)return null;const exam=state.route?.assessments?.find(e=>e.id===id);if(!exam||!(state.route.attempts||[]).some(a=>a.examId===id&&a.unitId===unitId))throw new Error('只能关联本单元已结束的考核');return exam;}
function event(state,kind,payload){state.learningEvents ||= [];state.learningEvents.push({sequence:state.learningEvents.length+1,at:now(),actor:'teacher',action:'teaching.'+kind,...payload});}
export function handleTeaching(state,body,routeView){
 const unit=units.find(u=>u.id===body.unitId);
 if(['observe','assign'].includes(body.action)&&!unit)throw new Error('能力单元不存在');
 const store=teaching(state);
 if(body.action==='observe'){
  const note=text(body.note,10,'具体观察'),prompt=String(body.prompt||'').slice(0,2000);
  if(!['baseline','difficulty','transfer','delayed','review'].includes(body.kind)||!['pass','needs-practice','not-observed'].includes(body.outcome)||!['none','hint','ai','external'].includes(body.help))throw new Error('请选择有效的观察类型、结论与实际帮助');
  assessmentFor(state,body.assessmentId,unit.id);
  const item={id:randomUUID(),at:now(),unitId:unit.id,assessmentId:body.assessmentId||null,kind:body.kind,outcome:body.outcome,help:body.help,prompt,note,source};
  store.observations.push(item);event(state,'observed',{unitId:unit.id,observationId:item.id});return item;
 }
 if(body.action==='assign'){
  const reason=text(body.reason,10,'补练原因'),variant=Number(body.variant),requiredPasses=Number(body.requiredPasses);
  if(!Number.isInteger(variant)||variant<0||variant>=unitConcepts[unit.id].length||!Number.isInteger(requiredPasses)||requiredPasses<1||requiredPasses>5)throw new Error('请选择有效概念与 1 至 5 个补练任务');
  const view=routeView.units.find(u=>u.id===unit.id);
  if(view.locked&&!(state.route?.attempts||[]).some(a=>a.unitId===unit.id))throw new Error('请先学习前置单元，再安排该单元补练');
  assessmentFor(state,body.assessmentId,unit.id);
  if(body.observationId&&!store.observations.some(o=>o.id===body.observationId&&o.unitId===unit.id))throw new Error('观察记录与能力单元不匹配');
  if(store.assignments.some(a=>a.unitId===unit.id&&a.variant===variant&&a.status!=='completed'))throw new Error('该概念已有待处理补练，请先完成当前任务');
  const item={id:randomUUID(),unitId:unit.id,unitTitle:unit.title,variant,concept:conceptFor(unit.id,variant),reason,requiredPasses,assessmentId:body.assessmentId||null,observationId:body.observationId||null,createdAt:now(),status:'assigned',completedPasses:0,round:1,attemptIds:[],roundAttemptIds:[],reviews:[],source};
  store.assignments.push(item);event(state,'assigned',{unitId:unit.id,assignmentId:item.id});return item;
 }
 if(body.action==='review-assignment'){
  const item=store.assignments.find(a=>a.id===body.assignmentId);
  if(!item||item.status!=='awaiting-review')throw new Error('补练任务尚未达到复核条件，或已复核');
  const note=text(body.note,10,'追问结果');if(!['confirmed','needs-practice'].includes(body.verdict))throw new Error('请选择有效复核结论');
  if(body.help&&!['none','hint','ai','external'].includes(body.help))throw new Error('请选择有效的实际帮助');
  const review={id:randomUUID(),at:now(),help:body.help||'none',prompt:String(body.prompt||'').slice(0,2000),round:item.round,verdict:body.verdict,note,attemptIds:copy(item.roundAttemptIds),source};item.reviews.push(review);
  if(body.verdict==='confirmed'){item.status='completed';item.completedAt=review.at;}else{item.status='assigned';item.round++;item.roundAttemptIds=[];item.completedPasses=0;}
  event(state,'reviewed',{unitId:item.unitId,assignmentId:item.id,verdict:body.verdict});return review;
 }
 throw new Error('未知教学操作');
}
export function assignmentForPractice(state,id){
 const assignment=state.teaching?.assignments.find(a=>a.id===id);
 if(!assignment||!['assigned','working'].includes(assignment.status))throw new Error('补练任务不存在、已完成或正等待教师复核');
 return assignment;
}
export function countAssignedAttempt(state,attempt){
 if(!attempt.assignmentId)return;
 const assignment=assignmentForPractice(state,attempt.assignmentId);
 if(assignment.attemptIds.includes(attempt.id))return;
 assignment.attemptIds.push(attempt.id);assignment.roundAttemptIds.push(attempt.id);
 const passed=state.route.attempts.filter(a=>assignment.roundAttemptIds.includes(a.id)&&a.passed);
 assignment.completedPasses=new Set(passed.map(a=>a.question.id)).size;
 assignment.status=assignment.completedPasses>=assignment.requiredPasses?'awaiting-review':'working';
}

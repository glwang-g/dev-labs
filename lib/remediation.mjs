import {conceptFor,unitConcepts} from './route-catalog.mjs';
export const certified=p=>Boolean((p?.passed||p?.reviewPassed)&&!p?.needs);
export const questionSkills=q=>q.skillKeys?.length?q.skillKeys:[`${q.unitId}:${(q.variant||0)%(unitConcepts[q.unitId]?.length||1)}`];
export function failedSkills(q,checks=[]){
 const keys=checks.filter(c=>!c.passed&&c.status!=='unassessed').flatMap(c=>c.skillKeys||[]);
 return [...new Set(keys.length?keys:questionSkills(q))];
}
export function assignRemediation(route,unitId,keys,at=new Date().toISOString()){
 const p=route.progress[unitId] ||= {trained:[],passed:false,needs:0};
 const targets=[...new Set(keys)].map(key=>{const variant=Number(key.split(':')[1])||0;return {key,variant,label:conceptFor(unitId,variant)};});
 p.remediation={targets,required:Math.max(2,targets.length),attempts:[],covered:[],startedAt:at};p.needs=p.remediation.required;
}
export function creditRemediation(route,q,attemptId){
 const p=route.progress[q.unitId];if(!p?.needs)return false;
 const plan=p.remediation;
 // Legacy counters are retained as legacy counters, without inventing failed concepts.
 if(!plan){p.needs--;return true;}
 if(!q.createdAt||q.createdAt<plan.startedAt)return false;
 const matching=questionSkills(q).filter(key=>plan.targets.some(t=>t.key===key));
 if(!matching.length||plan.attempts.some(a=>a.questionId===q.id)||plan.attempts.some(a=>a.seed===q.caseSeed&&a.variant===q.variant&&q.caseSeed!==undefined))return false;
 plan.attempts.push({questionId:q.id,attemptId,variant:q.variant,seed:q.caseSeed});plan.covered=[...new Set([...plan.covered,...matching])];
 p.needs=Math.max(0,plan.required-plan.attempts.length,plan.targets.filter(t=>!plan.covered.includes(t.key)).length);return true;
}
export function remediationView(p){
 const plan=p?.remediation;if(!plan||!p.needs)return null;
 const target=plan.targets.find(t=>!plan.covered.includes(t.key))||plan.targets[0];
 return {...plan,nextVariant:target.variant,nextLabel:target.label};
}

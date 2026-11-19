import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parseDebugTest} from './debug-curriculum.mjs';
export const regressionsFor=(route,q)=>(route.labSessions?.[q.labId]?.regressions||[]).filter(c=>c.questionId===q.id).slice(0,4);
export async function tryDebugTest(state,body,run){
 const r=state.route,q=r.current;
 if(r.exam&&!r.exam.finished&&!r.exam.paused)throw new Error('独立考核关闭自建反例试运行。');
 if(!q||q.id!==body.questionId||q.debugVersion!==2)throw new Error('请先进入新版调试训练 Lab。');
 if(typeof body.testArgs!=='string'||body.testArgs.length>8000||typeof body.testExpected!=='string'||body.testExpected.length>4000)throw new Error('试运行输入或预期过长。');
 const {test,oracle}=parseDebugTest(q,body),expectedValid=isDeepStrictEqual(test.expected,oracle);
 const baseline=await run({...q,cases:[test]},{code:q.starter});
 const candidate=await run({...q,cases:[test]},{code:body.code});
 const exposesBug=expectedValid&&!baseline.error&&!baseline.passed;
 const check=candidate.checks?.[0],old=baseline.checks?.[0];
 const trial={id:randomUUID(),at:new Date().toISOString(),unitId:'debug',questionId:q.id,labId:q.labId,concept:q.variant,inputText:body.testArgs,expectedText:body.testExpected,code:String(body.code||''),sourceHash:candidate.sourceHash,baselineSourceHash:baseline.sourceHash,test,expectedValid,exposesBug,baseline:{actual:old?.actual,error:baseline.error||null},candidate:{actual:check?.actual,passed:Boolean(candidate.passed),error:candidate.error||null,diagnostic:candidate.diagnostic||null,logs:check?.logs||[]}};
 const session=r.labSessions[q.labId];session.regressions ||= [];
 if(exposesBug){const id=createHash('sha256').update(JSON.stringify(test)).digest('hex').slice(0,16);if(!session.regressions.some(c=>c.id===id&&c.questionId===q.id)&&regressionsFor(r,q).length<4)session.regressions.push({id,questionId:q.id,test,baselineSourceHash:baseline.sourceHash,baselineActual:old?.actual,at:trial.at});}
 session.lastTrial=trial;r.debugExperiments ||= [];r.debugExperiments.push(trial);
 return !expectedValid?'预期与需求约定不一致。已保留你的试运行结果，请重新核对预期。':!exposesBug?'预期符合需求，但这个输入未暴露初始缺陷。可尝试其他输入。':candidate.passed?'反例已验证并保留；当前代码通过了这个反例，还需要完成完整回归验收。':'反例已暴露初始缺陷并保留。请修改代码，再运行完整回归验收。';
}
export function debugRetention(route,clock=Date.now()){
 const first=(route.assessments||[]).find(e=>e.target==='unit'&&e.unitId==='debug'&&!e.legacyContent&&(e.passed||e.reviewPassed)&&e.purpose!=='delayed');
 if(!first)return null;
 const last=route.retention?.debug;
 const base=last?.at||first.finishedAt,days=last&&!last.passed?1:7;
 const dueAt=new Date(Date.parse(base)+days*86400000).toISOString();return {dueAt,available:clock>=Date.parse(dueAt),last:last||null};
}

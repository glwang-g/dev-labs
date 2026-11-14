import {randomUUID} from 'node:crypto';
import {units,makeQuestion,conceptFor,unitConcepts} from './route-catalog.mjs';
const now=()=>new Date().toISOString();
const prerequisites={values:[],branch:['values'],loops:['values','branch'],scope:['values'],data:['values'],aggregate:['loops','data'],validation:['aggregate'],debug:['branch','aggregate'],testing:['debug'],modules:['scope'],store:['modules'],http:['modules','store'],delivery:['testing','http']};
export const labId=(unitId,variant=0)=>`js-orders-${unitId}-${variant}${unitId==='aggregate'&&variant>=2?'-v2':''}`;
export const labs=units.flatMap(u=>Array.from({length:u.trainingCount},(_,variant)=>({id:labId(u.id,variant),unitId:u.id,stage:u.stage,variant,title:conceptFor(u.id,variant)+(u.trainingCount>unitConcepts[u.id].length?' · 变式 '+(variant+1):''),goal:u.goal,prerequisites:prerequisites[u.id],project:['store','http','delivery'].includes(u.id)})));
const legacyLabs=[2,3].map(variant=>({...labs.find(l=>l.unitId==='aggregate'&&l.variant===variant),id:`js-orders-aggregate-${variant}`,title:(variant===2?'过滤与求和':'客户分组')+' · 旧版',legacy:true,replacementId:labId('aggregate',variant)}));
export function getLab(id){const lab=[...labs,...legacyLabs].find(l=>l.id===id);if(!lab)throw new Error('Lab 不存在');return lab;}
export function nextVariant(route,unitId){const u=units.find(u=>u.id===unitId);const trained=route.progress[unitId]?.trained||[];return Array.from({length:u.trainingCount},(_,i)=>i).find(i=>!trained.includes(i))??0;}
export function ensureLabs(route){
 route.labSessions ||= {};route.assignmentSessions ||= {};route.unitLastLab ||= {};
 if(route.labId&&getLab(route.labId).unitId!==route.selected)route.labId=route.unitLastLab[route.selected]||null;
 if(!route.labId)route.labId=labId(route.selected,route.current?.variant??nextVariant(route,route.selected));
 if(route.current&&!route.current.labId)route.current.labId=route.labId;
 if(!route.labSessions[route.labId])route.labSessions[route.labId]={id:route.labId,source:'recommended',question:route.current&&!route.current.assignmentId?route.current:null,draft:null,entry:{status:'ready',reason:'继续已有学习现场',weak:[]},visitedAt:now()};
 route.unitLastLab[route.selected]=route.labId;
 return route.labSessions[route.labId];
}
export function stashLab(route){const session=ensureLabs(route);if(route.current?.assignmentId)route.assignmentSessions[route.current.assignmentId]=route.current;else session.question=route.current;}
export function recentEvidence(route,id){
 if(!route.progress[id]?.passed)return false;
 const latest=(route.assessments||[]).filter(e=>e.target==='unit'&&e.unitId===id&&e.passed).at(-1);
 return latest&&Date.now()-Date.parse(latest.finishedAt||latest.at)<=90*86400000;
}
export function enterLab(route,id,source='direct'){
 const lab=getLab(id),previousId=route.labId;stashLab(route);route.labId=id;route.selected=lab.unitId;route.unitLastLab[lab.unitId]=id;
 let session=route.labSessions[id];
 if(!session){const missing=lab.prerequisites.filter(id=>!recentEvidence(route,id));session=route.labSessions[id]={id,source,question:null,draft:null,visitedAt:now(),entry:{status:source==='teacher'||!missing.length?'ready':'pending',reason:source==='teacher'?'教师指定补练':missing.length?'建议用两道小题了解起点，可随时跳过。':'已有相关单元的近期独立考核记录，可直接开始。',weak:[],suggested:missing}};}
 else {session.source=source;if(session.entry.status==='pending'&&lab.prerequisites.every(id=>recentEvidence(route,id)))session.entry={status:'ready',reason:'相关单元已有近期独立考核记录，可以直接开始。',weak:[]};}
 if(source==='bridge'&&previousId!==id)session.returnTo=previousId;
 session.visitedAt=now();route.current=session.question||null;return session;
}
export function startLabQuestion(route,id){
 const lab=getLab(id);if(route.labId!==id)enterLab(route,id,'recommended');
 const session=ensureLabs(route);if(['pending','active'].includes(session.entry.status))throw new Error('可以先做入口诊断，也可以选择直接探索。');
 route.current={...makeQuestion(lab.unitId,lab.variant,'train',{legacy:lab.legacy}),labId:id};session.question=route.current;session.draft=null;session.lastResult=null;return route.current;
}
const choice=(unitId,brief,options,expected)=>({unitId,kind:'choice',brief,options,expected:String(expected),starter:''});
function diagnosticQuestion(id,index){
 if(index%2===1){if(id==='modules')return makeQuestion('modules',1,'diagnostic');if(id==='aggregate')return choice(id,'按客户分组时，同一客户出现多笔已支付订单，应该怎样处理？',['只保留最后一笔金额','累计该客户的所有已支付金额','直接使用订单总数'],1);if(id==='debug')return choice(id,'统计满足金额门槛的已支付订单，怎样的反例能发现漏掉状态过滤？',['一笔金额很大的 cancelled 订单','空字符串','一笔低于门槛的 paid 订单'],0);}
 if(['values','branch','loops','scope','data'].includes(id))return makeQuestion(id,index%4,'diagnostic');
 const items={
 aggregate:()=>choice(id,'统计已支付订单金额时，哪种处理顺序符合需求？',['累计所有金额后减去一笔取消订单','先按 paid 过滤，再累计金额；空数组结果为 0','只读取第一笔订单'],1),
 debug:()=>choice(id,'修复 >= 被误写为 > 的错误，哪个测试最关键？',['金额刚好等于门槛','随机的大金额','只检查程序没有报错'],0),
 testing:()=>choice(id,'新增接口后，怎样检查没有破坏原有功能？',['只打开新接口','同时运行原有回归与新需求测试','只检查代码格式'],1),
 modules:()=>choice(id,'package.json 的 start 为 node start.cjs，启动项目应执行什么？',['git status','node store.cjs','npm start'],2),
 store:()=>choice(id,'HTTP 处理器调用 store.load()，它应当获得什么？',['当前持久化的订单数组','HTTP 端口号','Git 提交记录'],0),
 http:()=>choice(id,'查询接口只读数据，通常应使用哪个方法并返回什么？',['GET，并返回约定的响应数据','每次都 POST，并删除数据','只返回一张截图'],0)
 };return items[id]?.()||makeQuestion('values',0,'diagnostic');
}
export function startDiagnostic(route){const session=ensureLabs(route),lab=getLab(route.labId);if(session.entry.status==='active')return;
 const deps=lab.prerequisites;if(!deps.length)throw new Error('这个 Lab 不需要前置诊断');
 const questions=Array.from({length:2},(_,i)=>({...diagnosticQuestion(deps[i%deps.length],i),id:randomUUID()}));
 session.entry={status:'active',reason:'两道入口小题，只用于推荐学习支架，不计入训练覆盖与通关。',questions,index:0,answers:[],weak:[],startedAt:now()};route.current=null;
}
export function publicLab(route){
 const lab=getLab(route.labId||labId(route.selected,0)),session=route.labSessions?.[lab.id];
 const entry=route.current?.assignmentId?{status:'ready',weak:[],reason:'教师指定补练，无需重复入口诊断'}:session?.entry||{status:'ready',weak:[],reason:'继续当前学习'};
 const question=entry.status==='active'?entry.questions[entry.index]:null;
 return {...lab,source:session?.source||'recommended',returnTo:session?.returnTo||null,draft:session?.draft||null,savedDrafts:session?.savedDrafts||[],lastResult:session?.lastResult||null,completedAt:session?.completedAt||null,completed:Boolean(session?.completedAt||(lab.legacy?route.legacyAggregate?.progress:route.progress[lab.unitId])?.trained?.includes(lab.variant)),entry:{status:entry.status,reason:entry.reason,weak:entry.weak||[],suggested:entry.suggested||[],at:entry.finishedAt||null,index:entry.index||0,total:entry.questions?.length||2,question:question?{id:question.id,kind:question.kind,unitId:question.unitId,brief:question.brief,code:question.starter,options:question.options}:null}};
}
export function publicLabs(route){return [...labs,...legacyLabs.filter(l=>route.labSessions?.[l.id]||route.labId===l.id)].map(l=>({...l,visited:Boolean(route.labSessions?.[l.id]),completed:Boolean(route.labSessions?.[l.id]?.completedAt||(l.legacy?route.legacyAggregate?.progress:route.progress[l.unitId])?.trained?.includes(l.variant))}));}

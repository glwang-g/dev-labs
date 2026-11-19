export const legacyDebug=q=>q?.unitId==='debug'&&q.contentRevision!==2;
export function upgradeDebug(state){
 const r=state.route;if(!r||r.contentRevisions?.debug===2)return;
 const old=r.progress?.debug,oldSessions=Object.keys(r.labSessions||{}).some(id=>/^js-orders-debug-\d$/.test(id));
 const affected=e=>e&&(e.target==='unit'&&e.unitId==='debug'||e.target==='stage'&&e.stage==='S1');
 r.legacyDebug={progress:structuredClone(old||{trained:[],passed:false,needs:0}),stage:structuredClone(r.stages?.S1||null)};
 const mark=q=>{if(q?.unitId==='debug')q.contentRevision ||= 1;};mark(r.current);
 for(const session of Object.values(r.labSessions||{}))mark(session.question);for(const q of Object.values(r.assignmentSessions||{}))mark(q);
 if(r.current?.unitId==='debug'&&!r.current.labId){r.current.labId=`js-orders-debug-${r.current.variant||0}`;r.labId=r.current.labId;}
 if(old)r.progress.debug={trained:[],passed:false,needs:0};
 if((old||oldSessions)&&r.stages?.S1)r.stages.S1={passed:false,contentUpdated:true};
 if(affected(r.exam)){r.exam.legacyContent=true;(r.exam.questions||[]).forEach(mark);}
 for(const exam of r.assessments||[])if(affected(exam))exam.legacyContent=true;
 for(const a of state.teaching?.assignments||[])if(a.unitId==='debug'){a.labId=`js-orders-debug-${a.variant}`;a.contentRevision=1;}
 if(r.unitLastLab?.debug&&r.selected!=='debug')r.unitLastLab.debug='js-orders-debug-0-v2';
 r.contentRevisions={...r.contentRevisions,debug:2};
 r.debugContentNotice=old||oldSessions?'调试单元已升级为四类不同缺陷。原题、草稿和旧成绩保留；新版需要独立训练与考核。':null;
}

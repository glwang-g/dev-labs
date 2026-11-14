// Keep the original questions, drafts and grades under their original identities.
export const legacyAggregate=q=>q?.unitId==='aggregate'&&q.variant>=2&&q.contentRevision!==2;
export function upgradeAggregate(state){
 const r=state.route;if(!r||r.contentRevisions?.aggregate===2)return;
 r.legacyAggregate={progress:structuredClone(r.progress?.aggregate||{trained:[],passed:false,needs:0}),stage:structuredClone(r.stages?.S1||null)};
 const mark=q=>{if(q?.unitId==='aggregate')q.contentRevision ||= 1;};
 mark(r.current);for(const s of Object.values(r.labSessions||{}))mark(s.question);for(const q of Object.values(r.assignmentSessions||{}))mark(q);
 if(legacyAggregate(r.current)&&!r.current.labId){r.current.labId=`js-orders-aggregate-${r.current.variant}`;r.labId=r.current.labId;}
 if(r.progress?.aggregate){r.progress.aggregate.trained=r.progress.aggregate.trained.filter(i=>i<2);r.progress.aggregate.passed=false;}
 if(r.stages?.S1)r.stages.S1={passed:false,contentUpdated:true};
 const affected=e=>e&&(e.target==='unit'&&e.unitId==='aggregate'||e.target==='stage'&&e.stage==='S1');
 if(affected(r.exam)){r.exam.legacyContent=true;(r.exam.questions||[]).forEach(mark);}
 for(const e of r.assessments||[])if(affected(e))e.legacyContent=true;
 for(const a of state.teaching?.assignments||[])if(a.unitId==='aggregate'&&a.variant>=2){a.labId=`js-orders-aggregate-${a.variant}`;a.contentRevision=1;}
 r.contentRevisions={...r.contentRevisions,aggregate:2};
 r.contentNotice='数据处理单元第 3、4 题已升级为多指标统计和函数组合。旧题、草稿及考核记录保留；新内容需要单独完成。';
}

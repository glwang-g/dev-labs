import { randomUUID, randomInt } from 'node:crypto';
export const skills=[{id:'choice',title:'条件真假与 if/else',goal:'判断两个分支分别何时执行',tip:'先判断条件是真还是假，再追踪实际执行的分支。'},{id:'boundary',title:'边界与组合条件',goal:'区分等于、低于边界，以及两个条件同时成立',tip:'分别检查状态和金额，注意 >= 包含等于，&& 要求两边都成立。'},{id:'priority',title:'多分支与匹配顺序',goal:'理解 else if 只执行首个满足条件的分支',tip:'从上往下检查；第一个成立的分支执行后，后面的 else if 不再执行。'}];
export const slots=skills.flatMap(s=>[0,1].map(variant=>({skill:s.id,variant,key:s.id+'-'+variant})));
export function question(slot,mode='train') {
  const n=mode==='exam'?randomInt(2000,9000):randomInt(100,900);
  let code,expected;
  if(slot.skill==='choice') {const paid=slot.variant===0;code=`const status = '${paid?'paid':'cancelled'}';\nlet total = 0;\nif (status === 'paid') {\n  total = ${n};\n} else {\n  total = ${n+7};\n}\nconsole.log(total);`;expected=String(paid?n:n+7);}
  if(slot.skill==='boundary') {const amount=slot.variant===0?n:n-1;code=`const amount = ${amount};\nconst status = 'paid';\nlet count = 0;\nif (status === 'paid' && amount >= ${n}) {\n  count = 1;\n}\nconsole.log(count);`;expected=slot.variant===0?'1':'0';}
  if(slot.skill==='priority') {const amount=slot.variant===0?n+10:n-1;code=`const amount = ${amount};\nlet fee = 0;\nif (amount >= ${n}) {\n  fee = 1;\n} else if (amount >= ${n-20}) {\n  fee = 2;\n} else {\n  fee = 3;\n}\nconsole.log(fee);`;expected=slot.variant===0?'1':'2';}
  return {id:randomUUID(),...slot,mode,kind:'predict',starter:code,expected};
}
export function freshUnit(){return {version:'branch-1',training:{},history:[],exams:[],current:null,needs:{}};}
export function publicUnit(u=freshUnit()) {
  const exam=u.exams.at(-1), active=exam&&!exam.finished;
  const q=active?exam.questions[exam.index]:u.current;
  const safe=q?{id:q.id,skill:q.skill,code:q.starter,mode:q.mode}:null;
  return {version:u.version,skills,covered:Object.keys(u.training).filter(k=>u.training[k]).length,total:slots.length,needs:u.needs,history:u.history.map(h=>h.kind==='exam-answer'?{kind:h.kind,skill:h.skill,questionId:h.questionId,at:h.at}:h),exams:u.exams.map(e=>({id:e.id,finished:e.finished||false,passed:e.passed||false,index:e.index,total:e.questions.length,weak:e.weak||[],at:e.at})),question:safe,exam:active?{id:exam.id,index:exam.index,total:exam.questions.length}:null,masteredAt:u.masteredAt||null,canExam:slots.every(s=>u.training[s.key])&&Object.values(u.needs).every(n=>n===0)};
}
export function nextTraining(u) {
  if(u.exams.at(-1)&&!u.exams.at(-1).finished)throw new Error('独立考核进行中，不能切换到训练');
  const weak=Object.keys(u.needs).find(k=>u.needs[k]>0);
  const slot=weak?slots.find(s=>s.skill===weak):slots.find(s=>!u.training[s.key])||slots[randomInt(slots.length)];
  u.current=question(slot);return u.current;
}
export function startExam(u) {
  if(u.exams.at(-1)&&!u.exams.at(-1).finished)return u.exams.at(-1);
  if(!publicUnit(u).canExam)throw new Error('先覆盖六类训练情境，并完成薄弱点补练，再开始独立考核');
  u.current=null;u.masteredAt=null;
  const exam={id:randomUUID(),at:new Date().toISOString(),questions:slots.map(s=>question(s,'exam')),index:0,answers:[]};
  for(let i=exam.questions.length-1;i>0;i--){const j=randomInt(i+1);[exam.questions[i],exam.questions[j]]=[exam.questions[j],exam.questions[i]];}
  u.exams.push(exam);return exam;
}
export function finishExam(u,exam) {
  exam.finished=true;exam.weak=[...new Set(exam.answers.filter(a=>!a.passed).map(a=>a.skill))];exam.passed=exam.weak.length===0;
  for(const skill of exam.weak)u.needs[skill]=2;
  if(exam.passed)u.masteredAt=new Date().toISOString();
  return exam;
}

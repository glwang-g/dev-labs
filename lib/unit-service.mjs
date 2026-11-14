import {freshUnit,publicUnit,nextTraining,startExam,finishExam} from './branch-unit.mjs';
export async function handleUnit(state,body,evaluate) {
  const u=state.branchUnit ||= freshUnit(); let feedback='';
  const exam=u.exams.at(-1),active=exam&&!exam.finished;
  if(body.action==='practice')nextTraining(u);
  else if(body.action==='exam')startExam(u);
  else if(body.action==='hint') {
    if(active)throw new Error('独立考核中不开放提示');
    if(!u.current)throw new Error('请先开始训练');
    feedback=publicUnit(u).skills.find(s=>s.id===u.current.skill).tip;
    u.history.push({kind:'hint',skill:u.current.skill,at:new Date().toISOString()});
  } else if(body.action==='answer') {
    const q=active?exam.questions[exam.index]:u.current;
    if(!q||q.id!==body.questionId)throw new Error('题目已更新，请恢复进度后继续');
    const answer=String(body.answer||'').trim();if(!answer||answer.length>100)throw new Error('请填写有效预测');
    const result=await evaluate(q,{prediction:answer});
    if(result.error)throw new Error('运行环境出现问题，本题未计分，请重试');
    const record={kind:active?'exam-answer':'training',skill:q.skill,questionId:q.id,at:new Date().toISOString(),passed:result.passed};
    if(active) {
      exam.answers.push(record);exam.index++;u.history.push(record);
      feedback='答案已记录。考核结束后统一反馈薄弱点。';
      if(exam.index===exam.questions.length){finishExam(u,exam);feedback=exam.passed?'考核通过：三项能力在六个未见变式中全部达标。':'考核未通过，已按能力定位薄弱点，请先补练。';}
    } else {
      u.history.push({...record,output:result.output,answer});
      if(result.passed){u.training[q.key]=true;if(u.needs[q.skill]>0)u.needs[q.skill]--;u.current=null;}
      feedback=result.passed?'本次训练通过。继续不同情境，或在覆盖要求满足后参加考核。':'预测与实际输出不同。实际输出：'+result.output+'。请逐行对照，也可以请求提示。';
    }
  } else if(body.action!=='resume')throw new Error('未知的能力训练动作');
  return {unit:publicUnit(u),feedback};
}

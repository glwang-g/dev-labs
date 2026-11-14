export const completedTask = (attempts, id) => attempts.some(a => a.id === id && a.passed && a.submitted);
export function stageCompletion(tasks, attempts, stage) {
  const members = tasks.filter(t => t.stage === stage);
  return members.length > 0 && members.every(t => completedTask(attempts, t.id));
}
export function nextStageTask(tasks, attempts, stage) {
  const stages = [...new Set(tasks.map(t => t.stage))];
  return tasks.find(t => stages.indexOf(t.stage) > stages.indexOf(stage) && !completedTask(attempts, t.id)) || null;
}
export function resumeJourney(tasks, state, saved) {
  const transitions = state.stageTransitions || {};
  const pending = Object.values(transitions).find(t => t.status === 'pending');
  if (pending) return { taskId: pending.taskId, transition: pending, reason: 'stage' };
  const remembered = tasks.find(t => t.id === saved);
  if (remembered && transitions[remembered.stage]?.status === 'stay') return { taskId: remembered.id, reason: 'stay' };
  if (remembered && !completedTask(state.attempts, remembered.id)) return { taskId: remembered.id, reason: state.attempts.length ? 'resume' : 'start' };
  const next = tasks.find(t => !completedTask(state.attempts, t.id));
  return next ? { taskId: next.id, reason: state.attempts.length ? 'resume' : 'start' } : { taskId: tasks.at(-1).id, reason: 'complete' };
}

export function nextLearningTask(tasks, attempts, currentId) {
  const current = tasks.find(t => t.id === currentId);
  return tasks.find(t => t.stage === current.stage && !completedTask(attempts, t.id)) || nextStageTask(tasks, attempts, current.stage);
}

import { initialWorld, advanceWorld, evaluateWorld } from './order-world.js';
export const LESSON_VERSION = 'cancelled-order-1';
export function scenarioFor(taskId) {
  return taskId === 's0-branch' ? [{ amount: 3800, status: 'cancelled' }] : [{ amount:1200,status:'paid' },{amount:3800,status:'cancelled'},{amount:800,status:'paid'}];
}
export function bindLesson(task, prediction, output, id, codeHash) {
  const initial=initialWorld(scenarioFor(task.id));
  const action={type:'process',prediction:Number(prediction)};
  const {state:world}=advanceWorld(initial,action);
  return { session:{id,taskId:task.id,kind:'validation',lessonVersion:LESSON_VERSION,codeHash,initial,actions:[action]}, world, matchesExecution:Number(output)===world.total, evaluation:evaluateWorld(world) };
}
export function shopFromAttempt(task, attempt) {
  const facts = task.id === 's1-total' ? attempt.checks.find(c=>c.name==='混合订单') : task.id === 's1-group' ? attempt.checks.find(c=>c.name==='重复客户与取消订单') : null;
  return { taskId:task.id, sourceHash:attempt.sourceHash, at:attempt.at, passed:attempt.passed, submitted:attempt.submitted, output: facts?.actual ?? attempt.output ?? null, input: facts?.input ?? null, checks:attempt.checks, projectEvidence:attempt.projectEvidence || null, experimentId:attempt.experimentId || null };
}

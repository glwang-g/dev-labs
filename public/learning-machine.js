export const transitions = {
  ready: { enter: 'working', edit: 'working', run: 'validating' }, working: { run: 'validating', edit: 'working' },
  validating: { fail: 'repair', evidence: 'evidence', pass: 'complete' },
  repair: { edit: 'working', run: 'validating' }, evidence: { edit: 'working', run: 'validating' },
  complete: { edit: 'working', run: 'validating', pause: 'paused' }, paused: { enter: 'working', edit: 'working', run: 'validating' }
};
export function transitionLearning(current, action) {
  if (action === 'enter' && current !== 'ready' && current !== 'paused' && transitions[current]) return current;
  const next = transitions[current]?.[action];
  if (!next) throw new Error('不允许的学习状态转换：'+current+' → '+action);
  return next;
}
export function stateAfterResult(result) {
  const checking = transitionLearning('working','run');
  return transitionLearning(checking, !result.passed ? 'fail' : result.submitted ? 'pass' : 'evidence');
}

export function transitionStage(current, choice) {
  if (!['stay','continue'].includes(choice)) throw new Error('无效的阶段选择');
  if (current === choice) return current;
  if (current !== 'pending') throw new Error('阶段选择已保存，请通过关卡导航继续');
  return choice;
}

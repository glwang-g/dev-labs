import { stateAfterResult } from './learning-machine.js';
export function taskCopy(task, mode = task.completion?.mode || 'explain') {
  const finishSteps = mode === 'direct' ? ['自动记录通过', '继续下一任务'] : mode === 'check' ? ['简短检查', '继续下一任务'] : ['解释并提交', '继续下一任务'];
  if (task.kind === 'predict') return {
    mode: '观察模式 · 本题无需修改代码',
    steps: ['阅读代码并预测', '运行，对照输出', ...finishSteps],
    explanationLabel: '为什么会得到这个输出？',
    explanationPlaceholder: '按执行顺序说明变量、条件或循环怎样得到结果。如果预测不一致，你漏掉了哪一步？',
    runLabel: '▷ 运行，对照预测',
    resettable: false
  };
  return {
    mode: task.kind === 'project' ? '工程模式 · 编辑任务文件，再测试交付' : '编写模式 · 直接在下方修改代码',
    steps: ['阅读需求并修改', '运行测试', ...finishSteps],
    explanationLabel: task.kind === 'project' ? '你改了什么，如何验证？' : '为什么这样实现？',
    explanationPlaceholder: task.kind === 'project' ? '说明故障原因、改动内容，以及你运行的测试或检查步骤。' : '说明你的实现思路，以及空输入、取消订单等边界如何处理。',
    runLabel: '▷ 运行测试',
    resettable: true
  };
}

// Completion applies to this draft, not merely to an old successful submission.
export function matchingAttempt(task, draft, project, attempts, retest) {
  const matches = attempt => {
    if (attempt.id !== task.id) return false;
    if (retest && Date.parse(attempt.at) < Date.parse(retest.startedAt)) return false;
    if (task.kind === 'project') {
      if (!attempt.projectSnapshot) return false;
      if (!['store.cjs', 'app.cjs', 'README.md'].every(file => attempt.projectSnapshot[file] === project[file])) return false;
    } else if (attempt.code !== (task.kind === 'predict' ? task.starter : draft.code)) return false;
    if (task.kind === 'predict' && (attempt.prediction || '').trim() !== (draft.prediction || '').trim()) return false;
    return true;
  };
  const result = [...attempts].reverse().find(matches);
  if (!result) return null;
  const mode = result.completion?.mode || 'explain';
  const unchanged = mode === 'direct' || mode === 'check' ? mode === 'direct' || (result.completion.checkAnswer || '') === (draft.checkAnswer || '') : (result.explanation || '').trim() === (draft.explanation || '').trim();
  return { ...result, submitted: result.submitted && unchanged, completion: result.completion ? { ...result.completion, checkPassed: unchanged ? result.completion.checkPassed : null } : undefined };
}

export function taskNavigation(tasks, task, result) {
  const index = tasks.findIndex(t => t.id === task.id);
  const next = tasks[index + 1] || null;
  const learningState = result ? stateAfterResult(result) : 'working';
  const completed = learningState === 'complete';
  return {
    learningState,
    previous: tasks[index - 1] || null,
    next,
    completed,
    nextLabel: !next ? '查看本轮学习日志 →' : next.stage !== task.stage ? `下一阶段：${next.stage} · ${next.title} →` : `下一任务：${next.title} →`,
    step: completed ? 4 : result?.passed ? 3 : result ? 2 : 1
  };
}

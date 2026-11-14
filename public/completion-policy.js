// Shared policy; the server independently enforces it for every submission.
export function completionPolicy(task, attempts = [], retest) {
  if (retest) return { mode: 'explain', reason: 'retest' };
  const configured = task.completion?.mode || 'explain';
  let failures = 0;
  for (const attempt of [...attempts].reverse()) {
    if (attempt.id !== task.id) continue;
    if (attempt.passed && attempt.submitted) break;
    if (!attempt.passed || attempt.completion?.checkPassed === false) failures++;
  }
  if (configured !== 'explain' && failures >= 2) return { mode: 'explain', reason: 'reflection' };
  return { mode: configured, reason: 'task' };
}

export function completionSatisfied(mode, draft) {
  if (mode === 'direct') return true;
  if (mode === 'check') return Boolean(draft.checkAnswer);
  return String(draft.explanation || '').trim().length >= 15;
}

export function canAutoAdvance(result) {
  return Boolean(result?.passed && result.submitted && !result.retest);
}

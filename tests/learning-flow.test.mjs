import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskCopy, matchingAttempt, taskNavigation } from '../public/learning-flow.js';

const observe = { id: 'observe', stage: 'S0', kind: 'predict', starter: 'console.log(2)', title: '观察' };
const code = { id: 'code', stage: 'S1', kind: 'function', starter: '', title: '编写' };
const project = { id: 'project', stage: 'S2', kind: 'project', title: '交付' };
const tasks = [observe, code, project];
const draft = { prediction: '2', explanation: '输出的是数字二，因为函数的参数是数值二。', code: observe.starter };
const attempt = { id: 'observe', code: observe.starter, prediction: '2', explanation: draft.explanation, passed: true, submitted: true, at: '2026-11-12T00:00:00Z' };

test('observation tasks have no editing/reset instructions; editable tasks do', () => {
  const copy = taskCopy(observe);
  assert.equal(copy.resettable, false);
  assert.match(copy.mode, /无需修改/);
  assert.doesNotMatch(copy.explanationPlaceholder, /修改|实现/);
  assert.match(copy.runLabel, /预测/);
  assert.equal(taskCopy(code).resettable, true);
  assert.match(taskCopy(project).explanationPlaceholder, /改动/);
});
test('progress moves from run to explanation to next without needing hints or review', () => {
  assert.equal(taskNavigation(tasks, observe, null).step, 1);
  assert.equal(taskNavigation(tasks, observe, { passed: false }).step, 2);
  assert.equal(taskNavigation(tasks, observe, { passed: true, submitted: false }).completed, false);
  const nav = taskNavigation(tasks, observe, attempt);
  assert.equal(nav.completed, true); assert.equal(nav.next.id, 'code');
  assert.equal(nav.step, 4); assert.match(nav.nextLabel, /S1/);
});
test('returning to the same saved draft restores its successful submission', () => {
  assert.equal(matchingAttempt(observe, draft, {}, [attempt]).submitted, true);
  assert.equal(matchingAttempt(observe, { ...draft, prediction: ' 2 ' }, {}, [attempt]).passed, true);
});
test('changed prediction or code cannot reuse an old passed result to advance', () => {
  assert.equal(matchingAttempt(observe, { ...draft, prediction: '3' }, {}, [attempt]), null);
  const solved = { ...attempt, id: 'code', code: 'function solve() { return 2; }' };
  assert.equal(matchingAttempt(code, { ...draft, code: 'function solve() { return 3; }' }, {}, [solved]), null);
});
test('changed explanation retains test result but requires another submission', () => {
  const result = matchingAttempt(observe, { ...draft, explanation: '我重新解释这段程序的执行过程与结果。' }, {}, [attempt]);
  assert.equal(result.passed, true); assert.equal(result.submitted, false);
  assert.equal(taskNavigation(tasks, observe, result).completed, false);
});
test('project snapshot and delayed retest start constrain completion; final task leads to evidence', () => {
  const files = { 'store.cjs': 'store', 'app.cjs': 'app', 'README.md': 'doc' };
  const solved = { ...attempt, id: 'project', projectSnapshot: files };
  assert.equal(matchingAttempt(project, draft, files, [solved]).submitted, true);
  assert.equal(matchingAttempt(project, draft, { ...files, 'app.cjs': 'changed' }, [solved]), null);
  assert.equal(matchingAttempt(observe, draft, {}, [attempt], { startedAt: '2026-11-13T00:00:00Z' }), null);
  const nav = taskNavigation(tasks, project, solved);
  assert.equal(nav.next, null); assert.match(nav.nextLabel, /学习日志/);
});

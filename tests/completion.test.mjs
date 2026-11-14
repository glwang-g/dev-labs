import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { completionPolicy, canAutoAdvance } from '../public/completion-policy.js';
import { matchingAttempt } from '../public/learning-flow.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devlabs-completion-'));
process.env.DEVLABS_DATA_DIR = temp;
const { initialize, createServer } = await import('../server.mjs');
let server, origin;
before(async () => { await initialize(); server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); origin = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); });
async function api(route, body) { const r = await fetch(origin + '/api/' + route, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, data: await r.json() }; }

test('basic tasks record completion without explanation; incorrect output never completes', async () => {
  const wrong = await api('run', { id: 's0-state', prediction: '3000' });
  assert.equal(wrong.data.passed, false); assert.equal(wrong.data.submitted, false); assert.equal(canAutoAdvance(wrong.data), false);
  const right = await api('run', { id: 's0-state', prediction: '2400' });
  assert.equal(right.status, 200); assert.equal(right.data.submitted, true); assert.equal(right.data.explanation, ''); assert.equal(right.data.review, 'not-required');
  assert.equal(canAutoAdvance(right.data), true);
  const state = (await api('state')).data;
  assert.equal(state.state.attempts.at(-1).submitted, true);
  assert.equal(state.tasks.some(t => t.completion?.answer !== undefined), false);
});
test('short check requires both real execution and the correct choice, not a long explanation', async () => {
  const run = await api('run', { id: 's0-branch', prediction: '0' }); assert.equal(run.data.passed, true); assert.equal(run.data.submitted, false);
  assert.equal((await api('run', { id: 's0-branch', prediction: '0', submit: true })).status, 400);
  const wrong = await api('run', { id: 's0-branch', prediction: '0', checkAnswer: 'zero', submit: true });
  assert.equal(wrong.data.passed, true); assert.equal(wrong.data.completion.checkPassed, false); assert.equal(wrong.data.submitted, false);
  const right = await api('run', { id: 's0-branch', prediction: '0', checkAnswer: 'status', submit: true });
  assert.equal(right.data.submitted, true); assert.equal(right.data.explanation, ''); assert.equal(canAutoAdvance(right.data), true);
  const t = (await api('state')).data.tasks.find(t => t.id === 's0-branch');
  const changed = matchingAttempt(t, { prediction: '0', checkAnswer: 'reset' }, {}, [right.data]);
  assert.equal(changed.passed, true); assert.equal(changed.submitted, false); assert.equal(changed.completion.checkPassed, null);
  const invalidRun = await api('run', { id: 's0-branch', prediction: '17', checkAnswer: 'status', submit: true }); assert.equal(invalidRun.data.submitted, false);
});
test('repeated failures request reflection; browser cannot override the server policy', async () => {
  const id = 's1-total', bad = 'function totalPaid() { return 999; }';
  await api('run', { id, code: bad }); await api('run', { id, code: bad });
  const solution = 'function totalPaid(orders) { return orders.filter(o=>o.status === "paid").reduce((sum,o)=>sum+o.amount,0); }';
  const run = await api('run', { id, code: solution, completion: { mode: 'direct' } });
  assert.equal(run.data.passed, true); assert.equal(run.data.submitted, false); assert.equal(run.data.completion.reason, 'reflection');
  assert.equal((await api('run', { id, code: solution, submit: true })).status, 400);
  const finish = await api('run', { id, code: solution, submit: true, explanation: '之前把返回值写死了，现在先过滤状态再累加金额，并用空数组和取消订单验证。' });
  assert.equal(finish.data.submitted, true); assert.equal(canAutoAdvance(finish.data), true);
  const t = (await api('state')).data.tasks.find(t => t.id === id);
  assert.equal(completionPolicy(t, (await api('state')).data.state.attempts).mode, 'direct');
});
test('independent tasks and delayed retests retain explanation requirements', async () => {
  assert.equal((await api('run', { id: 's0-transfer', prediction: '1500', submit: true })).status, 400);
  const independent = await api('run', { id: 's0-transfer', prediction: '1500', submit: true, explanation: '第一次四百不够门槛，之后九百加六百，循环结束时累计值为一千五百分。' });
  assert.equal(independent.data.submitted, true); assert.equal(canAutoAdvance(independent.data), true);
  assert.deepEqual(completionPolicy({ completion: { mode: 'direct' } }, [], { startedAt: '2026-11-12' }), { mode: 'explain', reason: 'retest' });
});

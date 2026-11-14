import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resumeJourney, stageCompletion, nextLearningTask } from '../public/journey.js';

test('resume chooses unfinished work and respects explicit stage stays', () => {
  const tasks = [{ id: 'a', stage: 'S0' }, { id: 'b', stage: 'S0' }, { id: 'c', stage: 'S1' }];
  const attempts = [{ id: 'a', passed: true, submitted: true }];
  assert.equal(resumeJourney(tasks, { attempts }, 'a').taskId, 'b');
  assert.equal(resumeJourney(tasks, { attempts }, 'c').taskId, 'c');
  assert.equal(stageCompletion(tasks, attempts, 'S0'), false);
  assert.equal(nextLearningTask(tasks, attempts, 'a').id, 'b');
  assert.equal(resumeJourney(tasks, { attempts, stageTransitions: { S0: { status: 'stay' } } }, 'a').reason, 'stay');
});
test('pending celebration resumes; completed curriculum goes to results', () => {
  const tasks = [{ id: 'a', stage: 'S0' }], attempts = [{ id: 'a', passed: true, submitted: true }];
  assert.equal(resumeJourney(tasks, { attempts }).reason, 'complete');
  const transition = { taskId: 'a', stage: 'S0', status: 'pending' };
  assert.equal(resumeJourney(tasks, { attempts, stageTransitions: { S0: transition } }).transition, transition);
});

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devlabs-journey-'));
process.env.DEVLABS_DATA_DIR = temp;
const { initialize, createServer } = await import('../server.mjs');
let server, base;
before(async () => { await initialize(); server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api/`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); });
async function api(route, body) { const r = await fetch(base + route, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, data: await r.json() }; }
test('stage celebration requires all submissions and choice persists without repeated celebrations', async () => {
  assert.equal((await api('stage-transition', { stage: 'S0', choice: 'continue' })).status, 400);
  const first = await api('run', { id: 's0-state', prediction: '2400' }); assert.equal(first.data.stageCompleted, undefined);
  await api('run', { id: 's0-branch', prediction: '0', checkAnswer: 'status', submit: true });
  const run = await api('run', { id: 's0-transfer', prediction: '1500' }); assert.equal(run.data.stageCompleted, undefined);
  const done = await api('run', { id: 's0-transfer', prediction: '1500', explanation: '第一项不满足条件，后两项分别加九百和六百，循环结束时累计得到一千五百分。', submit: true });
  assert.equal(done.data.stageCompleted, 'S0');
  const pending = (await api('state')).data.state.stageTransitions.S0;
  assert.equal(pending.status, 'pending'); assert.equal(pending.nextTaskId, 's1-total');
  await api('stage-transition', { stage: 'S0', choice: 'stay' });
  assert.equal((await api('state')).data.state.stageTransitions.S0.status, 'stay');
  const repeat = await api('run', { id: 's0-state', prediction: '2400' }); assert.equal(repeat.data.stageCompleted, undefined);
  const disk = JSON.parse(await fs.readFile(path.join(temp, 'state.json'), 'utf8')); assert.equal(disk.stageTransitions.S0.status, 'stay');
});

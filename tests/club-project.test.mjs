import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('club project carries a visible fix and a student regression into a real Git delivery', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'devlabs-club-'));
  process.env.DEVLABS_DATA_DIR = directory;
  const { createServer, initialize, command } = await import('../server.mjs');
  await initialize();
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/club-project';
  const api = async (action, values = {}, status = 200) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...values })
    });
    const value = await response.json();
    assert.equal(response.status, status, value.error);
    return value;
  };
  try {
    const initial = await api('open');
    const orderPath = path.join(directory, 'order-service', 'app.cjs');
    const orderSource = await fs.readFile(orderPath, 'utf8');
    assert.deepEqual(initial.preview.confirmed, ['阿青']);
    await api('deliver', { step: 0, code: 'bad' }, 400);
    assert.equal((await api('hint', { step: 0 })).hints[0], 1);
    assert.equal((await api('hint', { step: 0 })).hints[0], 2);
    const failed = await api('signup', { step: 0 });
    assert.deepEqual(failed.preview.waiting, ['小林']);
    assert.equal((await api('next', { step: 0 })).step, 0);
    const firstFix = initial.code.replace('+ 1 <', '+ 1 <=');
    const first = await api('signup', { step: 0, code: firstFix });
    assert.deepEqual(first.preview.confirmed, ['阿青', '小林']);
    assert.equal(first.result.passed, true);
    const second = await api('next', { step: 0 });
    assert.equal(second.step, 1);
    assert.equal(second.directory, initial.directory);
    assert.equal(second.code, firstFix);
    assert.ok(Date.parse(second.secondStartedAt) >= Date.parse(second.signupPassedAt));
    assert.equal((await api('trial', { step: 1 })).observations.at(-1).outcome, 'invalid-input');
    await api('next', { step: 1 }, 400);
    const form = { confirmed: '甲，乙', waiting: '丙，丁', cancelName: '乙', expectedConfirmed: '甲，丙', expectedWaiting: '丁' };
    const wrong = await api('trial', { step: 1, form: { ...form, expectedConfirmed: '甲' } });
    assert.equal(wrong.trial.expectedValid, false);
    assert.equal(wrong.regression, undefined);
    const trial = await api('trial', { step: 1, form });
    assert.equal(trial.trial.retained, true);
    assert.deepEqual(trial.trial.baseline.confirmed, ['甲']);
    assert.equal(trial.trial.passed, false);
    assert.equal((await api('next', { step: 1 })).step, 1);
    const fixed = firstFix.replace(/function cancel\([\s\S]*?(?=if \(typeof module)/, `function cancel(event, name) {
  const confirmed = event.confirmed.filter(person => person !== name);
  const waiting = [...event.waiting];
  if (confirmed.length !== event.confirmed.length && waiting.length) confirmed.push(waiting.shift());
  return { ...event, confirmed, waiting };
}
\n`);
    await api('save', { step: 1, code: fixed, form });
    await initialize();
    const resumed = await api('open');
    assert.equal(resumed.step, 1);
    assert.equal(resumed.code, fixed);
    assert.deepEqual(resumed.form, form);
    assert.ok(resumed.observations.some(entry => entry.outcome === 'wrong-expectation'));
    assert.ok(resumed.observations.some(entry => entry.outcome === 'reproduced'));
    assert.equal(resumed.hints[0], 2);
    await api('validate', { step: 1 });
    assert.equal((await api('next', { step: 1 })).step, 2);
    assert.match((await api('diff', { step: 2 })).diff, /regression\.json/);
    const delivery = { summary: '修复报名边界和候补递补', reproduction: '用满员活动取消乙并核对丙转正。' };
    await api('save', { step: 2, form: delivery });
    assert.deepEqual((await api('open')).deliveryDraft, delivery);
    const delivered = await api('deliver', { step: 2, ...delivery });
    assert.equal(delivered.step, 3);
    assert.match(delivered.commit, /^[a-f0-9]+$/);
    const cwd = initial.directory;
    assert.equal((await command('git', ['status', '--porcelain'], { cwd })).output.trim(), '');
    assert.match((await command('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd })).output, /DELIVERY\.md/);
    assert.equal((await command(process.execPath, ['check.cjs'], { cwd })).code, 0);
    assert.equal(await fs.readFile(orderPath, 'utf8'), orderSource);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('AI is explicit and advisory; delayed retest waits seven days and disables assistance', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devlabs-ai-test-'));
  process.env.DEVLABS_DATA_DIR = temp;
  const { initialize, createServer } = await import('../server.mjs');
  await initialize();
  let calls = 0, received;
  const provider = http.createServer(async (req, res) => {
    calls++; let raw = ''; for await (const c of req) raw += c;
    received = JSON.parse(raw); res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '先观察过滤条件。取消订单应该经过累加分支吗？' } }] }));
  });
  await new Promise((resolve, reject) => { provider.once('error', reject); provider.listen(0, '127.0.0.1', resolve); });
  process.env.AI_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`;
  process.env.AI_API_KEY = 'test-only-secret'; process.env.AI_MODEL = 'fixture';
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  const api = async (route, body) => { const r = await fetch(base + route, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: r.status, data: await r.json() }; };
  const originalNow = Date.now;
  try {
    await api('state'); await api('hint', { id: 's1-total' }); assert.equal(calls, 0);
    const answer = await api('ai', { id: 's1-total', code: 'function totalPaid() { return 0; }', question: '我以为应该返回订单总数，但是题目似乎要求金额，我该先确认什么？' });
    assert.equal(answer.status, 200); assert.equal(calls, 1); assert.equal(received.model, 'fixture'); assert.ok(answer.data.answer.includes('过滤条件'));
    assert.equal(JSON.stringify((await api('state')).data).includes('test-only-secret'), false);
    const pass = await api('run', { id: 's0-state', prediction: '2400', explanation: '金额在赋值时已经计算结束，所以价格更新不会影响过去保存的结果。', submit: true }); assert.equal(pass.data.passed, true);
    assert.equal((await api('retest', { id: 's0-state' })).status, 400);
    Date.now = () => originalNow() + 8 * 86400000;
    assert.equal((await api('retest', { id: 's0-state' })).status, 200);
    assert.equal((await api('hint', { id: 's0-state' })).status, 400);
    assert.equal((await api('ai', { id: 's0-state', question: '我还记得答案，但是请帮我确认一下是否正确？' })).status, 400);
    const done = await api('run', { id: 's0-state', prediction: '2400', explanation: '延迟后重新逐行追踪，total 的值在第一次计算时已经固定，不会自动重算。', submit: true }); assert.equal(done.data.retest, true); assert.equal(done.data.passed, true);
    assert.equal((await api('state')).data.state.retests['s0-state'], undefined);
  } finally {
    Date.now = originalNow;
    delete process.env.AI_BASE_URL; delete process.env.AI_API_KEY; delete process.env.AI_MODEL;
    server.closeAllConnections(); provider.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => provider.close(resolve))]);
    await fs.rm(temp, { recursive: true, force: true });
  }
});

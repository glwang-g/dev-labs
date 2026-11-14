import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'devlabs-test-'));
process.env.DEVLABS_DATA_DIR = temp;
const { initialize, createServer } = await import('../server.mjs');
let server, origin;
before(async () => { await initialize(); server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server?.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(temp, { recursive: true, force: true }); });
async function api(route, body) { const response = await fetch(origin + '/api/' + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, data: await response.json() }; }
const explain = '我通过边界输入与取消订单验证，先过滤状态，再累计金额，避免取消订单被计入结果。';
test('curriculum, static resources and persistence are available', async () => {
  const r = await api('state'); assert.equal(r.data.tasks.length, 9); assert.equal(r.data.stages.length, 3);
  assert.equal(r.data.tasks.some(t => 'expected' in t), false);
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(origin + '/style.css')).status, 200);
  await api('draft', { id: 's1-total', code: 'saved', explanation: explain });
  assert.equal((await api('state')).data.state.drafts['s1-total'].code, 'saved');
  const stored = JSON.parse(await fs.readFile(path.join(temp, 'state.json'), 'utf8'));
  assert.equal(stored.drafts['s1-total'].code, 'saved');
});
test('S0 requires prediction, rejects a wrong answer and records explanation separately', async () => {
  assert.equal((await api('run', { id: 's0-state' })).status, 400);
  const wrong = await api('run', { id: 's0-state', prediction: '3000' }); assert.equal(wrong.data.passed, false); assert.equal(wrong.data.output, '2400');
  const right = await api('run', { id: 's0-state', prediction: '2400', explanation: explain, submit: true });
  assert.equal(right.data.passed, true); assert.equal(right.data.review, 'not-required'); assert.equal(right.data.submitted, true);
  assert.equal((await api('run', { id: 's0-transfer', prediction: '1500', explanation: '懂了', submit: true })).status, 400);
  assert.equal((await api('hint', { id: 's0-transfer' })).status, 400);
});
test('S1 rejects hardcoded answers, diagnoses syntax errors and stops infinite loops', async () => {
  const hardcoded = await api('run', { id: 's1-total', code: 'function totalPaid() { return 2000; }' }); assert.equal(hardcoded.data.passed, false);
  const syntax = await api('run', { id: 's1-total', code: 'function {' }); assert.ok(syntax.data.error);
  const loop = await api('run', { id: 's1-total', code: 'function totalPaid() { while(true) {} }' }); assert.equal(loop.data.passed, false); assert.match(loop.data.error, /timed out|超时/);
  const denied = await api('run', { id: 's1-total', code: "function totalPaid() { return process.env; }" }); assert.equal(denied.data.passed, false);
});
test('S1 solutions pass distinct cases, prototype keys and independent variants', async () => {
  const solutions = {
    's1-total': 'function totalPaid(orders) { return orders.filter(o => o.status === "paid").reduce((sum, o) => sum + o.amount, 0); }',
    's1-group': 'function byCustomer(orders) { const r = Object.create(null); for(const o of orders) if(o.status === "paid") r[o.customer] = (r[o.customer] || 0) + o.amount; return r; }',
    's1-transfer': 'function countEligible(orders, minimum) { return orders.filter(o => o.status === "paid" && o.amount >= minimum).length; }'
  };
  for (const [id, code] of Object.entries(solutions)) { const r = await api('run', { id, code, explanation: explain, checkAnswer: id === 's1-group' ? 'keys' : '', submit: true }); assert.equal(r.data.passed, true, JSON.stringify(r.data)); assert.equal(r.data.checks.length, 4); }
  assert.equal((await api('ai', { id: 's1-transfer', question: '请直接给我完整答案吧。' })).status, 400);
});
test('S2 persists files, serves actual HTTP, requires a clean commit and captures snapshots', async () => {
  const starter = await api('run', { id: 's2-store' }); assert.equal(starter.data.passed, false);
  assert.equal((await api('file', { file: '../state.json', content: '{}' })).status, 400);
  assert.equal((await api('file', { file: 'checks.cjs', content: '' })).status, 400);
  const store = `const fs=require('node:fs'); function createStore(file) { return { load() { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch(e) { if(e.code === 'ENOENT') return []; throw e; } }, save(orders) { fs.writeFileSync(file,JSON.stringify(orders)); } }; } module.exports={createStore};`;
  const app = `const http=require('node:http'); function createApp(store) { return http.createServer((req,res) => { res.setHeader('content-type','application/json'); let value; if(req.method !== 'GET') {res.statusCode=405; value={error:'method'};} else if(req.url === '/orders') {value=store.load().filter(o=>o.status==='paid');} else if(req.url === '/summary') {value={total:store.load().filter(o=>o.status==='paid').reduce((s,o)=>s+o.amount,0)};} else {res.statusCode=404;value={error:'not found'};} res.end(JSON.stringify(value)); }); } module.exports={createApp};`;
  await api('file', { file: 'store.cjs', content: store });
  const stored = await api('run', { id: 's2-store', submit: true, explanation: explain }); assert.equal(stored.data.passed, true, JSON.stringify(stored.data));
  await api('file', { file: 'app.cjs', content: app });
  const http = await api('run', { id: 's2-api', submit: true, explanation: explain }); assert.equal(http.data.passed, true, JSON.stringify(http.data));
  const early = await api('run', { id: 's2-delivery', submit: true, explanation: explain }); assert.equal(early.data.passed, false);
  const readme = (await api('state')).data.project['README.md'].replace('TODO：解释改动原因、复现方法、验证步骤，以及尚未处理的情况。', '我修复了订单存储与接口的过滤逻辑。运行 npm test 复现并验证空数据、取消订单、未知路径及方法边界。使用文件持久化保留跨实例数据；写入失败会向调用者抛出。');
  await api('file', { file: 'README.md', content: readme });
  const full = await api('git', { action: 'test' }); assert.equal(full.data.code, 0, full.data.output);
  const commit = await api('git', { action: 'commit', message: 'fix: persist orders and implement HTTP contract' }); assert.equal(commit.data.code, 0, commit.data.output);
  const done = await api('run', { id: 's2-delivery', submit: true, explanation: explain }); assert.equal(done.data.passed, true, JSON.stringify(done.data)); assert.ok(done.data.projectSnapshot['app.cjs']); assert.equal(done.data.projectEvidence['/summary'].value.total,731); assert.ok(done.data.projectEvidence.persisted);
  const review = await api('review', { attemptId: done.data.attemptId, verdict: 'confirmed', note: '现场追问确认能够解释过滤规则，并独立修改边界测试。' }); assert.equal(review.status, 200);
  const exported = await api('export'); assert.ok(exported.data.state.reviews[done.data.attemptId]); assert.ok(exported.data.project['store.cjs']);
});
test('local origin and method restrictions, retest date and unconfigured AI are enforced', async () => {
  const response = await fetch(origin + '/api/draft', { method: 'POST', headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: '{}' }); assert.equal(response.status, 403);
  assert.equal((await fetch(origin + '/api/draft', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await api('retest', { id: 's0-state' })).status, 400);
  assert.equal((await api('ai', { id: 's1-total', question: '我不知道如何判断订单状态，应该从哪里检查？' })).status, 400);
  assert.equal((await api('git', { action: 'reset --hard' })).status, 400);
});

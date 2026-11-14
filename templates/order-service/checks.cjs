const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./store.cjs');
const { createApp } = require('./app.cjs');
const mode = process.argv[2] || 'all';
const BASE=Number(process.env.DEVLABS_CASE_SEED||1700);
const results = [];
const evidence = {};
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (e) { results.push({ name, passed: false, detail: e.message.slice(0, 1200) }); }
}
async function main() {
  const dir = fs.mkdtempSync(path.join(__dirname, 'data', 'verify-'));
  try {
    const file = path.join(dir, 'orders.json');
    const sample = [{ customer: 'Ada', amount: BASE, status: 'paid' }, { customer: 'Lin', amount: 9000, status: 'cancelled' }, { customer: 'Ada', amount: 300, status: 'paid' }];
    if (mode !== 'api') {
      await check('文件不存在时为空数组', () => assert.deepEqual(createStore(file).load(), []));
      await check('保存后新实例读回', () => { createStore(file).save(sample); const actual=createStore(file).load();assert.deepEqual(actual, sample);evidence.persisted=actual; });
      await check('更新会替换旧数据', () => { createStore(file).save([]); assert.deepEqual(createStore(file).load(), []); });
      await check('损坏文件不会被静默吞掉', () => { fs.writeFileSync(file, '{broken'); assert.throws(() => createStore(file).load()); });
    }
    if (mode !== 'store') {
      let rows = sample;
      const store = mode === 'api' ? { load: () => rows } : createStore(file);
      if (mode !== 'api') store.save(sample);
      const app = createApp(store);
      await new Promise((resolve, reject) => { app.once('error', reject); app.listen(0, '127.0.0.1', resolve); });
      const url = 'http://127.0.0.1:' + app.address().port;
      const get = async (route, options) => { const response = await fetch(url + route, options); const result={ status: response.status, type: response.headers.get('content-type'), value: await response.json() };evidence[route]=result;return result; };
      try {
        await check('订单接口过滤取消项并返回 JSON', async () => { const r = await get('/orders'); assert.equal(r.status, 200); assert.match(r.type, /application\/json/); assert.deepEqual(r.value, sample.filter(x => x.status === 'paid')); });
        await check('统计接口计算真实金额', async () => { const r = await get('/summary'); assert.equal(r.status, 200); assert.deepEqual(r.value, { total: BASE+300 }); });
        if(process.env.DEVLABS_ROUTE_EXAM==='1') {
          await check('独立需求：健康检查',async()=>{const r=await get('/health');assert.equal(r.status,200);assert.deepEqual(r.value,{status:'ok'});});
          await check('独立需求：按客户筛选',async()=>{const r=await get('/orders?customer=Ada');assert.equal(r.status,200);assert.deepEqual(r.value,sample.filter(o=>o.status==='paid'&&o.customer==='Ada'));});
          await check('独立需求：不存在客户为空数组',async()=>assert.deepEqual((await get('/orders?customer=Nobody')).value,[]));
        }
        await check('未知路径返回 404', async () => assert.equal((await get('/missing')).status, 404));
        await check('非 GET 返回 405', async () => assert.equal((await get('/orders', { method: 'POST' })).status, 405));
        await check('数据变化后接口同步变化', async () => { rows = [{ customer: 'New', amount: 731, status: 'paid' }]; if (mode !== 'api') store.save(rows); assert.deepEqual((await get('/summary')).value, { total: 731 }); assert.deepEqual((await get('/orders')).value, rows); });
      } finally { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(JSON.stringify({ results, evidence }));
  process.exitCode = results.every(r => r.passed) ? 0 : 1;
}
main().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exitCode = 1; });

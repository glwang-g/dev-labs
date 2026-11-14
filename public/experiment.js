const escape = x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function experimentMarkup() { return `<section class="panel order-experiment"><div class="panel-head">小店实验 · 预测、步进与回放<span class="muted">业务步骤，非源码单步调试</span></div><div class="below-body"><p>逐笔处理订单，观察状态如何变化。实验帮助理解；任务通关仍由真实代码测试决定。</p><button data-world="start">打开订单实验</button><div id="world-content" aria-live="polite"></div></div></section>`; }
export function bindExperiment(taskId) {
  const root=document.querySelector('.order-experiment'); if(!root)return;
  let session, cursor=0, busy=false;
  async function call(action, extra={}) {
    if(busy)return; busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      const r=await fetch('/api/experiment',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,taskId,id:session?.id,cursor,...extra})});
      const data=await r.json();if(!r.ok)throw new Error(data.error);
      session=data.session;cursor=data.cursor; draw(data);
    }catch(e){document.querySelector('#world-content').textContent=e.message;}
    finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  function draw({world,evaluation}) {
    const last=world.ledger.at(-1);
    root.querySelector('#world-content').innerHTML=`<div class="world-metrics"><strong>营业额 ${world.total} 分</strong><span>已处理 ${world.cursor}/${world.orders.length} 笔</span><span>${evaluation.correct?'✓ 符合已支付订单规则':'× 与业务规则不符'}</span></div><p>${last?escape(last.reason):'等待第一笔订单。'}${last?.predictionMatched==null?'':last.predictionMatched?' · 预测正确':' · 预测与实际不同'}</p><pre class="terminal">${escape(JSON.stringify(world.orders[world.cursor]||'全部处理完毕',null,2))}</pre><label class="field-label">预测下一步营业额（分）<input id="world-prediction" class="text-field" type="number" min="0"></label><div class="actions"><button data-world="step">推进一笔</button><button data-world="finish">运行到底</button><button data-world="replay">回看此步</button><button data-world="fork">从此处分支</button><a class="button-link" href="/api/experiment/export?id=${encodeURIComponent(session.id)}" download>导出实验</a></div><label class="field-label">回放位置 <input id="world-cursor" type="range" min="0" max="${session.actions.length}" value="${cursor}"> ${cursor}/${session.actions.length}</label><label><input id="world-rule" type="checkbox" ${world.includeCancelled?'checked':''}> 分支实验：把取消订单也计入营业额</label><p class="muted">回放只读历史；分支生成独立实验，保留原记录。场景版本 ${escape(session.initial.version)}。</p>`;
    root.querySelectorAll('[data-world]').forEach(bind);
    root.querySelector('#world-cursor').oninput=e=>{cursor=Number(e.target.value);};
  }
  function bind(button){button.onclick=()=>{
    const action=button.dataset.world;
    if(action==='step') {const value=root.querySelector('#world-prediction').value;if(value===''){root.querySelector('#world-prediction').focus();return;}call(action,{prediction:Number(value)});}
    else call(action,{includeCancelled:root.querySelector('#world-rule')?.checked||false});
  };}
  root.querySelectorAll('[data-world]').forEach(bind);
}

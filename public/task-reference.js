const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function format(value){if(Array.isArray(value)&&value.length&&value.every(x=>x&&typeof x==='object'&&!Array.isArray(x)))return '[\n'+value.map(x=>'  '+JSON.stringify(x)).join(',\n')+'\n]';return JSON.stringify(value,null,2);}
export function contextMarkup(context){
 if(!context)return '';
 const rich=context.fields.length||context.examples.length;
 return `<section class="task-context ${rich?'':'task-context-compact'}" aria-label="本题输入与输出"><h4>${rich?'输入与输出说明':'作答说明'}</h4><p>${esc(context.intro)}</p>${context.signature?`<code class="task-signature">${esc(context.signature)}</code>`:''}${context.fields.length?`<div class="table-wrap"><table class="context-fields"><thead><tr><th>字段 / 参数</th><th>类型</th><th>含义</th></tr></thead><tbody>${context.fields.map(f=>`<tr><td><code>${esc(f.name)}</code></td><td>${esc(f.type)}</td><td>${esc(f.meaning)}</td></tr>`).join('')}</tbody></table></div>`:''}<ul>${context.rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul>${context.examples.length?`<details class="context-examples" open><summary>公开示例 · 说明输入与返回值</summary>${context.examples.map(e=>{const fn=context.signature?.match(/^(\w+)\(/)?.[1];const input=e.inputText??(fn?fn+'('+e.args.map(format).join(', ')+')':e.args.map(format).join(', '));return `<div class="context-example"><div><span>${esc(e.label)}</span><pre>${esc(input)}</pre></div><div><span>${esc(e.responseLabel||'应返回')}</span><pre>${esc(format(e.expected))}</pre></div></div>`;}).join('')}</details>`:''}</section>`;
}
export function questionReferenceMarkup(q,exam){
 const knowledge=q.knowledge?.topics?.length&&!exam;
 return `<div class="task-brief"><h3>${esc(q.brief)}</h3></div><div class="task-reference-tools">${q.context?'<button type="button" id="context-open" class="knowledge-open" aria-expanded="false" aria-controls="context-panel">输入与示例</button>':''}${knowledge?'<button type="button" id="knowledge-open" class="knowledge-open" aria-expanded="false" aria-controls="knowledge-panel">本题知识点 · '+q.knowledge.topics.length+'</button>':''}</div>${q.context?.signature?`<code class="task-signature task-contract">${esc(q.context.signature)}</code>`:''}`;
}
export function questionDetailsMarkup(q,exam){
 const knowledge=q.knowledge?.topics?.length&&!exam;
 return `${q.context?`<details class="task-details"><summary>查看完整说明与公开示例</summary>${contextMarkup(q.context)}</details><aside id="context-panel" class="knowledge-panel context-panel" popover role="dialog" aria-labelledby="context-title"><div class="knowledge-heading"><h3 id="context-title">输入与示例</h3><button type="button" data-reference-close aria-label="关闭输入与示例">关闭 ×</button></div>${contextMarkup(q.context)}</aside>`:''}${knowledge?`<aside id="knowledge-panel" class="knowledge-panel" popover role="dialog" aria-labelledby="knowledge-title"><div class="knowledge-heading"><div><span class="eyebrow">随用随查</span><h3 id="knowledge-title">本题知识点</h3></div><button type="button" data-reference-close aria-label="关闭知识点">关闭 ×</button></div><p class="muted">可对照题目查阅，关闭后继续编辑。</p>${q.knowledge.topics.map(t=>`<section class="knowledge-topic"><h4>${esc(t.title)}</h4><p>${esc(t.text)}</p>${t.code?`<pre>${esc(t.code)}</pre>`:''}</section>`).join('')}</aside>`:''}`;
}
export function bindQuestionReference(host,onOpen){
 const disposers=[],closers=[];
 for(const kind of ['context','knowledge']){
  const button=host.querySelector('#'+kind+'-open'),panel=host.querySelector('#'+kind+'-panel');if(!button||!panel)continue;
  const native=typeof panel.showPopover==='function';let open=false;
  if(!native){panel.removeAttribute('popover');panel.hidden=true;}
  const close=()=>{if(!open)return;if(native)panel.hidePopover();else panel.hidden=true;open=false;button.setAttribute('aria-expanded','false');};
  closers.push(close);
  const show=()=>{if(open){close();return;}closers.forEach(fn=>fn());if(native)panel.showPopover();else panel.hidden=false;open=true;button.setAttribute('aria-expanded','true');if(kind==='knowledge')onOpen();};
  const toggle=event=>{open=event.newState==='open';button.setAttribute('aria-expanded',String(open));};
  button.addEventListener('click',show);panel.querySelector('[data-reference-close]').onclick=close;
  if(native)panel.addEventListener('toggle',toggle);
  const outside=event=>{if(!native&&open&&!panel.contains(event.target)&&!button.contains(event.target))close();};
  const escape=event=>{if(event.key==='Escape')close();};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  disposers.push(()=>{close();button.removeEventListener('click',show);panel.removeEventListener('toggle',toggle);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);});
 }
 return ()=>disposers.forEach(fn=>fn());
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unitName=(route,id)=>route.units.find(u=>u.id===id)?.title||id;
export function labEntryMarkup(route){
 const lab=route.lab,entry=lab.entry;
 if(route.question?.assignmentId)return '<div class="callout">教师指定补练：直接进入目标任务，入口诊断不重复要求。</div>';
 const bridges=(entry.weak.length?entry.weak:entry.suggested).map(id=>`<button data-lab-open="js-orders-${id}-0" data-entry="bridge">补充：${esc(unitName(route,id))} ↗</button>`).join('');
 if(entry.status==='active'){
  const q=entry.question;
  return `<section class="lab-entry panel"><div class="panel-head">入口诊断 ${entry.index+1}/${entry.total}<span class="muted">不计入通关</span></div><div class="below-body"><p>${esc(q.brief)}</p>${q.kind==='choice'?q.options.map((o,i)=>`<label class="check-option"><input type="radio" name="diagnostic-choice" value="${i}">${esc(o)}</label>`).join(''):`<pre class="terminal">${esc(q.code)}</pre><label class="field-label">预测输出<input class="text-field" id="diagnostic-answer"></label>`}<div class="actions"><button id="diagnostic-submit" class="primary">确认，继续诊断</button><button data-route="diagnostic-skip">不做检查，直接练习</button></div></div></section>`;
 }
 if(entry.status==='pending')return `<section class="lab-entry panel"><div class="panel-head">从这里开始，需要多少帮助？</div><div class="below-body"><p>${esc(entry.reason)}</p><p class="muted">建议基础：${lab.prerequisites.map(id=>esc(unitName(route,id))).join('、')}。诊断只检查起点，不替代出口考核。</p><div class="actions"><button data-route="diagnostic-start" class="primary">做两道入口小题</button><button data-route="diagnostic-skip">直接开始练习 →</button></div></div></section>`;
 return `<section class="lab-entry callout ${entry.status==='gaps'?'amber':''}"><strong>${entry.status==='passed'?'入口诊断通过':entry.status==='gaps'?'按需补足基础':entry.status==='skipped'?'直接探索':'学习入口已就绪'}</strong><p>${esc(entry.reason)}</p>${bridges?`<div class="actions">${bridges}</div>`:''}${lab.prerequisites.length?'<details><summary>想重新检查起点？</summary><button data-route="diagnostic-start">重新做入口诊断</button></details>':''}</section>`;
}
export function labTabsMarkup(route){return `<div class="lab-tabs" aria-label="本单元的 Lab">${route.labs.filter(l=>l.unitId===route.selected).map(l=>`<button data-lab-open="${l.id}" class="${l.id===route.lab.id?'selected':''} ${l.completed?'lab-done':''}" ${route.exam&&!route.exam.finished&&!route.exam.paused?'disabled':''}>${l.completed?'✓ ':''}${esc(l.title)}${l.id===route.lab.id?' · 当前':''}</button>`).join('')}</div>`;}

export function labActionsMarkup(route){
 const unit=route.units.find(u=>u.id===route.selected),lab=route.lab;
 const exam=route.exam&&!route.exam.finished&&!route.exam.paused;
 if(exam)return '<p class="lab-current-state">正在独立考核，请在下方作答。</p>';
 const pending=['pending','active'].includes(lab.entry.status),guided=lab.source==='recommended';
 const remaining=Math.max(0,unit.trainingCount-unit.trained.length);
 const state=pending?'先选择下方的入口检查，也可以直接开始练习。':route.question?'练习已就绪，直接在下方作答。':lab.completed?'本关练习已完成，可以回看结果或再练一次。':'准备好后，开始本关练习。';
 const next=route.labs.some(l=>!l.legacy&&l.unitId===unit.id&&!unit.trained.includes(l.variant));
 const primary=pending||route.question?'':`<div class="actions lab-primary-actions"><button data-route="practice" ${lab.completed?'':'class="primary"'}>${lab.completed?'再练一次（新题）':'开始练习'}</button>${lab.completed&&next?'<button data-follow-route class="primary">继续推荐路线 →</button>':''}</div>`;
 const assessment=unit.passed?'<p class="passed">✓ 本单元独立考核已通过。</p><details><summary>想重新检验掌握情况？</summary><button data-route="unit-exam">再做一次独立考核</button></details>':unit.needs?`<p>先完成 ${unit.needs} 项补练，再参加独立考核。</p>`:remaining?`<p>本单元还有 ${remaining} 项练习未完成。全部练习完成后，可参加独立考核。</p>`:'<p>本单元练习已完成。考核会使用新题，且不提供提示。</p><button data-route="unit-exam" class="primary">开始本单元独立考核 →</button>';
 return `<div class="lab-controls"><p class="lab-current-state">${state}</p>${primary}<details class="lab-tools"><summary>学习方式与分享</summary><div class="lab-tools-body"><p>完成本关后，你希望：</p><div class="actions" role="group" aria-label="完成练习后的安排"><button data-learning-mode="direct" aria-pressed="${!guided}" ${!guided?'class="selected"':''}>留在本关回看</button><button data-learning-mode="recommended" aria-pressed="${guided}" ${guided?'class="selected"':''}>自动进入后续练习</button></div><p class="muted">${guided?'当前会沿推荐路线继续，你可以随时停留。':'当前完成后会停留，不会自动跳走。'}切换方式会保留当前题目和草稿。</p><button data-copy-lab>复制本关链接</button><span id="lab-share-status" role="status"></span></div></details></div><section class="lab-assessment" aria-label="本单元能力验证"><strong>本单元能力验证</strong>${assessment}</section>`;
}

// One tooltip and one message serve hover, keyboard focus and touch/click.
export function bindStageExamHints(host,startExam){
 let active=null,timer;const listeners=[];
 const hide=()=>{clearTimeout(timer);if(active){active.tooltip.hidden=true;active=null;}};
 const show=(button,tooltip)=>{if(host.getAttribute('aria-busy')==='true')return;hide();active={button,tooltip};tooltip.hidden=false;const rect=button.getBoundingClientRect();tooltip.style.left=Math.max(16,Math.min(rect.left,innerWidth-tooltip.offsetWidth-16))+'px';tooltip.style.top=Math.max(8,rect.bottom+8+tooltip.offsetHeight>innerHeight?rect.top-tooltip.offsetHeight-8:rect.bottom+8)+'px';};
 const on=(el,event,fn)=>{el.addEventListener(event,fn);listeners.push(()=>el.removeEventListener(event,fn));};
 host.querySelectorAll('[data-stage-exam]').forEach(button=>{
  const unavailable=button.getAttribute('aria-disabled')==='true';
  const tooltip=host.querySelector('#stage-tooltip-'+button.dataset.stageExam);
  on(button,'click',event=>{if(unavailable){event.preventDefault();show(button,tooltip);}else startExam(button.dataset.stageExam);});
  if(!unavailable)return;
  on(button,'mouseenter',()=>{clearTimeout(timer);timer=setTimeout(()=>show(button,tooltip),120);});
  on(button,'mouseleave',()=>{clearTimeout(timer);if(document.activeElement!==button)hide();});
  on(button,'focus',()=>show(button,tooltip));on(button,'blur',hide);
 });
 on(document,'pointerdown',event=>{if(active&&!active.button.contains(event.target)&&!active.tooltip.contains(event.target))hide();});
 on(document,'keydown',event=>{if(event.key==='Escape')hide();});on(window,'resize',hide);on(window,'scroll',hide);
 return ()=>{hide();listeners.forEach(remove=>remove());};
}

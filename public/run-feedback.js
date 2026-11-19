const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=value=>value===undefined?'未提供':JSON.stringify(value,null,2);
function diagnosticMarkup(d,error,locate){
 return `<div class="execution-diagnostic"><strong>${esc(d?.title||'执行未完成')}</strong><p>${esc(d?.message||'请结合原始错误与当前输入检查代码。')}</p>${d?.line&&locate?`<button type="button" data-error-line="${d.line}" data-error-column="${d.column||''}">定位第 ${d.line} 行${d.approximate?'附近':''}</button>`:''}<details class="raw-error"><summary>查看原始错误</summary><pre>${esc(error)}</pre></details></div>`;
}
export function runFeedbackMarkup(result,{locate=false}={}){
 if(!result)return '';
 const checks=result.checks||[],failed=checks.filter(c=>!c.passed&&c.status!=='unassessed'),unknown=checks.filter(c=>c.status==='unassessed'),passed=checks.filter(c=>c.passed);
 const reviewed=result.reviewOutcome==='confirmed',unassessed=result.status==='unassessed'&&!result.reviewOutcome;
 const outcome=reviewed?'✓ 人工核对确认通过':unassessed?'待核对 · 自动无法评估':result.passed?'✓ 本次运行通过':'↳ 修改后再验证';
 const check=c=>`<article class="run-check ${c.status==='unassessed'?'check-unassessed':c.passed?'check-passed':'check-failed'}"><h4>${c.status==='unassessed'?'?':c.passed?'✓':'×'} ${esc(c.name)}</h4>${c.error||c.status==='unassessed'?diagnosticMarkup(c.diagnostic,c.error||'自动探测未能确认调用关系，没有把这项探测记为答错。',locate):''}${c.input!==undefined&&c.status!=='unassessed'?'<div class="check-value"><strong>'+ (c.inputMode==='sequence'?'连续调用的参数组':'调用参数') +'</strong><pre>'+esc(format(c.input))+'</pre></div>':''}${Object.hasOwn(c,'expected')&&c.status!=='unassessed'?'<div class="check-comparison"><div><strong>预期结果</strong><pre>'+esc(format(c.expected))+'</pre></div><div><strong>实际结果</strong><pre>'+esc(c.error?'执行中断，未返回结果':format(c.actual))+'</pre></div></div>':''}${c.detail?'<pre>'+esc(c.detail)+'</pre>':''}</article>`;
 return `<section class="run-feedback" aria-label="本次运行结果"><div class="run-feedback-heading"><strong class="${reviewed||result.passed?'passed':unassessed?'unassessed':'failed'}">${outcome}${checks.length?' · '+(unknown.length?passed.length+' 项自动通过 · '+unknown.length+(reviewed?' 项人工确认':result.reviewOutcome==='needs-practice'?' 项复核建议补练':' 项待核对')+(failed.length?' · '+failed.length+' 项未通过':''):passed.length+'/'+checks.length+' 项检查通过'):''}</strong><span class="result-freshness" role="status">本次提交的执行结果</span></div>${result.error&&!checks.some(c=>c.error)?diagnosticMarkup(result.diagnostic,result.error,locate):''}${result.output!==undefined?'<p>实际输出：<code>'+esc(result.output)+'</code></p>':''}${unassessed?'<p>已自动进入教师核对队列，不计为答错。原代码与草稿保留，可继续探索其他 Lab。</p>':''}${reviewed?'<p>原自动结果保留，人工核对结论单独记录。</p>':''}${failed.slice(0,1).map(check).join('')}${failed.length>1?'<details class="more-failed-checks"><summary>查看其余失败检查（'+(failed.length-1)+'）</summary>'+failed.slice(1).map(check).join('')+'</details>':''}${unknown.map(check).join('')}${passed.length?'<details class="passed-checks"><summary>已通过的检查（'+passed.length+'）</summary>'+passed.map(check).join('') :''}${!result.passed&&!unassessed&&!reviewed?'<p class="muted">对照输入与需求检查代码，修改后再次点击“运行并检查”。</p>':'<p class="muted">训练结果已记录；单元能力仍以独立考核为准。</p>'}</section>`;
}
export function bindRunFeedback(host,textarea,editor,result){
 const panel=host.querySelector('.run-feedback');if(!panel||!textarea||!result)return ()=>{};
 const update=()=>{const stale=result.code!==null&&result.code!==undefined&&textarea.value!==result.code;panel.dataset.stale=String(stale);panel.querySelector('.result-freshness').textContent=stale?'代码已修改，下面是上次结果；请重新运行。':'本次提交的执行结果';panel.querySelectorAll('[data-error-line]').forEach(b=>b.disabled=stale);if(stale)editor?.clear();};
 const listeners=[];
 panel.querySelectorAll('[data-error-line]').forEach(b=>{const fn=()=>{if(!b.disabled)editor?.locate(Number(b.dataset.errorLine),Number(b.dataset.errorColumn)||null);};b.addEventListener('click',fn);listeners.push(()=>b.removeEventListener('click',fn));});
 textarea.addEventListener('input',update);update();
 return ()=>{textarea.removeEventListener('input',update);listeners.forEach(fn=>fn());};
}

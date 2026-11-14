import {teachingMarkup,bindTeaching,studentFeedbackMarkup} from './teaching.js';
import {workspaces, workspaceFor, workspacePage, teacherOverview} from './workspaces.js';
import {routeMarkup,bindRoute} from './route.js';
import {unitMarkup,bindUnit} from './unit.js';
import { experimentMarkup, bindExperiment } from './experiment.js';
import { taskCopy, matchingAttempt, taskNavigation } from './learning-flow.js';
import { completionPolicy, completionSatisfied, canAutoAdvance } from './completion-policy.js';
import { resumeJourney, nextLearningTask } from './journey.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let pendingLab=new URLSearchParams(location.search).get('lab');
let workspace = pendingLab?'student':workspaceFor(localStorage.getItem('devlabs-workspace'));
const workspaceViews = {student:'route', teacher:'overview'};
let viewController, navigating = false, pendingTeacherAssignment=null;
let teacherUnit=localStorage.getItem('devlabs-teacher-unit')||'values';
const workspaceDrafts = new Map();
let data, current = localStorage.getItem('devlabs-current') || 's0-state', view = workspaces[workspace].home, selectedFile = '', latest = null, terminal = '', aiAnswer = '', running = false;
let queue = Promise.resolve(), saveTimer, toastTimer, helpOpen = false, advanceTimer, pendingAdvance = null;
let stageDialog = null, stageTimer;
const dirtyFiles = new Map();
const draftMemory = {};
async function request(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '操作失败'); return result;
}
function post(url, body) { const op = queue.catch(() => {}).then(() => request(url, body)); queue = op; return op; }
function toast(text) { const el = $('#toast'); el.textContent = text; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 4500); }
function task() { return data.tasks.find(t => t.id === current) || data.tasks[0]; }
function draft(t = task()) { return draftMemory[t.id] ||= { code: t.starter, prediction: '', explanation: '', checkAnswer: '', ...(data.state.drafts[t.id] || {}) }; }
function submitted(t) { return data.state.attempts.filter(a => a.id === t.id && a.submitted && a.passed); }
function stageCount(stage) { return data.tasks.filter(t => t.stage === stage && submitted(t).length).length; }
function due(t) { const first = submitted(t)[0]; return first && Date.now() - Date.parse(first.at) >= 7 * 86400000 && !submitted(t).some(a => a.retest); }
function policy() { return completionPolicy(task(), data.state.attempts, data.state.retests[current]); }
function cancelAdvance() { clearTimeout(advanceTimer); pendingAdvance = null; }
function activeRetest() { return Boolean(data.state.retests[task().id]); }
async function flush() {
  clearTimeout(saveTimer);
  for (const [file, content] of [...dirtyFiles]) { await post('/api/file', { file, content }); if (dirtyFiles.get(file) === content) dirtyFiles.delete(file); }
  for (const [id, value] of Object.entries(draftMemory)) { await post('/api/draft', { id, ...value }); data.state.drafts[id] = { ...value }; }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().then(() => { if ($('#save-state')) $('#save-state').textContent = '已保存到本机'; }).catch(e => { if ($('#save-state')) $('#save-state').textContent = '保存失败，请重试'; toast(e.message); }), 800); if ($('#save-state')) $('#save-state').textContent = '正在保存…'; }
async function refresh() { data = await request('/api/state'); }
function layout(content) {
  const config = workspaces[workspace], page = config.pages.find(p=>p.id===view);
  return `<div class="app-shell" data-workspace="${workspace}"><aside class="sidebar"><div class="brand"><span class="brand-mark">d/</span>DevLabs <small>ALPHA</small></div><div class="side-caption">${config.title}</div><nav class="side-nav" aria-label="${config.title}导航">${config.pages.map(p=>`<button data-view="${p.id}" class="${view===p.id?'active':''}" ${view===p.id?'aria-current="page"':''}>${p.label}</button>`).join('')}</nav><div class="sidebar-bottom">${workspace==='teacher'?'观察，追问，帮助学生前进。':'理解，实践，然后证明。'}<a href="https://codemuseum.freexlib.com" target="_blank" rel="noreferrer">CodeMuseum ↗</a><a href="https://labs.freexlib.com" target="_blank" rel="noreferrer">xshow ↗</a><span>本机单学员 · JavaScript 路线<br>${workspace==='teacher'?'训练、考核与教师观察分别记录。':'AI 辅助，理解由你完成。'}</span></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">${config.title} &nbsp; / &nbsp; <strong>${page?.title||''}</strong></div><div class="profile"><div class="workspace-switch" role="group" aria-label="切换工作台">${[['student','学生'],['teacher','教师']].map(([id,label])=>`<button type="button" data-workspace-switch="${id}" aria-pressed="${workspace===id}" ${workspace===id?'class="selected"':''}>${label}</button>`).join('')}</div><span class="local-profile"><span class="dot"></span> 本机体验</span></div></header><div class="content">${content}<div class="footer-note">DevLabs α · 测试通过与能力掌握分别记录。独立性由现场变式与追问复核，本机记录不作为认证成绩。</div></div></main></div>`;
}
function rememberWorkspaceDraft() {
  if (!['pilot','review'].includes(view)) return;
  const fields=[...document.querySelectorAll('#pilot-form [name], [data-review-note]')];
  workspaceDrafts.set(view, fields.map(el=>({key:el.name||el.dataset.reviewNote, value:el.value})));
}
function restoreWorkspaceDraft() {
  for (const saved of workspaceDrafts.get(view)||[]) {
    const el=[...document.querySelectorAll('#pilot-form [name], [data-review-note]')].find(el=>(el.name||el.dataset.reviewNote)===saved.key);
    if(el) el.value=saved.value;
  }
}
async function navigateWorkspace(nextWorkspace, nextView) {
  if(running||navigating) return;
  nextWorkspace=workspaceFor(nextWorkspace);
  nextView=workspacePage(nextWorkspace,nextView||workspaceViews[nextWorkspace]);
  if(nextWorkspace===workspace&&nextView===view) return;
  navigating=true;
  try {
    await viewController?.beforeLeave();
    rememberWorkspaceDraft();
    await action(async()=>{
      await refresh();
      workspaceViews[workspace]=view;
      workspace=nextWorkspace;view=nextView;if(workspace==='teacher')history.replaceState(null,'',location.pathname);workspaceViews[workspace]=view;
      localStorage.setItem('devlabs-workspace',workspace);
    });
  } catch(e) {toast(e.message);}
  finally {navigating=false;}
}
function missionStatus(t) {
  if (submitted(t).length) return { css:'completed', label:'已通关' };
  const last=data.state.attempts.filter(a=>a.id===t.id).at(-1);
  if (last && (!last.passed || last.completion?.checkPassed === false)) return { css:'needs-repair', label:'待修正' };
  if (t.id===current || last || data.state.drafts[t.id]) return { css:'in-progress', label:'进行中' };
  return { css:'not-started', label:'未开始' };
}
function stageCards() {
  return `<div class="stages">${data.stages.map(s => { const count = stageCount(s.id), total = data.tasks.filter(t => t.stage === s.id).length; return `<button class="stage ${count === total ? 'completed' : task().stage === s.id || count > 0 ? 'in-progress' : ''} ${task().stage === s.id ? 'selected' : ''}" data-stage="${s.id}"><div class="stage-row"><span class="stage-code">${s.id}</span><span class="muted">${count} / ${total} 已验收</span></div><h3>${s.title}</h3><p>${s.subtitle}</p><progress class="stage-progress" value="${count}" max="${total}" aria-label="${s.id} 已验收任务">${count}/${total}</progress></button>`; }).join('')}</div>`;
}
function currentResult() {
  const attempts = latest?.id === current ? [...data.state.attempts, latest] : data.state.attempts;
  return matchingAttempt(task(), draft(), data.project, attempts, data.state.retests[current]);
}
function renderSteps() {
  const nav = taskNavigation(data.tasks, task(), currentResult());
  return `<ol class="learning-steps" aria-label="本题步骤">${taskCopy(task(), policy().mode).steps.map((label, i) => `<li class="${i + 1 === nav.step ? 'current' : i + 1 < nav.step ? 'done' : ''}" ${i + 1 === nav.step ? 'aria-current="step"' : ''}><span>${i + 1 < nav.step ? '✓' : i + 1}</span>${label}</li>`).join('')}</ol>`;
}
function renderChecks(result) {
  const t = task(), mode = policy().mode;
  const nextAction = mode === 'direct' ? '答对即记录通过，短暂展示结果后自动进入下一任务。' : mode === 'check' ? '通过后只需完成一道选择检查，无需写解释。' : '通过后解释你的判断并提交，平台会自动继续。';
  if (!result) return `<div class="callout">${t.kind === 'predict' ? '本题只观察，不修改代码。先预测，再运行对照。' : '在编辑区完成实现，再运行测试。'}${nextAction}</div>`;
  const title = t.kind === 'predict' ? result.passed ? '✓ 预测与实际输出一致' : result.error ? '↳ 程序运行遇到问题' : '↳ 预测与实际输出不同' : result.passed ? '✓ 测试通过' : '↳ 还有测试未通过';
  let guide = result.passed ? result.submitted ? result.completion?.mode === 'explain' || !result.completion ? '本题已提交，解释可稍后复核，接下来自动继续。' : '本题已完成，结果已保存，无需逐题写解释。' : mode === 'check' ? '运行结果正确。完成下方一道选择检查即可继续。' : mode === 'direct' ? '结果正确，可以继续下一任务。' : '结果没有问题。接下来写下你的理解，点击“提交本题”，然后继续。' : t.kind === 'predict' ? '按执行顺序对照实际输出，更新预测后重试。需要时再展开帮助。' : '查看失败用例的输入和差异，修改代码后重试。需要时再展开帮助。';
  return `<h3 class="${result.passed ? 'passed' : 'failed'}">${title}${result.submitted ? ' · 已记录完成' : ''}</h3>
    ${t.kind === 'predict' && result.output !== undefined ? `<div class="output-comparison"><div><span>你的预测</span><pre>${esc(result.prediction)}</pre></div><div><span>实际输出</span><pre>${esc(result.output)}</pre></div></div>` : ''}
    ${result.error ? `<pre class="check-detail failed">${esc(result.error)}</pre>` : ''}
    ${t.kind === 'predict' ? '' : result.checks.map(c => `<div class="check"><span class="${c.passed ? 'passed' : 'failed'}">${c.passed ? '✓' : '×'}</span><div>${esc(c.name)}${!c.passed && (c.detail || c.actual !== undefined) ? `<div class="check-detail">${esc(c.detail || `输入：${JSON.stringify(c.input)}\n你的结果：${JSON.stringify(c.actual)}\n预期结果：${JSON.stringify(c.expected)}`)}</div>` : ''}</div></div>`).join('')}
    <p class="result-guide">${guide}</p>${pendingAdvance?.id === current ? '<div class="auto-next" role="status">答对了，2 秒后自动进入下一任务。<button data-stay>先留在本题</button></div>' : ''}`;
}
function focusCompletionStep() {
  const section = $('.completion-fields');
  const input = section?.querySelector('input[name="check-answer"]:checked, textarea') || section?.querySelector('input[name="check-answer"]');
  if (!input) return;
  input.focus({ preventScroll: true });
  section.scrollIntoView({ block: 'center', behavior: 'instant' });
  section.classList.remove('step-attention');
  // Restart the soft emphasis when the learner reruns the task.
  void section.offsetWidth;
  section.classList.add('step-attention');
  setTimeout(() => section.classList.remove('step-attention'), 1600);
}
function renderCompletionFields(result) {
  const t = task(), d = draft(), { mode, reason } = policy(), copy = taskCopy(t, mode);
  if (mode === 'direct') return '<h3 class="step-heading" data-step="3">③ 自动记录通过</h3><p class="direct-note">基础练习 · 答对即完成，无需解释或再次提交。</p>';
  if (mode === 'check' && !result?.passed) return '<h3 class="step-heading" data-step="3">③ 简短检查</h3><p class="direct-note">先运行通过，再回答一道选择题，无需写解释。</p>';
  const content = mode === 'check' ? `<fieldset class="knowledge-check"><legend class="step-heading" data-step="3">③ ${esc(t.completion.question)}</legend>${t.completion.choices.map(c => `<label class="check-option"><input type="radio" name="check-answer" value="${esc(c.id)}" ${d.checkAnswer === c.id ? 'checked' : ''}><span>${esc(c.text)}</span></label>`).join('')}<p class="check-feedback" aria-live="polite">${result?.completion?.checkPassed === false ? '这个判断还不准确，请对照代码重新选择。' : result?.completion?.checkPassed ? '概念检查正确。' : '选择最符合代码行为的一项。'}</p></fieldset>` : `${reason === 'reflection' ? '<div class="callout amber">本轮已两次未通过，先简单复盘：哪里与预期不同？你准备如何验证？</div>' : reason === 'retest' ? '<div class="callout">延迟复测保留解释，请独立说明你的判断依据。</div>' : ''}<label><span class="field-label step-heading" data-step="3">③ ${copy.explanationLabel}<span class="field-note">本题需要理解证据，至少 15 字</span></span><textarea id="explanation" class="text-field" rows="3" placeholder="${copy.explanationPlaceholder}">${esc(d.explanation)}</textarea></label>`;
  return `${content}<div class="actions"><button id="submit" class="primary" ${result?.passed && completionSatisfied(mode, d) ? '' : 'disabled'}>${mode === 'check' ? '确认并继续 →' : '提交本题'}</button><span id="submit-guidance" class="status-text">${submissionGuide(result)}</span></div>`;
}
function submissionGuide(result) {
  const mode = policy().mode;
  if (result?.submitted) return '本题已完成，平台将自动继续，也可选择停留。';
  if (!result?.passed) return '先完成上方运行检查。';
  if (mode === 'check') return draft().checkAnswer ? '确认答案后即可继续。' : '选择一项，无需写解释。';
  return draft().explanation.trim().length < 15 ? '写下至少 15 字的解释后即可提交。' : '提交通过后将自动继续。';
}
function renderNextPath() {
  const t = task(), result = currentResult(), nav = taskNavigation(data.tasks, t, result), mode = policy().mode;
  const text = nav.completed ? nav.next ? `已经保存本题结果。接下来：${nav.next.title}。` : '已保存最后一题的提交。查看证据，结合教师复核确认还需补练什么。' : result?.passed ? mode === 'check' ? '只需完成上方的一道选择检查。' : '完成本题要求的解释后即可前进，不必等待人工复核。' : result ? '先根据运行结果调整预测或代码，再运行检查。' : mode === 'direct' ? '这是一道基础练习，答对后会自动继续；也可以选择留在本题。' : mode === 'check' ? '运行正确后，完成一道简短检查即可继续。' : '本题承担能力验证：运行通过后，解释关键判断并提交。';
  return `<h3 class="step-heading" data-step="4">④ 继续学习</h3><div class="next-path-copy"><strong>${nav.completed ? '本题已完成，可以继续' : '本题完成后，往哪里走？'}</strong><p>${esc(text)}</p></div>
    <div class="actions">${nav.previous ? `<button data-previous>← 上一任务</button>` : ''}<button data-continue class="primary" ${nav.completed ? '' : 'disabled'}>${esc(nav.nextLabel)}</button></div>`;
}
function scheduleAdvance(result) {
  if (result.stageCompleted && data.state.stageTransitions?.[result.stageCompleted]?.status === 'pending') { showStageTransition(data.state.stageTransitions[result.stageCompleted]); return; }
  if (!canAutoAdvance(result) || view !== 'learn' || result.id !== current || !currentResult()?.submitted) return;
  const id = current, attemptId = result.attemptId;
  pendingAdvance = { id, attemptId }; updateFlow();
  advanceTimer = setTimeout(() => {
    if (view !== 'learn' || current !== id || running || document.hidden || currentResult()?.attemptId !== attemptId || !currentResult()?.submitted) { cancelAdvance(); if (view === 'learn') updateFlow(); return; }
    const next = nextLearningTask(data.tasks, data.state.attempts, current);
    cancelAdvance();
    if (next) switchTask(next.id);
    else action(async () => { view = 'evidence'; await refresh(); });
  }, 2000);
}
function showArrival(reason) {
  const cue = $('#journey-cue'), header = $('.task-header');
  if (!cue || !header) return;
  cue.hidden = false;
  cue.textContent = reason === 'start' ? '第一关已就绪 · 从这里开始' : reason === 'stay' ? '已留在本阶段 · 可以回看，也可随时继续下一关' : reason === 'resume' ? '继续未完成的关卡 · 你的进度已经保留' : '下一关已就绪 · 继续你的挑战';
  header.classList.add('arrival-highlight'); $('.mission.active')?.classList.add('arrival-highlight');
  const heading = header.querySelector('h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
  header.scrollIntoView({ block: 'start', behavior: 'instant' });
  setTimeout(() => document.querySelectorAll('.arrival-highlight').forEach(e => e.classList.remove('arrival-highlight')), 1800);
}
function showStageTransition(transition) {
  if (stageDialog) return;
  cancelAdvance();
  const stage = data.stages.find(s => s.id === transition.stage);
  const next = data.tasks.find(t => t.id === transition.nextTaskId);
  const dialog = document.createElement('dialog'); stageDialog = dialog;
  dialog.className = 'stage-celebration';
  dialog.setAttribute('aria-labelledby', 'stage-win-title');
  dialog.innerHTML = `<div class="confetti" aria-hidden="true">${Array.from({length: 24}, () => '<i></i>').join('')}</div><div class="win-medal" aria-hidden="true">✦</div><div class="eyebrow">STAGE COMPLETE</div><h2 id="stage-win-title">${esc(stage.id)} · ${esc(stage.title)}，体验段完成！</h2><p>体验路线的 ${data.tasks.filter(t => t.stage === stage.id).length} 个任务已全部提交通过。</p><div class="win-next">${next ? `下一站：${esc(next.stage)} · ${esc(data.stages.find(s => s.id === next.stage).title)}` : 'S0–S2 训练已走完，接下来看看你的学习成果。'}</div><p class="win-countdown" role="status">5 秒后${next ? '自动进入下一阶段' : '自动查看学习成果'}。</p><div class="win-actions"><button data-stage-go class="primary">${next ? '立即进入下一阶段 →' : '查看学习成果 →'}</button><button data-stage-stay>留在本阶段回味</button></div><p class="muted">这是体验路线进度，不代表完整 S0–S2 能力达标。</p>`;
  document.body.append(dialog); dialog.showModal();
  let remaining = 5, deciding = false;
  const choose = async choice => {
    if (deciding) return;
    deciding = true; clearInterval(stageTimer);
    dialog.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      await flush(); await post('/api/stage-transition', { stage: transition.stage, choice }); await refresh();
      dialog.close(); dialog.remove(); stageDialog = null;
      if (choice === 'stay') { render(); showArrival('stay'); }
      else if (next) await switchTask(next.id);
      else await action(async () => { view = 'evidence'; });
    } catch (e) { deciding = false; dialog.querySelectorAll('button').forEach(b => b.disabled = false); dialog.querySelector('.win-countdown').textContent = e.message + '，请重试。'; }
  };
  dialog.querySelector('[data-stage-go]').onclick = () => choose('continue');
  dialog.querySelector('[data-stage-stay]').onclick = () => choose('stay');
  dialog.addEventListener('cancel', e => { e.preventDefault(); choose('stay'); });
  dialog.querySelector('[data-stage-go]').focus();
  stageTimer = setInterval(() => {
    if (document.hidden || deciding) return;
    remaining--;
    dialog.querySelector('.win-countdown').textContent = `${remaining} 秒后${next ? '自动进入下一阶段' : '自动查看学习成果'}。`;
    if (remaining <= 0) choose('continue');
  }, 1000);
}
function renderShopOutput() {
  const item=data.state.shop?.[current];
  if(!item)return '<p>等待你运行本关代码。营业额、客户账单和服务响应会在这里显示实际结果。</p>';
  return `<p class="${item.passed?'passed':'failed'}">${item.passed?'✓ 本次测试通过':'× 小店还需要修复'} · ${currentResult()?'当前代码的执行证据':'上次运行记录；代码已变化，请重新运行更新'}</p><pre class="terminal">${esc(JSON.stringify({input:item.input,output:item.output,service:item.projectEvidence},null,2))}</pre><p class="muted">代码摘要 ${esc(item.sourceHash.slice(0,12))} · ${esc(item.at)}。测试响应来自临时测试服务，不代表常驻生产服务。</p>`;
}
function learn() {
  const t = task(), d = draft(), copy = taskCopy(t, policy().mode);
  if (t.kind === 'project' && !selectedFile) selectedFile = t.file;
  const readonly = t.kind === 'predict' || (t.kind === 'project' && !['store.cjs', 'app.cjs', 'README.md'].includes(selectedFile));
  const code = t.kind === 'project' ? data.project[selectedFile] : d.code;
  const history = data.state.attempts.filter(a => a.id === t.id), hints = data.state.hints[t.id] || 0;
  const assistanceOff = t.independent || activeRetest(), result = currentResult();
  return `<div class="intro"><div><div class="eyebrow">LEARN BY BUILDING</div><h1>从读懂一行，到交付一个服务。</h1><p>同一笔订单，贯穿你的第一段工程成长。</p></div><div class="cohort"><span class="dot"></span> JavaScript · 订单服务路线</div></div>
  ${stageCards()}<section class="panel shop-live"><div class="panel-head">小店运行现场<span class="muted">由本关真实执行结果驱动</span></div><div id="shop-output" class="below-body">${renderShopOutput()}</div></section><section class="shop-status" aria-label="小店恢复进度">${data.stages.map(stage=>`<span class="${stageCount(stage.id)===3 ? 'shop-ready' : ''}">${stage.id} · ${stage.id==='S0'?'收银逻辑':stage.id==='S1'?'统计账单':'订单服务'}：${stageCount(stage.id)===3?'任务已验收':'修复中'}</span>`).join('')}</section>
  <div class="work-grid"><aside class="panel mission-panel"><div class="panel-head">${t.stage} · ${data.stages.find(s => s.id === t.stage).title}<span class="muted">3 个任务</span></div><div class="mission-list">${data.tasks.filter(x => x.stage === t.stage).map((x, i) => `<button class="mission ${missionStatus(x).css} ${x.id === t.id ? 'active' : ''}" data-task="${x.id}"><span class="mission-num">${submitted(x).length ? '✓' : String(i + 1).padStart(2, '0')}</span><span><span class="mission-title">${x.title}</span><span class="mission-sub"><span class="mission-state">${missionStatus(x).label}</span> · ${x.independent ? '独立验证' : x.ability}</span></span></button>`).join('')}</div><div class="mission-aside"><h3>这一阶段，你将能够</h3>${esc(data.stages.find(s => s.id === t.stage).outcome)}<br><br>基础练习答对即前进；概念题做简短检查；独立验证和工程交付再解释关键判断。</div></aside>
  <div class="workspace"><section class="panel"><div class="task-header"><div class="task-tags"><span class="badge">${t.stage} / ${t.kind === 'predict' ? '预测实验' : t.kind === 'project' ? '真实工程' : '代码任务'}</span><span class="badge ${t.independent ? 'independent' : ''}">${t.independent ? '独立验证 · 关闭帮助' : t.ability}</span><span class="badge">${policy().mode === 'direct' ? '基础练习 · 无需解释' : policy().mode === 'check' ? '概念检查 · 单选' : policy().reason === 'reflection' ? '简短复盘' : '能力验证 · 解释'}</span>${activeRetest() ? '<span class="badge independent">延迟复测中</span>' : ''}</div><div id="journey-cue" class="journey-cue" role="status" hidden></div><h2>${esc(t.title)}</h2><p>${esc(t.brief)}</p><details class="concept-card" ${t.id === 's0-state' ? 'open' : ''}><summary>开始前：用得到的基础概念</summary><p>${esc(t.basics)}</p></details><div id="learning-route">${renderSteps()}</div></div>
  <div class="editor-toolbar"><div class="file-tabs">${t.kind === 'project' ? Object.keys(data.project).map(f => `<button data-file="${f}" class="${selectedFile === f ? 'active' : ''}">${esc(f)}${!['store.cjs', 'app.cjs', 'README.md'].includes(f) ? ' · 只读' : ''}</button>`).join('') : `<span class="muted">${t.kind === 'predict' ? 'observe.js · 只读观察' : 'solution.js · 可编辑'}</span>`}</div>${copy.resettable && !readonly ? `<button id="reset-code">恢复初始${t.kind === 'project' ? '文件' : '代码'}</button>` : ''}</div>
  <div class="editor-mode">${t.kind !== 'predict' ? '① ' : ''}${esc(t.kind === 'project' && readonly ? '参考文件 · 只读。请切换至 store.cjs、app.cjs 或 README.md 进行修改。' : copy.mode)}</div>
  <div class="editor-wrap"><div class="line-numbers" aria-hidden="true">${Array.from({ length: (code || '').split('\n').length }, (_, i) => i + 1).join('\n')}</div><label class="sr-only" for="code">${t.kind === 'project' ? selectedFile : t.kind === 'predict' ? '观察代码（只读）' : '代码编辑器'}</label><textarea id="code" class="code-editor" spellcheck="false" ${readonly ? 'readonly' : ''}>${esc(code)}</textarea></div>
  <div class="editor-footer"><span>${t.kind === 'project' ? 'Node.js · 本机多文件项目' : 'JavaScript · 独立进程执行'}</span><span id="save-state">已保存到本机</span></div>
  <div class="evidence-form">${t.kind === 'predict' ? `<label><span class="field-label step-heading" data-step="1">① 运行前，你预测输出是什么？</span><input id="prediction" class="text-field" value="${esc(d.prediction)}" placeholder="先填写预测，再点击运行" autocomplete="off"></label>` : ''}
    <h3 class="step-heading" data-step="2">② ${t.kind === 'predict' ? '运行并对照输出' : '运行测试'}</h3>
    <div class="actions"><button id="run" class="accent">${policy().mode === 'direct' ? (t.kind === 'predict' ? '▷ 运行，答对后继续' : '▷ 运行测试，通过后继续') : copy.runLabel}</button><span class="status-text">已运行 ${history.length} 次</span></div>
    <div class="result" aria-live="polite">${renderChecks(result)}</div>
    <div class="completion-fields">${renderCompletionFields(result)}</div>
  </div><section class="task-navigation" aria-label="任务前进路径">${renderNextPath()}</section></section>
  ${t.id === 's0-branch' ? experimentMarkup() : ''}<div class="below-grid"><section class="panel"><details id="help-details" ${helpOpen ? 'open' : ''}><summary class="panel-head">需要帮助？<span class="muted">${assistanceOff ? '本题独立完成' : '有困难时展开即可'}</span></summary><div class="below-body">${assistanceOff ? '<div class="callout amber">这次请独立完成。可以查阅语言文档，请记录是否使用外部帮助；教师复核时会追问你的判断。</div>' : `<p>如果运行和理解都顺利，按本题完成方式继续即可。卡住时，先写下自己的猜测，再逐步展开提示。</p>${t.hints.slice(0, hints).map((h, i) => `<div class="hint"><strong>提示 ${i + 1}</strong> · ${esc(h)}</div>`).join('')}<button id="hint" ${hints >= t.hints.length ? 'disabled' : ''}>${hints >= t.hints.length ? '提示已全部展开' : '给我一点提示 +'}</button><hr><label><span class="field-label">向 AI 说明你卡在哪里</span><textarea id="ai-question" class="text-field" rows="2" placeholder="我认为……，但运行后……，下一步该检查什么？"></textarea></label><p class="muted">${data.ai ? '点击后将当前代码与问题发送给已配置的模型服务。AI 只提供提示，不自动修改代码。' : 'AI 服务未配置。分级提示仍可使用；不会模拟 AI 回答。'}</p><button id="ai" ${data.ai ? '' : 'disabled'}>请求 AI 提示</button><div class="ai-answer">${esc(aiAnswer)}</div>`}<div class="help-links">需要换个角度？<br><a href="https://codemuseum.freexlib.com" target="_blank" rel="noreferrer">CodeMuseum · 语言探索 ↗</a><a href="https://labs.freexlib.com/computer-lab" target="_blank" rel="noreferrer">xshow · 机器实验 ↗</a><br>外部资料不会自动判定本任务完成。</div></div></details></section>
  <section class="panel"><div class="panel-head">${t.kind === 'project' ? '工程操作' : '完成本题之后'}<span class="muted">${t.kind === 'project' ? '真实执行' : '先继续，再复核'}</span></div><div class="below-body">${t.kind === 'project' ? `<p class="path">工作区：${esc(data.projectPath)}</p><div class="actions"><button data-git="test">npm test</button><button data-git="status">git status</button><button data-git="diff">git diff</button><button data-git="log">git log</button></div><label><span class="field-label">提交说明</span><input id="commit-message" class="text-field" placeholder="fix: persist orders and correct summary"></label><button data-git="commit">创建 Git 提交</button><pre class="terminal">${esc(terminal || '$ 选择一项操作，查看真实测试与 Git 输出。')}</pre>` : '<p>基础练习会自动前进；概念题只做简短检查。你也可以留在本题或返回上一题，不需要展开提示。</p><p>同一阶段的最后一题会独立验证；完成后直接进入下一阶段。人工复核可以稍后进行。</p>'}${due(t) ? '<button id="retest">开始延迟复测</button>' : '<p class="muted">首次有效提交 7 天后开放延迟复测。</p>'}</div></section></div></div></div>`;
}
function bindFlowControls() {
  const nav = taskNavigation(data.tasks, task(), currentResult());
  document.querySelectorAll('[data-previous]').forEach(b => b.onclick = () => switchTask(nav.previous.id));
  document.querySelectorAll('[data-continue]').forEach(b => b.onclick = () => {
    if (!nav.completed) return;
    if (nav.next) switchTask(nav.next.id);
    else action(async () => { view = 'evidence'; await refresh(); });
  });
  document.querySelectorAll('[data-stay]').forEach(b => b.onclick = () => action(async () => { await post('/api/learning',{id:current,action:'pause'}); await refresh(); }));
}
function updateFlow() {
  const result = currentResult();
  $('.result').innerHTML = renderChecks(result);
  $('#learning-route').innerHTML = renderSteps();
  $('.task-navigation').innerHTML = renderNextPath();
  if ($('#submit')) $('#submit').disabled = running || !result?.passed || !completionSatisfied(policy().mode, draft());
  if ($('#submit-guidance')) $('#submit-guidance').textContent = submissionGuide(result);
  if ($('.check-feedback')) $('.check-feedback').textContent = result?.completion?.checkPassed === false ? '这个判断还不准确，请对照代码重新选择。' : result?.completion?.checkPassed ? '概念检查正确。' : '选择最符合代码行为的一项。';
  if ($('#shop-output')) $('#shop-output').innerHTML=renderShopOutput();
  bindFlowControls();
}
function renderRouteLog(){const route=data.state.route;if(!route)return '';return `<section class="panel"><div class="panel-head">JavaScript S0–S2 路线日志</div><div class="below-body"><p>${route.units.filter(u=>u.passed).length}/${route.units.length} 个单元考核通过</p>${Object.entries(route.stages).map(([stage,result])=>`<p>${stage} 综合考核：${result.passed?'通过':'待补练'}</p>`).join('')}${route.events.slice(-30).reverse().map(e=>`<p>${esc(e.kind)} · ${esc(e.unitId||e.stage||'')} · ${esc(e.at)}</p>`).join('')}</div></section><br>`;}
function renderUnitLog() {
  const unit=data.state.branchUnit;if(!unit)return '';
  return `<section class="panel"><div class="panel-head">条件分支能力单元<span class="muted">训练与考核分别记录</span></div><div class="below-body"><p>训练覆盖 ${unit.covered}/${unit.total} · ${unit.masteredAt?'本单元考核通过':'尚未通过本单元考核'}</p>${unit.exams.map(e=>`<p>独立考核：${!e.finished?'进行中 '+e.index+'/'+e.total:e.passed?'通过':'未通过，需要补练'} · ${esc(e.at)}</p>`).join('')}${unit.history.slice(-20).reverse().map(h=>`<p>${esc(h.skill)} · ${h.kind==='hint'?'使用提示':h.kind==='exam-answer'?'考核作答已记录':h.passed?'训练通过':'训练待补练'} · ${esc(h.at)}</p>`).join('')}</div></section><br>`;
}
function evidence() {
  const attempts = [...data.state.attempts].reverse();
  return `<div class="intro"><div><div class="eyebrow">${workspace==='teacher'?'LEARNING RECORDS':'YOUR LEARNING JOURNAL'}</div><h1>${workspace==='teacher'?'查看学习过程与考核表现。':'回看每一次尝试与进步。'}</h1><p>每次运行、提示使用和提交解释分别记录。</p></div><a class="button-link" href="/api/export" download>导出学习日志 JSON ↓</a></div><div class="callout amber">这里记录的是本机练习行为。测试通过不等于理解，关闭平台 AI 也不能证明没有使用外部帮助。记录按题型区分基础练习、简短检查和解释提交，基础练习不要求逐题解释。</div><br>${workspace==='student'?studentFeedbackMarkup(data.state.teaching,Boolean(data.state.route?.exam&&!data.state.route.exam.finished&&!data.state.route.exam.paused)):'<div class="actions"><button data-view="teaching">查看完整路线作答与教师跟进</button></div><br>'}${renderRouteLog()}${renderUnitLog()}<section class="panel table-wrap">${attempts.length ? `<table class="evidence-table"><thead><tr><th>任务 / 时间</th><th>结果</th><th>帮助</th><th>理解证据</th></tr></thead><tbody>${attempts.map(a => { const t = data.tasks.find(t => t.id === a.id), review = data.state.reviews[a.attemptId]; return `<tr><td><strong>${esc(t.title)}</strong><br><span class="muted">${new Date(a.at).toLocaleString('zh-CN')}</span><br><span class="muted">${a.sourceHash.slice(0, 12)}</span></td><td><span class="${a.passed ? 'passed' : 'failed'}">${a.passed ? '测试通过' : '待修复'}</span><br>${a.submitted ? '已提交' : '练习运行'}${a.retest ? ' · 延迟复测' : ''}</td><td>提示 ${a.hintsUsed} · AI ${a.aiUses}<br>${a.independent ? '独立任务，待核实' : '辅助训练'}</td><td>${esc(a.completion?.mode === 'direct' ? '基础练习，无需逐题解释' : a.completion?.mode === 'check' ? '简短检查：' + (a.completion.checkPassed === true ? '正确' : a.completion.checkPassed === false ? '待重新判断' : '尚未确认') + (a.completion.checkAnswer ? ' · ' + (t.completion?.choices?.find(c => c.id === a.completion.checkAnswer)?.text || a.completion.checkAnswer) : '') : a.explanation || '尚未填写解释')}<br><span class="muted">${a.review === 'not-required' ? '本题无需逐题人工复核' : review ? review.verdict === 'confirmed' ? '人工已记录理解证据' : '人工建议继续补练' : '解释尚未复核'}</span></td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">还没有运行记录。从 S0 的第一笔订单开始。</div>'}</section>`;
}
function pilot() {
  return `<div class="intro"><div><div class="eyebrow">PILOT OBSERVATION</div><h1>${data.state.participantKind === 'maintainer-selftrial' ? '维护者完整体验记录' : '记录真实的学习表现。'}</h1><p>一位学员一个数据目录；不填写虚构记录，不将测试结果代替试教。</p></div><a class="button-link" href="/api/export" download>导出本机试教与学习日志</a></div><section class="panel teaching-section"><div class="below-body"><h2>完整路线试教观察</h2><p>按能力单元或某次考核记录现场表现，观察会同步给学生，并可关联指定补练。</p><button data-view="teaching">进入完整路线学习详情</button></div></section><h2>体验路线观察</h2><section class="panel"><div class="below-body"><form id="pilot-form"><label class="field-label">观察关卡<select name="taskId" class="text-field">${data.tasks.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label class="field-label">观察类型<select name="kind" class="text-field"><option value="baseline">开始前基线</option><option value="difficulty">训练卡点</option><option value="transfer">陌生变式</option><option value="delayed">一周后复测</option></select></label><label class="field-label">实际表现<select name="outcome" class="text-field"><option value="not-observed">尚未观察到</option><option value="pass">展示了目标能力</option><option value="needs-practice">需要补练</option></select></label><label class="field-label">实际帮助<select name="help" class="text-field"><option value="none">没有帮助</option><option value="hint">教师或内置提示</option><option value="ai">AI 辅助</option><option value="external">外部材料或其他帮助</option></select></label><label class="field-label">具体观察<textarea name="note" class="text-field" rows="3" placeholder="记录原话、操作、出错位置和追问结果，避免只写“懂了”。"></textarea></label><button type="button" id="pilot-save" class="primary">保存观察</button></form></div></section><section class="panel"><div class="below-body">${(data.state.pilot||[]).length ? data.state.pilot.map(o=>`<p><strong>${esc(o.taskId)} · ${esc(o.kind)} · ${esc(o.outcome)}</strong><br>${esc(o.note)}<br><span class="muted">${esc(o.at)} · 帮助 ${esc(o.help)}</span></p>`).join('') : '<p>尚无真实试教记录。请在实际观察学生后填写。</p>'}</div></section>`;
}
function review() {
  const attempts = [...data.state.attempts].reverse().filter(a => a.submitted && a.passed && a.review !== 'not-required');
  return `<div class="intro"><div><div class="eyebrow">HUMAN REVIEW</div><h1>把“通过”变成可以追问的理解。</h1><p>完整路线按能力单元查看作答与补练；体验路线保留原有提交复核。</p></div></div><section class="panel teaching-section"><div class="below-body"><h2>完整路线补练复核</h2>${(data.state.teaching?.assignments||[]).filter(a=>a.status==='awaiting-review').map(a=>`<p>${esc(a.unitTitle)} · ${esc(a.concept)} <button data-teaching-unit="${a.unitId}">查看补练并追问</button></p>`).join('')||'<p>当前没有等待教师追问的指定补练。</p>'}<button data-view="teaching">查看全部能力单元</button></div></section><h2>体验路线提交复核</h2><div class="callout">复核建议：让学生解释关键分支 → 更换一组输入 → 指出一个反例 → 说明 AI 帮助了什么。不要只按解释字数评分。</div><br><section class="panel">${attempts.length ? attempts.map(a => { const r = data.state.reviews[a.attemptId]; return `<details class="review-card"><summary>${esc(data.tasks.find(t => t.id === a.id).title)} · ${new Date(a.at).toLocaleString('zh-CN')} · ${r ? '已有复核记录' : '待复核'}</summary><p><strong>学生解释：</strong>${esc(a.explanation)}</p><p class="muted">提示 ${a.hintsUsed} 次 · AI ${a.aiUses} 次 · 代码摘要 ${a.sourceHash}</p><pre>${esc(a.code || JSON.stringify(a.projectSnapshot || {}, null, 2))}</pre>${r ? `<div class="callout">${r.verdict === 'confirmed' ? '已记录理解证据' : '建议补练'}：${esc(r.note)}</div>` : ''}<div class="review-actions"><label><span class="field-label">现场观察与追问结果</span><textarea class="text-field" data-review-note="${a.attemptId}" rows="2" placeholder="学生能否解释、修改和验证？请记录具体表现。">${esc(r?.note || '')}</textarea></label><div class="actions"><button data-review="${a.attemptId}" data-verdict="confirmed">记录：已展示理解</button><button data-review="${a.attemptId}" data-verdict="needs-practice">记录：需要补练</button></div></div></details>`; }).join('') : '<div class="empty">学生提交通过后，在这里复核代码与解释。</div>'}</section>`;
}
function render() {
  viewController?.dispose();viewController=null;
  view=workspacePage(workspace,view);
  $('#app').innerHTML = layout(view === 'teaching' ? teachingMarkup() : view === 'overview' ? teacherOverview(data) : view === 'route' ? routeMarkup() : view === 'unit' ? unitMarkup() : view === 'learn' ? learn() : view === 'evidence' ? evidence() : view === 'pilot' ? pilot() : review());
  bind();
  restoreWorkspaceDraft();
  if (running) document.querySelectorAll('button').forEach(b => b.disabled = true);
}
async function action(fn) {
  if (running) return;
  cancelAdvance();
  running = true; document.querySelectorAll('button,input,textarea').forEach(b => b.disabled = true);
  try { await flush(); await fn(); }
  catch (e) { toast(e.message); }
  finally { running = false; render(); }
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => navigateWorkspace(workspace,b.dataset.view));
  document.querySelectorAll('[data-teaching-unit]').forEach(b=>b.onclick=()=>{teacherUnit=b.dataset.teachingUnit;navigateWorkspace('teacher','teaching');});
  document.querySelectorAll('[data-teacher-practice]').forEach(b=>b.onclick=()=>{pendingTeacherAssignment=b.dataset.teacherPractice;navigateWorkspace('student','route');});
  document.querySelectorAll('[data-workspace-switch]').forEach(b=>b.onclick=()=>navigateWorkspace(b.dataset.workspaceSwitch));
  document.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => switchTask(data.tasks.find(t => t.stage === b.dataset.stage && !submitted(t).length)?.id || data.tasks.find(t => t.stage === b.dataset.stage).id));
  document.querySelectorAll('[data-task]').forEach(b => b.onclick = () => switchTask(b.dataset.task));
  if(view==='teaching'){viewController=bindTeaching({unitId:teacherUnit,onUnitChange:id=>{teacherUnit=id;localStorage.setItem('devlabs-teacher-unit',id);}});return;}
  if(view==='route'){viewController=bindRoute({assignmentId:pendingTeacherAssignment,labId:pendingLab});pendingTeacherAssignment=null;pendingLab=null;return;}
  if(view==='unit'){bindUnit();return;}
  if (view === 'pilot') {
    $('#pilot-save').onclick=()=>{const values=Object.fromEntries(new FormData($('#pilot-form')));action(async()=>{await post('/api/pilot',values);workspaceDrafts.delete('pilot');await refresh();toast('已保存真实观察记录');});};return;
  }
  if (view !== 'learn') {
    document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => action(async () => { await post('/api/review', { attemptId: b.dataset.review, verdict: b.dataset.verdict, note: document.querySelector(`[data-review-note="${b.dataset.review}"]`).value }); workspaceDrafts.delete('review'); await refresh(); toast('已记录人工复核'); })); return;
  }
  bindFlowControls();
  bindExperiment(current);
  $('#help-details').ontoggle = e => { helpOpen = e.target.open; };
  document.querySelectorAll('[data-file]').forEach(b => b.onclick = () => action(async () => { selectedFile = b.dataset.file; }));
  $('#code').oninput = e => {
    if (task().kind === 'project') { data.project[selectedFile] = e.target.value; dirtyFiles.set(selectedFile, e.target.value); }
    else draft().code = e.target.value;
    cancelAdvance(); latest = null; updateFlow(); $('.line-numbers').textContent = Array.from({ length: e.target.value.split('\n').length }, (_, i) => i + 1).join('\n'); scheduleSave();
  };
  $('#code').onkeydown = e => { if (e.key === 'Tab' && !e.target.readOnly) { e.preventDefault(); const el = e.target; el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input')); } };
  for (const field of ['prediction', 'explanation']) if ($('#' + field)) $('#' + field).oninput = e => { cancelAdvance(); draft()[field] = e.target.value; updateFlow(); scheduleSave(); };
  document.querySelectorAll('[name="check-answer"]').forEach(input => input.onchange = e => { cancelAdvance(); draft().checkAnswer = e.target.value; updateFlow(); scheduleSave(); });
  for (const kind of ['run', 'submit']) if ($('#' + kind)) $('#' + kind).onclick = async () => {
    let result;
    await action(async () => { latest = result = await post('/api/run', { id: current, ...draft(), submit: kind === 'submit', requestId: crypto.randomUUID() }); await refresh(); });
    if (result) {
      if (result.passed && !result.submitted && policy().mode !== 'direct') focusCompletionStep();
      else {
        const target = result.submitted && !canAutoAdvance(result) ? $('.task-navigation') : $('.result');
        target?.scrollIntoView({ block: 'center' });
      }
      scheduleAdvance(result);
    }
  };
  if ($('#hint')) $('#hint').onclick = () => action(async () => { await post('/api/hint', { id: current }); await refresh(); });
  if ($('#ai')) $('#ai').onclick = () => { const question = $('#ai-question').value; action(async () => { const result = await post('/api/ai', { id: current, code: draft().code, question }); aiAnswer = result.answer + '\n\n' + result.note; await refresh(); }); };
  if ($('#reset-code')) $('#reset-code').onclick = () => { if (!confirm('恢复当前代码会替换你的编辑，已有运行证据会保留。继续？')) return; action(async () => {
    if (task().kind === 'project') { const response = await fetch(`/api/template?file=${encodeURIComponent(selectedFile)}`); const value = await response.json(); if (!response.ok) throw new Error(value.error); data.project[selectedFile] = value.content; dirtyFiles.set(selectedFile, value.content); await flush(); }
    else { draft().code = task().starter; draft().prediction = ''; await flush(); }
    latest = null;
  }); };
  document.querySelectorAll('[data-git]').forEach(b => b.onclick = () => { const message = $('#commit-message')?.value; action(async () => { const result = await post('/api/git', { action: b.dataset.git, message }); terminal = `$ ${b.dataset.git === 'test' ? 'npm test' : 'git ' + b.dataset.git}\n${result.output || '(无变更)'}\n退出码：${result.code}`; }); });
  if ($('#retest')) $('#retest').onclick = () => action(async () => { await post('/api/retest', { id: current }); if (task().kind !== 'project') { draftMemory[current] = { code: task().starter, prediction: '', explanation: '', checkAnswer: '' }; await flush(); } latest = null; helpOpen = false; await refresh(); toast('延迟复测已开始，请独立完成'); });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && pendingAdvance) { cancelAdvance(); if (data && view === 'learn') updateFlow(); } });
async function switchTask(id) { await action(async () => { await post('/api/learning',{id,action:'enter'}); current = id; selectedFile = data.tasks.find(t => t.id === id).file || ''; latest = null; aiAnswer = ''; helpOpen = false; localStorage.setItem('devlabs-current', id); }); showArrival('next'); }
try {
  await refresh();
  if (!data.state.attempts.length && !Object.keys(data.state.drafts).length) current = data.tasks[0].id;
  const arrival = resumeJourney(data.tasks, data.state, data.state.activeTaskId || current);
  current = arrival.taskId; localStorage.setItem('devlabs-current', current);
  selectedFile = task().file || '';
  if(view==='learn') await post('/api/learning',{id:current,action:'enter'});
  if (arrival.reason === 'complete' && view==='learn') view = 'evidence';
  render();
  if (view==='learn' && arrival.transition) showStageTransition(arrival.transition);
  else if (view === 'learn') showArrival(arrival.reason);
} catch (e) { $('#app').innerHTML = `<p class="loading">启动失败：${esc(e.message)}。请刷新重试，并确认本机服务正在运行。</p>`; }

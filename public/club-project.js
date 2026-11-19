import { bindCodeEditor } from './code-editor.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function activityMarkup(activity) {
  if (!activity || !Array.isArray(activity.confirmed) || !Array.isArray(activity.waiting)) {
    return '<p>程序没有返回可显示的报名名单，请检查运行结果。</p>';
  }
  return `<dl class="club-roster" tabindex="-1">
    <div><dt>剩余名额</dt><dd>${esc(activity.capacity - activity.confirmed.length)}</dd></div>
    <div><dt>正式名单</dt><dd>${esc(activity.confirmed.join('、') || '空')}</dd></div>
    <div><dt>候补名单</dt><dd>${esc(activity.waiting.join('、') || '空')}</dd></div>
  </dl>`;
}

const field = (name, label, values, placeholder = '') =>
  `<label><span class="field-label">${label}</span><input class="text-field" name="${name}" value="${esc(values?.[name])}" placeholder="${esc(placeholder)}"></label>`;

function resultMarkup(result) {
  if (!result) return '';
  return `<div id="club-check-result" class="callout ${result.passed ? '' : 'amber'}"><strong>${result.passed ? '检查通过' : '还有检查未通过'}</strong>
    ${result.error ? `<p>${esc(result.error)}</p>` : ''}
    <ul>${result.checks.map(check => `<li>${check.passed ? '通过' : '未通过'} · ${esc(check.name)}
      ${!check.passed ? `<details><summary>查看预期和实际</summary><pre>${esc(JSON.stringify({输入:check.args,预期:check.expected,实际:check.actual,错误:check.error},null,2))}</pre></details>` : ''}</li>`).join('')}</ul></div>`;
}

function trialMarkup(trial) {
  if (!trial) return '';
  if (trial.inputError) return `<div id="club-trial-result" class="callout amber">${esc(trial.inputError)}</div>`;
  const message = !trial.expectedValid ? '预期名单与规则不一致，请核对候补顺序。'
    : !trial.retained ? '这个输入没有暴露原来的问题。试着加入候补者。'
    : trial.passed ? '反例已保存。当前代码已通过这组输入。' : '反例已保存。请修复后再验证。';
  return `<div id="club-trial-result" class="callout"><strong>${message}</strong>
    <p>你的预期</p>${activityMarkup(trial.expected)}
    <p>初始代码</p>${activityMarkup(trial.baseline)}
    <p>当前代码</p>${activityMarkup(trial.current)}
    ${trial.error ? `<p>${esc(trial.error)}</p>` : ''}</div>`;
}

const hints = [
  ['先比较“剩余名额”和名单。小林报名后，正式人数会是多少？',
   '报名后人数恰好等于上限仍然合法。检查 signUp 里有没有把等于排除。'],
  ['先复现。让正式名单有人取消，并在候补里放两个人。谁应该转正？谁应该留下？',
   '先比较取消前后的正式人数，确认确实有人退出。然后取候补的第一项，分别更新两个名单。']
];

function hintMarkup(step, level) {
  const available = hints[step];
  return `<div class="club-hints">${available.slice(0, level).map(text => `<p>${text}</p>`).join('')}
    ${level < available.length ? `<button data-club-action="hint">${level ? '再看一个提示' : '卡住了？看一个提示'}</button>` : ''}</div>`;
}

function markup(project) {
  const { step, tasks, code, form, result } = project;
  return `<div class="intro"><div><h1>社团活动报名与候补</h1><p>接手一个已经能运行的报名工具，把本次修改交给下一位同学。</p></div></div>
    <ol class="club-steps" aria-label="项目进度">${tasks.map((title,i) =>
      `<li class="${i < step ? 'done' : i === step ? 'active' : ''}" ${i===step ? 'aria-current="step"' : ''}>${esc(title)}<small>${i < step ? '已完成' : i===step ? '进行中' : '待开始'}</small></li>`).join('')}</ol>
    <section class="panel"><div class="below-body club-body">
    ${step === 3 ? `<h2>项目改动已交付</h2><p>Git 提交 <code>${esc(project.commit)}</code>。交付说明与回归用例已和代码一起保存。</p><details><summary>本机练习仓库</summary><p class="path">${esc(project.directory)}</p></details><button class="primary" data-workspace-route>继续学习路线</button>`
    : `<h2 tabindex="-1" id="club-task-title">${esc(tasks[step])}</h2>
      ${step === 0 ? `<p>活动上限 2 人，已有阿青报名。小林应该能报上最后一个名额。点击下方按钮看看当前程序会怎么处理。</p>
        ${activityMarkup(project.preview)}<p class="muted">${result ? '这是报名函数对“小林报名”的实际输出。' : '这是小林报名之前的名单。'}</p>
        <button data-club-action="signup" data-club-preview class="primary">试一次：小林报名</button>`
      : step === 1 ? `<p>正式名单有人取消时，候补队列的第一人转正，其余人保持原顺序。没有候补时只移除取消者。</p>
        <fieldset class="club-fields"><legend>构造一组满员后的取消情景</legend>
          <p class="muted">姓名用逗号隔开。名单为空时留空。</p>
          ${field('confirmed','取消前正式名单',form,'例如：阿青，小林')}
          ${field('waiting','取消前候补名单',form,'例如：小周，小许')}
          ${field('cancelName','谁取消报名',form)}
          ${field('expectedConfirmed','预期正式名单',form)}
          ${field('expectedWaiting','预期候补名单',form)}
          <button data-club-action="trial">试运行反例</button>
        </fieldset>${trialMarkup(project.trial)}`
      : `<p>在同一仓库跑回归、检查改动，并写下别人可以照做的复查步骤。</p>
        <div class="actions"><button data-club-action="validate">运行回归检查</button><button data-club-action="diff">查看 Git 差异</button></div>
        ${project.diff !== undefined ? `<pre class="terminal">${esc(project.diff || '没有代码差异。')}</pre>` : ''}
        <div class="club-fields">${field('summary','改了什么',project.deliveryDraft)}
        <label><span class="field-label">怎么复现与核对</span><textarea rows="4" class="text-field" name="reproduction" maxlength="600">${esc(project.deliveryDraft?.reproduction)}</textarea></label></div>
        <button class="primary" data-club-action="deliver">创建 Git 提交并交付</button>
        <details><summary>本机练习仓库</summary><p class="path">${esc(project.directory)}</p></details>`}
      ${step<2 ? `<div class="editor-toolbar"><strong>signup.cjs</strong><span id="club-save-status" role="status">草稿会自动保存</span></div>
        <div><textarea class="text-field" rows="14" id="club-code" aria-label="编辑报名规则" spellcheck="false">${esc(code)}</textarea></div>
        ${hintMarkup(step, project.hints?.[step] || 0)}
        <div class="actions"><button class="primary" data-club-action="${step===0 ? 'signup' : 'validate'}">${step===0 ? '运行并检查报名' : '运行正式检查'}</button>
        ${result?.passed ? `<button data-club-action="next">继续：${esc(tasks[step+1])}</button>` : ''}</div>` : ''}${resultMarkup(result)}`}
    ${project.feedback?.length ? `<section class="callout"><h3>老师的反馈</h3>${project.feedback.slice().reverse().map(item=>`<p><strong>${esc(item.teacher)}</strong> · ${esc(item.note)}</p>`).join('')}</section>` : ''}
    <p id="club-error" role="alert"></p></div></section>`;
}

export function bindClub({ post, onRoute }) {
  const root = document.querySelector('#club-root');
  let project, disposed = false, busy = false, dirty = false, timer, cleanupEditor;

  function paint() {
    cleanupEditor?.();
    root.innerHTML = markup(project);
    const editor = root.querySelector('#club-code');
    if (editor) {
      const controller = bindCodeEditor(editor);
      cleanupEditor = () => controller?.dispose();
    }
    root.querySelectorAll('[data-club-action]').forEach(button =>
      button.addEventListener('click', () => perform(button.dataset.clubAction, button.hasAttribute('data-club-preview'))));
    root.querySelector('[data-workspace-route]')?.addEventListener('click', onRoute);
  }

  function collect() {
    const values = Object.fromEntries([...root.querySelectorAll('[name]')].map(field => [field.name, field.value]));
    return { step: project.step, code: root.querySelector('#club-code')?.value, form: values, ...values };
  }

  async function save() {
    clearTimeout(timer);
    if (!dirty || busy || disposed) return;
    const body = collect();
    dirty = false;
    try {
      await post('/api/club-project', { ...body, action: 'save' });
      if (!dirty && !disposed && !busy) {
        const label = root.querySelector('#club-save-status');
        if (label) label.textContent = '已保存到本机';
      }
    } catch (error) {
      dirty = true;
      throw error;
    }
  }

  function report(error) {
    const target = root.querySelector('#club-error') || root;
    if (!disposed) target.textContent = error.message;
  }

  async function perform(action, preview) {
    if (busy) return;
    clearTimeout(timer);
    const body = collect(), step = project.step;
    root.querySelectorAll('button,input,textarea').forEach(element => element.disabled = true);
    busy = true;
    try {
      project = await post('/api/club-project', { ...body, action });
      dirty = false;
      if (disposed) return;
      paint();
      if (project.step !== step) {
        const heading = root.querySelector('#club-task-title') || root.querySelector('h2');
        heading.tabIndex = -1;
        heading.focus();
        heading.scrollIntoView({ block: 'center' });
      } else {
        const checked = root.querySelector(preview ? '.club-roster' : action === 'trial' ? '#club-trial-result' : action === 'hint' ? '.club-hints' : '#club-check-result');
        if (checked && ['trial', 'signup', 'validate', 'next', 'deliver', 'hint'].includes(action)) {
          checked.tabIndex = -1;
          checked.focus({ preventScroll: true });
          checked.scrollIntoView({ block: 'nearest' });
        } else root.querySelector('[data-club-action="' + action + '"]')?.focus({ preventScroll: true });
      }
    } catch (error) {
      report(error);
    } finally {
      busy = false;
      if (!disposed) root.querySelectorAll('button,input,textarea').forEach(element => element.disabled = false);
    }
  }

  root.addEventListener('input', () => {
    dirty = true;
    if (project.step < 2) {
      root.querySelector('[data-club-action="next"]')?.remove();
      root.querySelector('#club-check-result')?.remove();
    }
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(report), 450);
  });
  post('/api/club-project', { action: 'open' }).then(value => {
    if (!disposed) { project = value; paint(); }
  }).catch(report);
  return {
    async beforeLeave() {
      if (busy) throw new Error('项目正在运行，请等结果返回。');
      await save();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      cleanupEditor?.();
    }
  };
}

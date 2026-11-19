import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const files = ['signup.cjs', 'check.cjs', 'README.md'];
const event = (capacity, confirmed, waiting = []) => ({ capacity, confirmed, waiting });
const sample = event(2, ['阿青']);
const signupCases = [
  { name: '最后一个名额', args: [sample, '小林'], expected: event(2, ['阿青', '小林']) },
  { name: '满员后加入候补', args: [event(1, ['阿青']), '小林'], expected: event(1, ['阿青'], ['小林']) },
  { name: '还有多个名额', args: [event(4, ['阿青']), '小林'], expected: event(4, ['阿青', '小林']) }
];

function observe(progress, action, outcome, detail = '') {
  progress.observations ||= [];
  progress.observations.push({ step: progress.step, action, outcome, detail, at: new Date().toISOString() });
  if (progress.observations.length > 80) progress.observations.shift();
}

export const clubTasks = ['修好最后一个名额', '取消报名后递补', '交付可复查的改动'];

function cancelCase(activity, name) {
  const confirmed = activity.confirmed.filter(person => person !== name);
  const waiting = [...activity.waiting];
  if (confirmed.length < activity.confirmed.length && waiting.length) confirmed.push(waiting.shift());
  return { name: '取消与候补递补', args: [activity, name], expected: event(activity.capacity, confirmed, waiting) };
}

const cancelCases = [
  cancelCase(event(2, ['小雨', '周周'], ['阿青', '小林']), '小雨'),
  cancelCase(event(1, ['阿青']), '阿青'),
  cancelCase(event(1, ['阿青'], ['小林']), '小周')
];

function studentCase(body) {
  const parseNames = value => String(value ?? '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
  const confirmed = parseNames(body.confirmed), waiting = parseNames(body.waiting);
  const name = String(body.cancelName ?? '').trim();
  const expectedConfirmed = parseNames(body.expectedConfirmed);
  const expectedWaiting = parseNames(body.expectedWaiting);
  const names = [...confirmed, ...waiting];
  if (!confirmed.length || names.length > 12 || names.some(s => s.length > 30) || new Set(names).size !== names.length || !confirmed.includes(name)) {
    throw new Error('请填写互不重复的正式与候补名单，并从正式名单中选一人取消。最多 12 人。');
  }
  const entry = cancelCase(event(confirmed.length, confirmed, waiting), name);
  return { ...entry, name: '你的回归反例', expected: event(confirmed.length, expectedConfirmed, expectedWaiting), contract: entry.expected };
}

export function createClubProject({ directory, template, command, evaluate }) {
  const signupPath = path.join(directory, 'signup.cjs');
  const git = (...args) => command('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory });
  async function mustGit(...args) {
    const result = await git(...args);
    if (result.code !== 0) throw new Error(result.output.trim() || 'Git 操作失败');
    return result.output.trim();
  }

  async function open() {
    await fs.mkdir(directory, { recursive: true });
    for (const file of files) {
      try { await fs.copyFile(path.join(template, file), path.join(directory, file), fs.constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const head = await git('rev-parse', '--verify', 'HEAD');
    if (head.code !== 0) {
      await mustGit('init', '-b', 'main');
      await mustGit('config', 'user.name', 'DevLabs Learner');
      await mustGit('config', 'user.email', 'learner@devlabs.local');
      await mustGit('add', '--', ...files);
      await mustGit('commit', '-m', 'chore: start club signup exercise');
    }
  }

  const run = (code, fn, cases) => evaluate({ kind: 'function', fn, cases }, { code });

  async function regressions(code, regression) {
    const signup = await run(code, 'signUp', signupCases);
    if (!regression) return signup;
    const cancel = await run(code, 'cancel', [...cancelCases, regression]);
    return { passed: signup.passed && cancel.passed, checks: [...signup.checks, ...cancel.checks], error: signup.error || cancel.error };
  }

  return async function handle(state, body) {
    await open();
    const progress = state.clubProject ||= { step: 0, startedAt: new Date().toISOString() };
    if (body.action === 'open') {
      if (progress.preview === undefined) progress.preview = sample;
    } else {
      if (body.step !== progress.step) throw new Error('任务进度已改变，请重新打开项目。');
      const allowed = [
        ['signup', 'next', 'save', 'hint'],
        ['trial', 'validate', 'next', 'save', 'hint'],
        ['validate', 'diff', 'deliver', 'save'],
        []
      ];
      if (!allowed[progress.step].includes(body.action)) throw new Error('当前任务无法执行此操作。');
      const editable = progress.step < 2;
      if (progress.step === 2 && body.form) {
        progress.deliveryDraft = {
          summary: String(body.form.summary ?? '').slice(0, 250),
          reproduction: String(body.form.reproduction ?? '').slice(0, 600)
        };
      }
      if (editable && typeof body.code === 'string') {
        if (body.code.length > 16000) throw new Error('代码不能超过 16000 字符。');
        if (await fs.readFile(signupPath, 'utf8') !== body.code) {
          await fs.writeFile(signupPath, body.code);
          progress.result = null;
          if (progress.step === 0) progress.preview = sample;
        }
      }
      if (editable && body.form) progress.form = Object.fromEntries(
        ['confirmed', 'waiting', 'cancelName', 'expectedConfirmed', 'expectedWaiting']
          .map(key => [key, String(body.form[key] ?? '').slice(0, 450)])
      );
      const code = await fs.readFile(signupPath, 'utf8');
      switch (body.action) {
        case 'save':
          break;
        case 'hint': {
          progress.hints ||= {};
          progress.hints[progress.step] = Math.min(2, (progress.hints[progress.step] || 0) + 1);
          observe(progress, 'hint', 'shown', '第 ' + progress.hints[progress.step] + ' 条提示');
          break;
        }
        case 'signup': {
          if (progress.step !== 0) throw new Error('当前任务不是报名边界。');
          progress.result = await regressions(code);
          progress.preview = progress.result.checks[0]?.actual ?? null;
          observe(progress, 'signup', progress.result.passed ? 'passed' : 'failed',
            progress.result.error ? '代码无法执行' : progress.result.checks.find(check => !check.passed)?.name);
          if (progress.result.passed) progress.signupPassedAt ||= new Date().toISOString();
          break;
        }
        case 'trial': {
          if (progress.step !== 1) throw new Error('当前任务不接收取消反例。');
          let parsed;
          try { parsed = studentCase(progress.form || {}); }
          catch (error) {
            progress.trial = { inputError: error.message };
            observe(progress, 'trial', 'invalid-input');
            break;
          }
          const { contract, ...test } = parsed;
          const starter = await fs.readFile(path.join(template, 'signup.cjs'), 'utf8');
          const baseline = await run(starter, 'cancel', [test]);
          const current = await run(code, 'cancel', [test]);
          const expectedValid = isDeepStrictEqual(test.expected, contract);
          const retained = expectedValid && baseline.checks.length === 1 && !baseline.checks[0].passed;
          progress.trial = { expectedValid, retained, expected: test.expected, baseline: baseline.checks[0]?.actual, current: current.checks[0]?.actual, passed: current.passed, error: current.error };
          observe(progress, 'trial', !expectedValid ? 'wrong-expectation' : !retained ? 'no-defect' : current.passed ? 'passed' : 'reproduced');
          if (retained) {
            await fs.writeFile(path.join(directory, 'regression.json'), JSON.stringify(test, null, 2) + '\n');
            progress.regression = test;
          }
          break;
        }
        case 'validate':
        case 'next': {
          if (body.action === 'next' && !editable) throw new Error('已进入交付。');
          if (progress.step > 0 && !progress.regression) throw new Error('请先试运行并保存一个有效的递补反例。');
          const result = await regressions(code, progress.regression);
          progress.result = result;
          observe(progress, body.action, result.passed ? 'passed' : 'failed',
            result.error ? '代码无法执行' : result.checks.find(check => !check.passed)?.name);
          if (body.action === 'next' && result.passed) {
            if (progress.step === 0) {
              progress.signupPassedAt ||= new Date().toISOString();
              progress.secondStartedAt ||= new Date().toISOString();
            }
            progress.step += 1;
            progress.result = null;
            progress.advancedAt = new Date().toISOString();
          }
          break;
        }
        case 'diff': {
          if (progress.step < 2) throw new Error('完成两项修复后可以查看交付差异。');
          const base = (await mustGit('rev-list', '--max-parents=0', 'HEAD')).split('\n')[0];
          const sourceDiff = await mustGit('diff', '--no-ext-diff', base, '--', 'signup.cjs');
          const regression = await git('diff', '--no-ext-diff', '--no-index', '--', '/dev/null', 'regression.json');
          progress.diff = [sourceDiff, regression.code === 1 ? regression.output.trim() : ''].filter(Boolean).join('\n\n');
          break;
        }
        case 'deliver': {
          if (progress.step !== 2) throw new Error('当前任务不接收交付。');
          const summary = String(body.summary || '').trim().slice(0, 250);
          const reproduction = String(body.reproduction || '').trim().slice(0, 600);
          if (!summary || !reproduction) throw new Error('请填写改动说明和复现步骤。');
          progress.result = await regressions(code, progress.regression);
          observe(progress, 'deliver', progress.result.passed ? 'passed' : 'failed',
            progress.result.checks.find(check => !check.passed)?.name);
          if (!progress.result.passed) break;
          await fs.writeFile(path.join(directory, 'DELIVERY.md'), '# 交付说明\n\n' + summary + '\n\n## 如何复查\n\n' + reproduction + '\n\n运行 node check.cjs 可执行报名边界与自建回归。\n');
          await mustGit('add', '--', 'signup.cjs', 'regression.json', 'DELIVERY.md');
          const staged = await git('diff', '--cached', '--quiet');
          if (staged.code === 1) await mustGit('commit', '-m', 'fix: verify club signup and waitlist');
          else if (staged.code !== 0) throw new Error(staged.output || '无法检查暂存改动。');
          progress.commit = await mustGit('rev-parse', '--short', 'HEAD');
          progress.step = 3;
          progress.deliveredAt = new Date().toISOString();
          break;
        }
        default: throw new Error('未知的项目操作。');
      }
    }
    return { ...progress, code: await fs.readFile(signupPath, 'utf8'), directory, tasks: clubTasks };
  };
}
